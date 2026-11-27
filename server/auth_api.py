import re
import time
from datetime import datetime
from fastapi import APIRouter, Depends, Request, Response, Body
from fastapi.responses import JSONResponse
from db import get_db
from security import (account, current_user, permit, user_type, own, fail, hash_password,
                      verify_password, token, new_session, clear_cookie, revoke_all, digest, COOKIE, ensure_tables)

router = APIRouter(prefix='/api/auth', tags=['Authentication'])
failed_attempts = {}

def public_user(db, typ, row):
    ident = row[typ + '_ID']
    a = account(db, typ, ident)
    if a and a['Banned']:
        fail(403, 'Your account is banned')
    role = a['Role'] if a else ('Guest' if typ == 'Guest' else row.get('Role') or row.get('Designation') or 'Receptionist')
    return {'id': ident, 'role': role, 'type': typ, 'name': row['Full_Name'],
            'username': (row.get('Email') or row.get('Phone_Number')) if typ == 'Guest' else (row.get('Username') or row.get('Email'))}

def login_impl(body, request, response, db, typ):
    key = 'emailOrUsername' if typ == 'Guest' else 'username'
    if not body.get(key) or not body.get('password'):
        fail(400, 'Email ID / Username and Password are required' if typ == 'Guest' else 'Username and password are required')
    username = str(body[key]).strip()
    columns = ['Email', 'Phone_Number', 'Username'] if typ == 'Guest' else ['Username', 'Email']
    row = db.one(f'SELECT * FROM {typ} WHERE ' + ' OR '.join(f'LOWER({c}) = LOWER(?)' for c in columns), [username] * len(columns))
    if not row or not verify_password(body['password'], row.get('Password')):
        fail(401, 'Invalid credentials')
    if not re.match(r'^\$2[aby]\$', row['Password']):
        db.update(typ, typ + '_ID', row[typ + '_ID'], {'Password': hash_password(body['password'])})
    user = public_user(db, typ, row)
    new_session(db, typ, user['id'], request, response)
    return {'message': 'Customer login successful' if typ == 'Guest' else 'Staff login successful', 'token': token(user), 'user': user}

@router.post('/login')
def login(request: Request, response: Response, body: dict = Body(...), db=Depends(get_db, scope="function")):
    return login_impl(body, request, response, db, 'Employee')

@router.post('/guest-login')
def guest_login(request: Request, response: Response, body: dict = Body(...), db=Depends(get_db, scope="function")):
    return login_impl(body, request, response, db, 'Guest')

@router.post('/refresh')
def refresh(request: Request, response: Response, db=Depends(get_db, scope="function")):
    raw = request.cookies.get(COOKIE)
    ensure_tables(db)
    row = db.one('SELECT * FROM Refresh_Token WHERE Token_Hash = ? FOR UPDATE', [digest(raw)]) if raw else None
    if not row or row['Revoked_At'] or row['Expires_At'] <= datetime.utcnow():
        result = JSONResponse({'error': 'Invalid or expired session'}, status_code=401)
        clear_cookie(result)
        return result
    typ = row['User_Type']
    u = db.one(f'SELECT * FROM {typ} WHERE {typ}_ID = ?', [row['User_ID']])
    if not u:
        db.query('UPDATE Refresh_Token SET Revoked_At = NOW() WHERE Token_ID = ?', [row['Token_ID']])
        result = JSONResponse({'error': 'Account no longer exists'}, status_code=401)
        clear_cookie(result)
        return result
    a = account(db, typ, row['User_ID'])
    if a and a['Banned']:
        revoke_all(db, typ, row['User_ID'])
        result = JSONResponse({'error': 'Your account is banned'}, status_code=403)
        clear_cookie(result)
        return result
    user = public_user(db, typ, u)
    replacement = new_session(db, typ, row['User_ID'], request, response)
    db.query('UPDATE Refresh_Token SET Revoked_At = NOW(), Last_Used_At = NOW(), Replaced_By = ? WHERE Token_ID = ?', [replacement, row['Token_ID']])
    return {'token': token(user), 'user': user}

@router.post('/logout')
def logout(request: Request, response: Response, db=Depends(get_db, scope="function")):
    raw = request.cookies.get(COOKIE)
    if raw:
        ensure_tables(db)
        db.query('UPDATE Refresh_Token SET Revoked_At = NOW() WHERE Token_Hash = ? AND Revoked_At IS NULL', [digest(raw)])
    clear_cookie(response)
    return {'message': 'Logged out successfully'}

@router.get('/me')
def me(user=Depends(current_user)):
    return {'user': user}

def image_columns(db):
    for table in ('Employee', 'Guest'):
        if not db.one(f"SHOW COLUMNS FROM {table} LIKE 'Profile_Image'"):
            db.query(f'ALTER TABLE {table} ADD COLUMN Profile_Image LONGTEXT')

@router.get('/profile/{id}')
def profile(id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    own(user, id)
    typ = user_type(user)
    image_columns(db)
    row = db.one(f'SELECT * FROM {typ} WHERE {typ}_ID = ?', [id])
    if not row:
        return {'profile': None}
    row.pop('Password', None)
    return {'profile': {**row, 'id': id, 'name': row['Full_Name'], 'role': user['role'],
                       'phone': row.get('Phone_Number'), 'joined': row.get('Registration_Date', row.get('Joining_Date')),
                       'identification': row.get('Identification_Number')}}

def self_target(body, user):
    if str(body.get('id')) != str(user['id']):
        fail(403, 'You can only update your own account')
    typ = user_type(user)
    if body.get('role') and (body['role'].lower() == 'guest') != (typ == 'Guest'):
        fail(403, 'Account type does not match authenticated user')
    return typ

@router.post('/update-profile')
def update_profile(body: dict = Body(...), user=Depends(current_user), db=Depends(get_db, scope="function")):
    typ = self_target(body, user)
    if not body.get('name') and 'image' not in body:
        fail(400, 'Nothing to update')
    values = {}
    if body.get('name'):
        values['Full_Name'] = body['name']
    if 'image' in body:
        if body['image'] and len(body['image']) > 3000000:
            fail(400, 'Image is too large. Please use an image under ~2MB.')
        image_columns(db)
        values['Profile_Image'] = body['image'] or None
    db.update(typ, typ + '_ID', user['id'], values)
    return {'message': 'Profile updated successfully'}

@router.post('/change-password')
def change_password(request: Request, response: Response, body: dict = Body(...), user=Depends(current_user), db=Depends(get_db, scope="function")):
    typ = self_target(body, user)
    old, new = body.get('oldPassword'), body.get('newPassword')
    if not old or not new:
        fail(400, 'id, oldPassword and newPassword are required')
    if len(str(new)) < 6:
        fail(400, 'New password must be at least 6 characters long')
    key = (typ, user['id'], request.client.host if request.client else '')
    now = time.monotonic()
    # Remove expired tracking entries instead of retaining per-IP state forever.
    for stale in [k for k, v in failed_attempts.items() if now - v['at'] > 1800 and v['until'] < now]:
        failed_attempts.pop(stale, None)
    attempt = failed_attempts.get(key, {'count': 0, 'at': now, 'until': 0})
    if attempt['until'] > now:
        fail(429, 'Too many failed attempts. Try again in 15 minute(s).')
    if now - attempt['at'] > 900:
        attempt = {'count': 0, 'at': now, 'until': 0}
    row = db.one(f'SELECT Password FROM {typ} WHERE {typ}_ID = ?', [user['id']])
    if not row:
        fail(404, 'Account not found')
    if not verify_password(old, row['Password']):
        attempt['count'] += 1
        if attempt['count'] >= 5:
            attempt['until'] = now + 900
        failed_attempts[key] = attempt
        fail(401, 'Current password is incorrect')
    failed_attempts.pop(key, None)
    if new == old:
        fail(400, 'New password must be different from the current password')
    if not re.search('[A-Za-z]', new) or not re.search('[0-9]', new):
        fail(400, 'New password must contain at least one letter and one number')
    db.update(typ, typ + '_ID', user['id'], {'Password': hash_password(new)})
    count = revoke_all(db, typ, user['id'])
    clear_cookie(response)
    return {'message': 'Password updated successfully. Please log in again.', 'sessionsRevoked': count}

@router.get('/sessions')
def sessions(request: Request, user=Depends(permit('session:read:self')), db=Depends(get_db, scope="function")):
    raw = request.cookies.get(COOKIE)
    rows = db.query('SELECT * FROM Refresh_Token WHERE User_Type = ? AND User_ID = ? AND Revoked_At IS NULL AND Expires_At > NOW() ORDER BY Token_ID DESC', [user_type(user), user['id']])
    return {'sessions': [{'id': r['Token_ID'], 'device': r['User_Agent'], 'ip': r['IP_Address'],
      'created': r['Created_At'], 'lastUsed': r['Last_Used_At'], 'expires': r['Expires_At'],
      'current': bool(raw and digest(raw) == r['Token_Hash'])} for r in rows]}

@router.delete('/sessions/{id}')
def revoke_session(id: int, request: Request, response: Response, user=Depends(permit('session:revoke:self')), db=Depends(get_db, scope="function")):
    row = db.one('SELECT * FROM Refresh_Token WHERE Token_ID = ? AND User_Type = ? AND User_ID = ? AND Revoked_At IS NULL', [id, user_type(user), user['id']])
    if not row:
        fail(404, 'Session not found or already revoked')
    db.query('UPDATE Refresh_Token SET Revoked_At = NOW() WHERE Token_ID = ?', [id])
    if request.cookies.get(COOKIE) and digest(request.cookies[COOKIE]) == row['Token_Hash']:
        clear_cookie(response)
    return {'message': 'Session revoked'}

@router.post('/sessions/revoke-all')
def revoke_everywhere(response: Response, user=Depends(permit('session:revoke:self')), db=Depends(get_db, scope="function")):
    count = revoke_all(db, user_type(user), user['id'])
    clear_cookie(response)
    return {'message': f'Revoked {count} session(s)'}
