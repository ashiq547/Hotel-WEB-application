"""Initialize an empty database only. Existing hotel data is never reset."""
import json
import os
from pathlib import Path
import re
import sys
import pymysql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from db import Database, adapt_sql
from security import hash_password, ensure_tables, ensure_members

def main():
    name = os.getenv('DB_NAME', 'Hotel_Management_System')
    if not re.fullmatch(r'[A-Za-z0-9_]+', name):
        raise ValueError('DB_NAME must contain only letters, numbers and underscores')
    connection = pymysql.connect(host=os.getenv('DB_HOST', 'localhost'), port=int(os.getenv('DB_PORT', '3306')),
      user=os.getenv('DB_USER', 'root'), password=os.getenv('DB_PASSWORD', ''), autocommit=True)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE IF NOT EXISTS `{name}`')
            cursor.execute(f'USE `{name}`')
            cursor.execute('SHOW TABLES')
            if cursor.fetchall():
                raise RuntimeError('Database is not empty; initialization stopped to preserve existing data. Use a new DB_NAME for sample data.')
    finally:
        connection.close()
    db = Database()
    try:
        schema = (ROOT.parent / 'Hotel_Management_System.sql').read_text()
        schema = re.sub(r'--[^\n]*', '', schema)
        for statement in schema.split(';'):
            statement = statement.strip()
            if statement and not statement.upper().startswith(('CREATE DATABASE', 'USE ')):
                db.query(statement)
        enhancements = {
          'Hotel': ['Image_Url VARCHAR(500)'],
          'Room': ['Sale_Rate DECIMAL(10,2)', 'Room_Description TEXT'],
          'Guest': ['Username VARCHAR(100) UNIQUE', 'Password VARCHAR(255)', 'Profile_Image LONGTEXT'],
          'Employee': ['Profile_Image LONGTEXT'],
          'Service': ['Service_Name VARCHAR(100)', 'Service_Charge DECIMAL(10,2) DEFAULT 0', 'Service_Description TEXT']}
        for table, columns in enhancements.items():
            for column in columns:
                if not db.one(f"SHOW COLUMNS FROM {table} LIKE ?", [column.split()[0]]):
                    db.query(f'ALTER TABLE {table} ADD COLUMN {column}')
        ensure_tables(db)
        ensure_members(db)
        passwords = {k: hash_password(v) for k, v in {'guestPw': 'password', 'guestPw2': '1234', 'staffPw': 'admin123', 'staffPw2': '54321'}.items()}
        for seed in json.loads((ROOT / 'seed.json').read_text()):
            # The legacy seed grouped several inserts in a single string.
            params = [passwords[k] for k in seed['passwords']]
            offset = 0
            for statement in seed['sql'].split(';'):
                if statement.strip():
                    _, count = adapt_sql(statement)
                    db.query(statement, params[offset:offset + count])
                    offset += count
        db.query("UPDATE Room SET Availability_Status = 'Occupied' WHERE Room_ID = 3")
        db.query("UPDATE Room SET Availability_Status = 'Reserved' WHERE Room_ID = 2")
        db.connection.commit()
        print('Database initialized with sample hotels, guests, staff, rooms and billing data.')
    except Exception:
        if db.connection:
            db.connection.rollback()
        raise
    finally:
        if db.connection:
            db.connection.close()

if __name__ == '__main__':
    main()
