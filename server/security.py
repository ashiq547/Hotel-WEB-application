"""JWT, bcrypt, authoritative roles and compatible session tables."""
import hashlib
import os
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from db import get_db

PRODUCTION = os.getenv('NODE_ENV') == 'production'
SECRET = os.getenv('JWT_SECRET') or (None if PRODUCTION else 'dev_only_insecure_jwt_secret_change_me')
if not SECRET:
    raise RuntimeError('JWT_SECRET environment variable must be set')
PEPPER = os.getenv('PEPPER') or os.getenv('JWT_SECRET') or 'dev_only_insecure_pepper_change_me'
COOKIE = 'hms_refresh'

def fail(status, message):
    raise HTTPException(status, message)

def hash_password(plain):
    # Preserve existing hashes by truncating UTF-8 input to 72 bytes, including the pepper.
    return bcrypt.hashpw((str(plain) + PEPPER).encode()[:72], bcrypt.gensalt(int(os.getenv('BCRYPT_ROUNDS', '10')))).decode()

def verify_password(plain, stored):
    if not stored:
        return False
    if re.match(r'^\$2[aby]\$', stored):
        try:
            return bcrypt.checkpw((str(plain) + PEPPER).encode()[:72], stored.encode())
        except ValueError:
            return False
    return secrets.compare_digest(str(plain), stored)

def token(user):
    ttl = os.getenv('JWT_EXPIRES_IN', '15m')
    match = re.fullmatch(r'(\d+)([smhd]?)', ttl)
    if not match:
        raise RuntimeError('JWT_EXPIRES_IN must be seconds or a duration such as 15m')
    seconds = int(match[1]) * {'': 1, 's': 1, 'm': 60, 'h': 3600, 'd': 86400}[match[2]]
    now = datetime.now(timezone.utc)
    return jwt.encode({**user, 'iat': now, 'exp': now + timedelta(seconds=seconds)}, SECRET, algorithm='HS256')

_tables_ready = False
_members_ready = False
_schema_lock = threading.RLock()

def ensure_tables(db):
    global _tables_ready
    with _schema_lock:
        if _tables_ready:
            return
        _create_tables(db)
        _tables_ready = True

def _create_tables(db):
    db.query('''CREATE TABLE IF NOT EXISTS User_Account (
      User_Account_ID INT AUTO_INCREMENT PRIMARY KEY, User_Type VARCHAR(20) NOT NULL,
      User_Ref_ID INT NOT NULL, Role VARCHAR(30) NOT NULL DEFAULT 'Guest', Banned TINYINT(1) NOT NULL DEFAULT 0,
      Banned_At DATETIME NULL, Ban_Reason VARCHAR(255) NULL, Banned_By INT NULL,
      UNIQUE KEY uniq_account (User_Type, User_Ref_ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
    db.query('''CREATE TABLE IF NOT EXISTS Refresh_Token (
      Token_ID INT AUTO_INCREMENT PRIMARY KEY, User_Type VARCHAR(20) NOT NULL, User_ID INT NOT NULL,
      Token_Hash CHAR(64) NOT NULL UNIQUE, User_Agent VARCHAR(255), IP_Address VARCHAR(64),
      Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP, Last_Used_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      Expires_At DATETIME NOT NULL, Revoked_At DATETIME NULL, Replaced_By CHAR(64) NULL,
      INDEX idx_user (User_Type, User_ID), INDEX idx_hash (Token_Hash)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

def ensure_members(db):
    global _members_ready
    with _schema_lock:
        if _members_ready:
            return
        _create_members(db)
        _members_ready = True

def _create_members(db):
    db.query('''CREATE TABLE IF NOT EXISTS Hotel_Member (
      Member_ID INT AUTO_INCREMENT PRIMARY KEY, Hotel_ID INT NOT NULL, Employee_ID INT NOT NULL,
      Member_Role VARCHAR(30) NOT NULL DEFAULT 'Member', Added_By INT NULL,
      Added_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_member (Hotel_ID, Employee_ID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

def user_type(user):
    return user.get('type') or ('Guest' if user['role'].lower() == 'guest' else 'Employee')

def account(db, typ, ident, default=None):
    ensure_tables(db)
    if default:
        db.query('INSERT IGNORE INTO User_Account (User_Type, User_Ref_ID, Role) VALUES (?, ?, ?)', [typ, ident, default])
    return db.one('SELECT * FROM User_Account WHERE User_Type = ? AND User_Ref_ID = ?', [typ, ident])

# Generated from the previous server's permission map for exact role compatibility.
import json
from pathlib import Path
ROLES = json.loads(Path(__file__).with_name('permissions.json').read_text())

def current_user(request: Request, db=Depends(get_db, scope="function")):
    auth = request.headers.get('authorization', '')
    if not auth.startswith('Bearer ') or not auth[7:].strip():
        fail(401, 'Access token required')
    try:
        user = jwt.decode(auth[7:].strip(), SECRET, algorithms=['HS256'])
        if 'id' not in user or not user.get('role'):
            raise ValueError()
    except (jwt.PyJWTError, ValueError):
        fail(401, 'Invalid, tampered or expired token')
    typ = user_type(user)
    row = account(db, typ, user['id'])
    if row and row['Banned']:
        fail(403, 'Your account is banned')
    user['type'] = typ
    user['role'] = row['Role'] if row else user['role']
    return user

def permit(*permissions):
    def check(user=Depends(current_user)):
        if not set(permissions).intersection(ROLES.get(user['role'], [])):
            fail(403, 'Access forbidden: insufficient permissions')
        return user
    return check

def own(user, ident, label='Not found'):
    if user_type(user) == 'Guest' and int(user['id']) != int(ident):
        fail(404, label)

def hotel_guard(db, user, hotel_id, manager=False):
    if user_type(user) == 'Guest':
        fail(403, 'Staff access required')
    if user['role'] == 'Admin':
        return
    ensure_members(db)
    row = db.one('SELECT Member_Role FROM Hotel_Member WHERE Hotel_ID = ? AND Employee_ID = ?', [hotel_id, user['id']])
    if not row:
        fail(404, 'Hotel not found')
    if manager and row['Member_Role'] != 'Manager':
        fail(403, 'Only the hotel owner or a manager-member can perform this action')

def digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()

def new_session(db, typ, ident, request, response):
    ensure_tables(db)
    raw = secrets.token_hex(32)
    expires = datetime.now(timezone.utc) + timedelta(days=int(os.getenv('REFRESH_TTL_DAYS', '7')))
    db.insert('Refresh_Token', {'User_Type': typ, 'User_ID': ident, 'Token_Hash': digest(raw),
      'User_Agent': request.headers.get('user-agent', '')[:255], 'IP_Address': (request.client.host if request.client else '')[:64],
      'Expires_At': expires.replace(tzinfo=None)})
    response.set_cookie(COOKIE, raw, expires=expires, httponly=True, secure=PRODUCTION, samesite='lax', path='/api/auth')
    return digest(raw)

def clear_cookie(response):
    response.delete_cookie(COOKIE, path='/api/auth')

def revoke_all(db, typ, ident):
    ensure_tables(db)
    return db.query('UPDATE Refresh_Token SET Revoked_At = NOW() WHERE User_Type = ? AND User_ID = ? AND Revoked_At IS NULL', [typ, ident])['affectedRows']
