import json
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock
import jwt
import pytest
from fastapi.testclient import TestClient
from app import app
from db import Database, get_db
from security import SECRET, current_user, hash_password, verify_password, token

@pytest.fixture
def db():
    mock = MagicMock()
    mock.query.return_value = []
    mock.one.return_value = None
    app.dependency_overrides[get_db] = lambda: mock
    yield mock
    app.dependency_overrides.clear()

@pytest.fixture
def client(db):
    with TestClient(app) as c:
        yield c

def as_user(role='Admin', ident=1, typ=None):
    user = {'id': ident, 'role': role, 'type': typ or ('Guest' if role == 'Guest' else 'Employee')}
    app.dependency_overrides[current_user] = lambda: user
    return user

def test_health_and_docs(client):
    assert client.get('/api/health').json()['status'] == 'OK'
    assert client.get('/docs').status_code == 200
    assert client.get('/openapi.json').status_code == 200

def test_existing_route_coverage():
    actual = {(m.lower(), r.path.rstrip('/')) for r in app.routes if hasattr(r, 'methods') for m in r.methods}
    expected = json.loads(Path(__file__).with_name('expected_routes.json').read_text())
    assert expected, 'The API contract must not be empty'
    assert {tuple(route) for route in expected} <= actual


def test_server_contains_only_python_backend():
    root = Path(__file__).parents[1]
    source_files = [p for p in root.rglob('*') if not {'.venv', 'node_modules', '__pycache__', '.pytest_cache'}.intersection(p.parts)]
    assert not [p for p in source_files if p.suffix in {'.js', '.cjs', '.mjs', '.ts'}]
    assert not (root / 'package.json').exists()
    assert not (root / 'package-lock.json').exists()

@pytest.mark.parametrize('method,path', [
    ('get','/api/reservations'), ('post','/api/reservations'), ('get','/api/bills'),
    ('get','/api/reports/dashboard'), ('get','/api/users'), ('get','/api/services'),
    ('get','/api/employees'), ('get','/api/guests'), ('post','/api/hotels'),
    ('post','/api/rooms'), ('get','/api/auth/me')])
def test_protected_routes_require_token(client, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json() == {'error': 'Access token required'}

@pytest.mark.parametrize('path', ['/api/hotels', '/api/hotels/', '/api/rooms', '/api/rooms/available'])
def test_public_lists(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json() == []

@pytest.mark.parametrize('role', ['Guest','Receptionist'])
def test_permissions_deny_admin_actions(client, role):
    as_user(role)
    assert client.get('/api/users').status_code == 403
    assert client.post('/api/hotels', json={'Hotel_Name': 'Hotel'}).status_code == 403

def test_guest_reservations_are_filtered(client, db):
    as_user('Guest', 7)
    assert client.get('/api/reservations?guestId=8').status_code == 200
    sql, params = db.query.call_args.args
    assert 'AND r.Guest_ID = ?' in sql
    assert params == [7, '8']

def test_guest_cannot_access_other_reservation(client, db):
    as_user('Guest', 7)
    db.one.return_value = {'Guest_ID': 8}
    assert client.get('/api/reservations/3').status_code == 404
    assert client.post('/api/reservations', json={'Guest_ID': 8, 'Room_ID': 1, 'Check_In_Date': '2026-12-01', 'Check_Out_Date': '2026-12-02'}).status_code == 404

def test_guest_service_records_are_filtered(client, db):
    as_user('Guest', 7)
    assert client.get('/api/services/records?guestId=8').status_code == 200
    assert db.query.call_args.args[1] == [7]

def test_token_ban_and_role_are_authoritative(client, db):
    headers = {'Authorization': 'Bearer ' + token({'id': 1, 'role': 'Admin'})}
    db.one.return_value = {'Role': 'Guest', 'Banned': 0}
    assert client.get('/api/users', headers=headers).status_code == 403
    db.one.return_value = {'Role': 'Admin', 'Banned': 1}
    assert client.get('/api/auth/me', headers=headers).status_code == 403

@pytest.mark.parametrize('value', ['junk', jwt.encode({'id': 1, 'role': 'Admin', 'exp': 1}, SECRET, algorithm='HS256'), jwt.encode({'id': 1, 'role': 'Admin'}, 'wrong-secret-that-is-long-enough-for-tests', algorithm='HS256')])
def test_invalid_tokens(client, value):
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + value}).status_code == 401

def test_bcrypt_legacy_and_unicode_compatibility():
    value = 'é' * 45
    hashed = hash_password(value)
    assert verify_password(value, hashed)
    assert not verify_password('wrong', hashed)
    assert verify_password('legacy', 'legacy')

def test_login_and_cookie(client, db):
    hashed = hash_password('secret123')
    def one(sql, params=()):
        if 'FROM Guest' in sql:
            return {'Guest_ID': 7, 'Full_Name': 'Test Guest', 'Password': hashed, 'Email': 'test@example.com'}
        return None
    db.one.side_effect = one
    response = client.post('/api/auth/guest-login', json={'emailOrUsername': 'test@example.com', 'password': 'secret123'})
    assert response.status_code == 200
    assert response.json()['user']['role'] == 'Guest'
    assert jwt.decode(response.json()['token'], SECRET, algorithms=['HS256'])['id'] == 7
    cookie = response.headers['set-cookie']
    assert 'HttpOnly' in cookie and 'Path=/api/auth' in cookie and 'SameSite=lax' in cookie
    assert client.post('/api/auth/guest-login', json={'emailOrUsername': 'test@example.com', 'password': 'bad'}).status_code == 401

def test_refresh_rotation(client, db):
    raw = 'previous-refresh'
    row = {'Token_ID': 3, 'User_Type': 'Guest', 'User_ID': 7, 'Revoked_At': None, 'Expires_At': datetime.utcnow() + timedelta(days=1)}
    def one(sql, params=()):
        if 'FROM Refresh_Token' in sql: return row
        if 'FROM Guest' in sql: return {'Guest_ID': 7, 'Full_Name': 'Test Guest', 'Email': 'test@example.com'}
        return None
    db.one.side_effect = one
    client.cookies.set('hms_refresh', raw, path='/api/auth')
    response = client.post('/api/auth/refresh')
    assert response.status_code == 200
    assert 'hms_refresh=' in response.headers['set-cookie']
    assert any('Replaced_By = ?' in c.args[0] for c in db.query.call_args_list)

def test_profile_cannot_target_another_account(client):
    as_user('Guest', 7)
    assert client.post('/api/auth/update-profile', json={'id': 8, 'name': 'Changed'}).status_code == 403
    assert client.post('/api/auth/change-password', json={'id': 8, 'oldPassword': 'old', 'newPassword': 'new123'}).status_code == 403

@pytest.mark.parametrize('rating', [0, 6, 2.5, 'invalid'])
def test_hotel_validation(client, rating):
    as_user()
    assert client.post('/api/hotels', json={'Hotel_Name': 'Hotel', 'Star_Rating': rating}).status_code == 400

def test_hotel_delete_preserves_history(client, db):
    as_user()
    db.one.side_effect = [{'Hotel_Name': 'Hotel'}, {'employees': 0, 'reservations': 1}]
    assert client.delete('/api/hotels/1').status_code == 409
    assert not db.query.called

def test_sql_adapts_placeholders_and_date_format():
    db = Database()
    connection = MagicMock()
    db.connection = connection
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.description = True
    db.query("SELECT DATE_FORMAT(Check_Out_Date, '%Y-%m') FROM Reservation WHERE Guest_ID = ?", [7])
    cursor.execute.assert_called_once_with("SELECT DATE_FORMAT(Check_Out_Date, '%%Y-%%m') FROM Reservation WHERE Guest_ID = %s", (7,))

def test_transaction_commit_and_rollback(monkeypatch):
    import db as module
    mock = MagicMock()
    monkeypatch.setattr(module, 'Database', lambda: mock)
    dependency = get_db()
    next(dependency)
    with pytest.raises(StopIteration): next(dependency)
    mock.connection.commit.assert_called_once()
    dependency = get_db()
    next(dependency)
    with pytest.raises(RuntimeError): dependency.throw(RuntimeError('failure'))
    mock.connection.rollback.assert_called_once()

def test_reservation_booking_reserves_room(client, db):
    as_user('Guest', 7)
    def one(sql, params=()):
        if 'FOR UPDATE' in sql:
            return {'Availability_Status': 'Available'}
        if 'JOIN Guest' in sql:
            return {'Reservation_ID': 20, 'Guest_ID': 7, 'Full_Name': 'Guest Name', 'Reservation_Status': 'Confirmed'}
        return {'Guest_ID': 7}
    db.one.side_effect = one
    db.insert.return_value = 20
    response = client.post('/api/reservations', json={'Guest_ID': 7, 'Room_ID': 3, 'Check_In_Date': '2026-12-01', 'Check_Out_Date': '2026-12-03'})
    assert response.status_code == 201
    assert response.json()['Reservation_ID'] == 20
    db.update.assert_called_with('Room', 'Room_ID', 3, {'Availability_Status': 'Reserved'})

def test_bill_generation_computes_total_and_checkout(client, db):
    as_user()
    def one(sql, params=()):
        if 'DATEDIFF' in sql and 'FROM Reservation' in sql:
            return {'Guest_ID': 7, 'Room_ID': 3, 'Nightly_Rate': 100, 'Total_Nights': 2}
        if sql.startswith('SELECT * FROM Bill'):
            return None
        return {'Bill_ID': 30, 'Total_Amount': 250, 'Taxes': 10, 'Discounts': 5, 'Full_Name': 'Guest Name'}
    db.one.side_effect = one
    db.query.return_value = [{'Charge': 50}]
    db.insert.return_value = 30
    response = client.post('/api/bills/generate', json={'Reservation_ID': 20, 'Taxes': 10, 'Discounts': 5})
    assert response.status_code == 200
    assert response.json()['Final_Amount'] == 255
    assert db.insert.call_args.args[1]['Total_Amount'] == 250
    db.update.assert_any_call('Reservation', 'Reservation_ID', 20, {'Reservation_Status': 'Checked Out'})
    db.update.assert_any_call('Room', 'Room_ID', 3, {'Availability_Status': 'Available'})

def test_revoked_refresh_is_rejected_and_cookie_cleared(client, db):
    db.one.return_value = {'Revoked_At': datetime.utcnow()}
    client.cookies.set('hms_refresh', 'revoked', path='/api/auth')
    response = client.post('/api/auth/refresh')
    assert response.status_code == 401
    assert 'Max-Age=0' in response.headers['set-cookie']

def test_hotel_member_cannot_move_room_to_another_hotel(client, db):
    as_user('Manager', 2)
    def one(sql, params=()):
        if 'FROM Room' in sql: return {'Hotel_ID': 1}
        if 'FROM Hotel_Member' in sql:
            return {'Member_Role': 'Member'} if params[0] == 1 else None
        return None
    db.one.side_effect = one
    assert client.put('/api/rooms/1', json={'Hotel_ID': 2}).status_code == 404
    db.update.assert_not_called()


def test_sql_preserves_question_marks_in_literals():
    from db import adapt_sql
    sql, count = adapt_sql("INSERT INTO Hotel (Image_Url, Hotel_Name) VALUES ('https://example.com/photo?auto=format&w=800', ?)")
    assert count == 1
    assert sql == "INSERT INTO Hotel (Image_Url, Hotel_Name) VALUES ('https://example.com/photo?auto=format&w=800', %s)"
    sql, count = adapt_sql("SELECT 'it\\'s ? 100%', `column?`, ?")
    assert count == 1
    assert "100%%" in sql
