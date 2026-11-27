"""Request-scoped MySQL transactions; uses the existing schema unchanged."""
import os
from pathlib import Path
import pymysql
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))

def adapt_sql(sql):
    """Adapt unquoted placeholders without altering question marks in SQL literals."""
    output = []
    quote = None
    escaped = False
    count = 0
    for char in sql:
        if char == '%':
            output.append('%%')
        elif char == '?' and quote is None:
            output.append('%s')
            count += 1
        else:
            output.append(char)
        if escaped:
            escaped = False
        elif char == '\\' and quote:
            escaped = True
        elif char == quote:
            quote = None
        elif quote is None and char in ("'", '"', '`'):
            quote = char
    return ''.join(output), count


class Database:
    def __init__(self):
        self.connection = None

    def connect(self):
        if self.connection is None:
            self.connection = pymysql.connect(
                host=os.getenv('DB_HOST', 'localhost'), port=int(os.getenv('DB_PORT', '3306')),
                user=os.getenv('DB_USER', 'root'), password=os.getenv('DB_PASSWORD', ''),
                database=os.getenv('DB_NAME', 'Hotel_Management_System'), charset='utf8mb4',
                cursorclass=pymysql.cursors.DictCursor, autocommit=False)
        return self.connection

    def query(self, sql, params=()):
        sql, _ = adapt_sql(sql)
        with self.connect().cursor() as cursor:
            cursor.execute(sql, tuple(params))
            if cursor.description:
                return cursor.fetchall()
            return {'insertId': cursor.lastrowid, 'affectedRows': cursor.rowcount}

    def one(self, sql, params=()):
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def insert(self, table, values):
        cols = ', '.join(f'`{c}`' for c in values)
        return self.query(f'INSERT INTO `{table}` ({cols}) VALUES ({", ".join("?" for _ in values)})', values.values())['insertId']

    def update(self, table, pk, ident, values):
        if values:
            self.query(f'UPDATE `{table}` SET {", ".join(f"`{c}` = ?" for c in values)} WHERE `{pk}` = ?', [*values.values(), ident])


def get_db():
    db = Database()
    try:
        yield db
        if db.connection:
            db.connection.commit()
    except Exception:
        if db.connection:
            db.connection.rollback()
        raise
    finally:
        if db.connection:
            db.connection.close()
