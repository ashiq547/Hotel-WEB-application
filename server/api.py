"""Hotel operations, preserving the React client's /api contract."""
import json
from datetime import date
from pathlib import Path
from fastapi import APIRouter, Body, Depends, Request
from db import get_db
from security import (current_user, permit, fail, own, user_type, hotel_guard, ensure_members,
                      account, revoke_all, hash_password, ROLES)

router = APIRouter(prefix='/api')
SQL = json.loads(Path(__file__).with_name('queries.json').read_text())

def query(name, index=0):
    return SQL[name][index]

def named(row):
    row = dict(row)
    row.pop('Password', None)
    parts = (row.get('Full_Name') or '').split(' ')
    row['First_Name'] = row.get('First_Name') or parts[0]
    row['Last_Name'] = row.get('Last_Name') or ' '.join(parts[1:])
    return row

def service(row):
    return {**row, 'Service_Name': row.get('Service_Name') or row['Service_Type']}

def bill(row):
    return {**named(row), 'Final_Amount': float(row.get('Total_Amount') or 0) + float(row.get('Taxes') or 0) - float(row.get('Discounts') or 0)}

def existing(db, table, ident):
    row = db.one(f'SELECT * FROM {table} WHERE {table}_ID = ?', [ident])
    if not row:
        fail(404, f'{table} not found')
    return row

def fields(body, allowed):
    return {k: body[k] for k in allowed.split() if k in body}

HOTEL_FIELDS = 'Hotel_Name Address City Contact_Number Star_Rating Image_Url'
ROOM_FIELDS = 'Hotel_ID Room_Number Room_Type Floor_Number Capacity Nightly_Rate Sale_Rate Room_Description Availability_Status'
GUEST_FIELDS = 'Full_Name Phone_Number Email Address Nationality Identification_Number Username'
EMPLOYEE_FIELDS = 'Hotel_ID Full_Name Role Designation Salary Joining_Date Employment_Status Phone_Number Email Username'
SERVICE_FIELDS = 'Service_Type Service_Name Service_Charge Service_Description'

def validate_hotel(body, create=False):
    if create and (not isinstance(body.get('Hotel_Name'), str) or not body['Hotel_Name'].strip()):
        fail(400, 'Hotel Name is required')
    for field, limit in {'Hotel_Name': 100, 'Address': 255, 'City': 100, 'Contact_Number': 20, 'Image_Url': 500}.items():
        if body.get(field) is not None and len(str(body[field])) > limit:
            fail(400, f'{field.replace("_", " ", 1)} must be at most {limit} characters')
    if body.get('Star_Rating') not in (None, ''):
        try:
            rating = float(body['Star_Rating'])
            if not rating.is_integer() or not 1 <= rating <= 5:
                raise ValueError()
        except (ValueError, TypeError):
            fail(400, 'Star Rating must be a whole number from 1 to 5')

@router.get('/hotels')
def hotels(db=Depends(get_db, scope="function")):
    return db.query(query('getAllHotels'))

@router.get('/hotels/{id}')
def hotel(id: int, db=Depends(get_db, scope="function")):
    row = existing(db, 'Hotel', id)
    return {**row, 'rooms': db.query('SELECT * FROM Room WHERE Hotel_ID = ?', [id])}

@router.post('/hotels', status_code=201)
def create_hotel(body: dict = Body(...), user=Depends(permit('hotel:create')), db=Depends(get_db, scope="function")):
    validate_hotel(body, True)
    values = {'Address': None, 'City': 'Dhaka', 'Contact_Number': None, 'Star_Rating': 4,
              'Image_Url': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80', **fields(body, HOTEL_FIELDS)}
    values['Hotel_Name'] = values['Hotel_Name'].strip()
    return existing(db, 'Hotel', db.insert('Hotel', values))

@router.put('/hotels/{id}')
def update_hotel(id: int, body: dict = Body(...), user=Depends(permit('room:update:owned')), db=Depends(get_db, scope="function")):
    validate_hotel(body)
    existing(db, 'Hotel', id)
    hotel_guard(db, user, id, manager=True)
    db.update('Hotel', 'Hotel_ID', id, fields(body, HOTEL_FIELDS))
    return existing(db, 'Hotel', id)

@router.delete('/hotels/{id}')
def delete_hotel(id: int, user=Depends(permit('hotel:delete:any')), db=Depends(get_db, scope="function")):
    existing(db, 'Hotel', id)
    counts = db.one(query('deleteHotel', 1), [id, id])
    if counts['employees'] or counts['reservations']:
        fail(409, 'Cannot delete this hotel: it is still referenced by employees or reservations.')
    removed = db.query('DELETE FROM Room WHERE Hotel_ID = ?', [id])
    db.query('DELETE FROM Hotel WHERE Hotel_ID = ?', [id])
    return {'message': 'Hotel deleted successfully', 'Hotel_ID': id, 'Rooms_Deleted': removed['affectedRows']}

@router.get('/hotels/{id}/members')
def members(id: int, user=Depends(permit('hotel:read:members')), db=Depends(get_db, scope="function")):
    existing(db, 'Hotel', id)
    ensure_members(db)
    return {'members': db.query('SELECT m.*, e.Full_Name, e.Email, e.Role FROM Hotel_Member m JOIN Employee e ON m.Employee_ID = e.Employee_ID WHERE m.Hotel_ID = ? ORDER BY m.Member_ID ASC', [id])}

@router.post('/hotels/{id}/members', status_code=201)
def add_member(id: int, body: dict = Body(...), user=Depends(permit('hotel:manage:members')), db=Depends(get_db, scope="function")):
    if not body.get('employeeId'):
        fail(400, 'employeeId is required')
    role = body.get('memberRole') or 'Member'
    if role not in ('Member', 'Manager'):
        fail(400, 'memberRole must be Member or Manager')
    existing(db, 'Hotel', id)
    existing(db, 'Employee', body['employeeId'])
    ensure_members(db)
    db.query('INSERT INTO Hotel_Member (Hotel_ID, Employee_ID, Member_Role, Added_By) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE Member_Role = VALUES(Member_Role)', [id, body['employeeId'], role, user['id']])
    return {'message': 'Member added'}

@router.delete('/hotels/{id}/members/{employeeId}')
def remove_member(id: int, employeeId: int, user=Depends(permit('hotel:manage:members')), db=Depends(get_db, scope="function")):
    ensure_members(db)
    if not db.query('DELETE FROM Hotel_Member WHERE Hotel_ID = ? AND Employee_ID = ?', [id, employeeId])['affectedRows']:
        fail(404, 'Membership not found')
    return {'message': 'Member removed'}

@router.get('/rooms')
def rooms(request: Request, db=Depends(get_db, scope="function")):
    sql = query('getAllRooms')
    params = []
    for key, column, op in [('hotelId', 'r.Hotel_ID', '='), ('type', 'r.Room_Type', '='), ('status', 'r.Availability_Status', '='), ('minRate', 'r.Nightly_Rate', '>='), ('maxRate', 'r.Nightly_Rate', '<=')]:
        if request.query_params.get(key):
            sql += f' AND {column} {op} ?'
            params.append(request.query_params[key])
    return db.query(sql + ' ORDER BY r.Hotel_ID, r.Room_Number ASC', params)

@router.get('/rooms/available')
def available_rooms(db=Depends(get_db, scope="function")):
    return db.query(query('getAvailableRooms'))

def room_detail(db, id):
    return db.one('SELECT r.*, h.Hotel_Name FROM Room r JOIN Hotel h ON r.Hotel_ID = h.Hotel_ID WHERE r.Room_ID = ?', [id])

@router.post('/rooms', status_code=201)
def create_room(body: dict = Body(...), user=Depends(permit('room:create')), db=Depends(get_db, scope="function")):
    if not all(body.get(k) for k in ('Hotel_ID', 'Room_Number', 'Room_Type', 'Nightly_Rate')):
        fail(400, 'Hotel_ID, Room_Number, Room_Type, and Nightly_Rate are required')
    hotel_guard(db, user, body['Hotel_ID'])
    values = {'Floor_Number': 1, 'Capacity': 2, 'Sale_Rate': None, 'Room_Description': None, 'Availability_Status': 'Available', **fields(body, ROOM_FIELDS)}
    return room_detail(db, db.insert('Room', values))

@router.put('/rooms/{id}')
def update_room(id: int, body: dict = Body(...), user=Depends(permit('room:update:owned', 'room:update:any')), db=Depends(get_db, scope="function")):
    row = existing(db, 'Room', id)
    hotel_guard(db, user, row['Hotel_ID'])
    if body.get('Hotel_ID') and str(body['Hotel_ID']) != str(row['Hotel_ID']):
        hotel_guard(db, user, body['Hotel_ID'])
    db.update('Room', 'Room_ID', id, fields(body, ROOM_FIELDS))
    return room_detail(db, id)

@router.delete('/rooms/{id}')
def delete_room(id: int, user=Depends(permit('room:delete:owned', 'room:delete:any')), db=Depends(get_db, scope="function")):
    row = existing(db, 'Room', id)
    hotel_guard(db, user, row['Hotel_ID'], manager=True)
    db.query('DELETE FROM Room WHERE Room_ID = ?', [id])
    return {'message': 'Room deleted successfully', 'Room_ID': str(id)}

@router.get('/guests/check-username')
def check_username(username: str = '', db=Depends(get_db, scope="function")):
    if len(username.strip()) < 3:
        return {'available': False, 'message': 'Username must be at least 3 characters'}
    taken = db.one('SELECT Guest_ID FROM Guest WHERE LOWER(Username) = LOWER(?)', [username.strip()])
    return {'available': not bool(taken), 'message': 'Username is already taken' if taken else 'Username is available'}

@router.get('/guests')
@router.get('/guests/search')
def guests(request: Request, user=Depends(permit('guest:read:all')), db=Depends(get_db, scope="function")):
    term = request.query_params.get('query')
    rows = db.query(query('searchGuests'), [f'%{term}%'] * 6) if term else db.query(query('getAllGuests'))
    return [named(r) for r in rows]

@router.get('/guests/profile/{id}')
def guest_profile(id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    own(user, id, 'Guest profile not found')
    g = db.one(query('getGuestProfile'), [id])
    if not g:
        fail(404, 'Guest profile not found')
    reservations = db.query(query('getGuestProfile', 1), [id])
    services = db.query(query('getGuestProfile', 2), [id])
    bills = db.query(query('getGuestProfile', 3), [id])
    active = next((r for r in reservations if r['Reservation_Status'] in ('Checked In', 'Confirmed')), None)
    return {'guest': named(g), 'reservations': reservations, 'services': services, 'bills': bills,
      'summary': {'activeReservation': f"#RES-{active['Reservation_ID']}" if active else 'None',
      'previousReservations': sum(r['Reservation_Status'] == 'Checked Out' for r in reservations),
      'currentRoom': f"Room {active['Room_Number']} ({active['Hotel_Name']})" if active else 'None',
      'totalServicesUsed': sum(r.get('Quantity') or 1 for r in services),
      'outstandingBill': sum(float(r['Final_Amount'] or 0) for r in bills if r['Payment_Status'] == 'Pending'),
      'totalAmountSpent': sum(float(r['Final_Amount'] or 0) for r in bills if r['Payment_Status'] == 'Paid')}}

@router.get('/guests/{id}')
def guest(id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    own(user, id, 'Guest not found')
    row = db.one(query('getGuestById'), [id])
    if not row:
        fail(404, 'Guest not found')
    return named(row)

def person_values(body, allowed):
    values = fields(body, allowed)
    name = body.get('Full_Name') or ' '.join(str(body.get(k) or '') for k in ('First_Name', 'Last_Name')).strip()
    if name:
        values['Full_Name'] = name
    if values.get('Username'):
        values['Username'] = values['Username'].strip()
    return values

def validate_guest_unique(db, values, ident=None):
    messages = {'Username': 'Username is already taken. Please choose another username.',
                'Phone_Number': 'Phone number already in use.', 'Email': 'Email already in use.',
                'Identification_Number': 'National ID / Passport number must be unique.'}
    for column, message in messages.items():
        if values.get(column):
            sql = f'SELECT Guest_ID FROM Guest WHERE LOWER(`{column}`) = LOWER(?)'
            params = [values[column]]
            if ident is not None:
                sql += ' AND Guest_ID != ?'
                params.append(ident)
            if db.one(sql, params):
                fail(400, message)

@router.post('/guests', status_code=201)
def create_guest(body: dict = Body(...), db=Depends(get_db, scope="function")):
    values = {'Email': None, 'Address': None, 'Nationality': 'Bangladeshi', 'Username': None, **person_values(body, GUEST_FIELDS)}
    if not all(values.get(k) for k in ('Full_Name', 'Phone_Number', 'Identification_Number')):
        fail(400, 'Full Name, Phone Number, and National ID / Passport are required')
    validate_guest_unique(db, values)
    values['Password'] = hash_password(body.get('Password') or 'password')
    ident = db.insert('Guest', values)
    return named(db.one(query('getGuestById'), [ident]))

@router.put('/guests/{id}')
def update_guest(id: int, body: dict = Body(...), user=Depends(permit('guest:update:any')), db=Depends(get_db, scope="function")):
    existing(db, 'Guest', id)
    validate_guest_unique(db, person_values(body, GUEST_FIELDS), id)
    db.update('Guest', 'Guest_ID', id, {k: v for k, v in person_values(body, GUEST_FIELDS).items() if v is not None})
    return named(db.one(query('getGuestById'), [id]))

@router.delete('/guests/{id}')
def delete_guest(id: int, user=Depends(permit('guest:delete:any')), db=Depends(get_db, scope="function")):
    existing(db, 'Guest', id)
    db.query('DELETE FROM Guest WHERE Guest_ID = ?', [id])
    return {'message': 'Guest deleted successfully', 'Guest_ID': str(id)}

@router.get('/employees')
def employees(user=Depends(permit('employee:read:all')), db=Depends(get_db, scope="function")):
    return [named(r) for r in db.query(query('getAllEmployees'))]

@router.get('/employees/{id}')
def employee(id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    if user_type(user) == 'Guest':
        fail(403, 'Staff access required')
    row = db.one(query('getEmployeeById'), [id])
    if not row:
        fail(404, 'Employee not found')
    return named(row)

@router.post('/employees', status_code=201)
def create_employee(body: dict = Body(...), user=Depends(permit('employee:create')), db=Depends(get_db, scope="function")):
    values = {'Salary': 0, 'Joining_Date': date.today(), 'Employment_Status': 'Active', 'Phone_Number': None, 'Email': None, 'Username': None, **person_values(body, EMPLOYEE_FIELDS)}
    if not values.get('Full_Name') or not values.get('Hotel_ID'):
        fail(400, 'Full Name and Hotel assignment are required')
    values['Role'] = values.get('Role') or values.get('Designation') or 'Receptionist'
    if values['Role'] == 'Admin' and user['role'] != 'Admin':
        fail(403, 'Only an admin can assign the Admin role')
    values['Designation'] = values.get('Designation') or values['Role']
    values['Password'] = hash_password(body.get('Password') or 'admin123')
    return named(db.one(query('getEmployeeById'), [db.insert('Employee', values)]))

@router.put('/employees/{id}')
def update_employee(id: int, body: dict = Body(...), user=Depends(permit('employee:update:any')), db=Depends(get_db, scope="function")):
    row = existing(db, 'Employee', id)
    if body.get('Role') and body['Role'] != row['Role']:
        if user['role'] != 'Admin' or int(user['id']) == id:
            fail(403, 'Only an admin can change another employee\'s role')
        account(db, 'Employee', id, body['Role'])
        db.query('UPDATE User_Account SET Role = ? WHERE User_Type = ? AND User_Ref_ID = ?', [body['Role'], 'Employee', id])
        revoke_all(db, 'Employee', id)
    values = {k: v for k, v in person_values(body, EMPLOYEE_FIELDS).items() if v is not None}
    if body.get('Password'):
        values['Password'] = hash_password(body['Password'])
        revoke_all(db, 'Employee', id)
    db.update('Employee', 'Employee_ID', id, values)
    return named(db.one(query('getEmployeeById'), [id]))

@router.delete('/employees/{id}')
def delete_employee(id: int, user=Depends(permit('employee:delete:any')), db=Depends(get_db, scope="function")):
    existing(db, 'Employee', id)
    revoke_all(db, 'Employee', id)
    db.query('DELETE FROM Employee WHERE Employee_ID = ?', [id])
    return {'message': 'Employee deleted successfully', 'Employee_ID': str(id)}

@router.get('/reservations')
def reservations(request: Request, user=Depends(permit('reservation:read:own', 'reservation:read:all')), db=Depends(get_db, scope="function")):
    sql, params = query('getAllReservations'), []
    if user_type(user) == 'Guest':
        sql += ' AND r.Guest_ID = ?'
        params.append(user['id'])
    for key, column in [('status', 'r.Reservation_Status'), ('guestId', 'r.Guest_ID'), ('hotelId', 'rm.Hotel_ID')]:
        if request.query_params.get(key):
            sql += f' AND {column} = ?'
            params.append(request.query_params[key])
    return [named(r) for r in db.query(sql + ' ORDER BY r.Reservation_ID DESC', params)]

@router.get('/reservations/{id}')
def reservation(id: int, user=Depends(permit('reservation:read:own', 'reservation:read:all')), db=Depends(get_db, scope="function")):
    row = db.one(query('getReservationById'), [id])
    if not row:
        fail(404, 'Reservation not found')
    own(user, row['Guest_ID'], 'Reservation not found')
    return named(row)

@router.post('/reservations', status_code=201)
def create_reservation(body: dict = Body(...), user=Depends(permit('reservation:create:self', 'reservation:create:any')), db=Depends(get_db, scope="function")):
    if not all(body.get(k) for k in ('Guest_ID', 'Room_ID', 'Check_In_Date', 'Check_Out_Date')):
        fail(400, 'Guest, Room, Check In, and Check Out dates are required')
    own(user, body['Guest_ID'], 'Guest not found')
    try:
        start, end = (date.fromisoformat(body[k][:10]) for k in ('Check_In_Date', 'Check_Out_Date'))
        if end <= start:
            raise ValueError()
    except (TypeError, ValueError):
        fail(400, 'Check Out date must be after Check In date')
    existing(db, 'Guest', body['Guest_ID'])
    room = db.one('SELECT * FROM Room WHERE Room_ID = ? FOR UPDATE', [body['Room_ID']])
    if not room:
        fail(404, 'Room not found')
    if room['Availability_Status'] != 'Available':
        fail(400, f"Room is currently {room['Availability_Status']}")
    ident = db.insert('Reservation', {'Guest_ID': body['Guest_ID'], 'Room_ID': body['Room_ID'],
      'Booking_Date': date.today(), 'Check_In_Date': start, 'Check_Out_Date': end,
      'Reservation_Status': 'Confirmed', 'Number_of_Guests': body.get('Number_of_Guests') or 1})
    db.update('Room', 'Room_ID', body['Room_ID'], {'Availability_Status': 'Reserved'})
    return named(db.one(query('getReservationById'), [ident]))

@router.put('/reservations/{id}')
def update_reservation(id: int, body: dict = Body(...), user=Depends(permit('reservation:update:own', 'reservation:update:any')), db=Depends(get_db, scope="function")):
    row = existing(db, 'Reservation', id)
    own(user, row['Guest_ID'], 'Reservation not found')
    values = {k: v for k, v in fields(body, 'Reservation_Status Check_In_Date Check_Out_Date Number_of_Guests').items() if v is not None}
    db.update('Reservation', 'Reservation_ID', id, values)
    state = values.get('Reservation_Status')
    if state in ('Checked In', 'Checked Out', 'Cancelled'):
        db.update('Room', 'Room_ID', row['Room_ID'], {'Availability_Status': 'Occupied' if state == 'Checked In' else 'Available'})
    return named(db.one(query('getReservationById'), [id]))

@router.delete('/reservations/{id}')
def delete_reservation(id: int, user=Depends(permit('reservation:delete:own', 'reservation:delete:any')), db=Depends(get_db, scope="function")):
    row = existing(db, 'Reservation', id)
    own(user, row['Guest_ID'], 'Reservation not found')
    db.query('DELETE FROM Reservation WHERE Reservation_ID = ?', [id])
    db.update('Room', 'Room_ID', row['Room_ID'], {'Availability_Status': 'Available'})
    return {'message': 'Reservation deleted successfully', 'Reservation_ID': str(id)}

@router.get('/services')
def services(user=Depends(permit('service:read')), db=Depends(get_db, scope="function")):
    return [service(r) for r in db.query(query('getAllServices'))]

@router.post('/services', status_code=201)
def create_service(body: dict = Body(...), user=Depends(permit('service:create')), db=Depends(get_db, scope="function")):
    typ = body.get('Service_Type') or body.get('Service_Name')
    if not typ:
        fail(400, 'Service Type is required')
    values = {'Service_Type': typ, 'Service_Name': body.get('Service_Name') or typ,
              'Service_Charge': body.get('Service_Charge') or 0, 'Service_Description': body.get('Service_Description')}
    return service(existing(db, 'Service', db.insert('Service', values)))

@router.put('/services/{id}')
def update_service(id: int, body: dict = Body(...), user=Depends(permit('service:update')), db=Depends(get_db, scope="function")):
    existing(db, 'Service', id)
    db.update('Service', 'Service_ID', id, {k: v for k, v in fields(body, SERVICE_FIELDS).items() if v is not None})
    return service(existing(db, 'Service', id))

@router.delete('/services/{id}')
def delete_service(id: int, user=Depends(permit('service:delete')), db=Depends(get_db, scope="function")):
    existing(db, 'Service', id)
    db.query('DELETE FROM Service WHERE Service_ID = ?', [id])
    return {'message': 'Service deleted successfully', 'Service_ID': str(id)}

@router.get('/services/records')
def service_records(request: Request, user=Depends(permit('service:read')), db=Depends(get_db, scope="function")):
    sql, params = query('getGuestServiceRecords'), []
    guest_id = user['id'] if user_type(user) == 'Guest' else request.query_params.get('guestId')
    if guest_id:
        sql += ' WHERE sr.Guest_ID = ?'
        params.append(guest_id)
    return [named(r) for r in db.query(sql + ' ORDER BY sr.Service_Record_ID DESC', params)]

@router.post('/services/assign', status_code=201)
@router.post('/services/records', status_code=201)
def assign_service(body: dict = Body(...), user=Depends(permit('service:assign')), db=Depends(get_db, scope="function")):
    if not body.get('Guest_ID') or not body.get('Service_ID'):
        fail(400, 'Guest and Service are required')
    existing(db, 'Guest', body['Guest_ID'])
    s = existing(db, 'Service', body['Service_ID'])
    qty = body.get('Quantity') or 1
    cost = float(body.get('Total_Cost', body.get('Charge', float(s.get('Service_Charge') or 500) * qty)))
    bill_id = None
    if body.get('Reservation_ID'):
        r = existing(db, 'Reservation', body['Reservation_ID'])
        if int(r['Guest_ID']) != int(body['Guest_ID']):
            fail(400, 'Reservation does not belong to this guest')
        b = db.one('SELECT Bill_ID FROM Bill WHERE Reservation_ID = ?', [body['Reservation_ID']])
        bill_id = b['Bill_ID'] if b else db.insert('Bill', {'Reservation_ID': body['Reservation_ID'], 'Total_Amount': 0, 'Payment_Status': 'Pending'})
    ident = db.insert('Service_Record', {'Guest_ID': body['Guest_ID'], 'Service_ID': body['Service_ID'],
      'Bill_ID': bill_id, 'Service_Date': body.get('Service_Date') or date.today(), 'Quantity': qty, 'Charge': cost})
    if bill_id:
        db.query('UPDATE Bill SET Total_Amount = Total_Amount + ? WHERE Bill_ID = ?', [cost, bill_id])
    return named(db.one(query('assignServiceToGuest', -1), [ident]))

@router.get('/bills')
def bills(user=Depends(permit('bill:read:own', 'bill:read:all')), db=Depends(get_db, scope="function")):
    sql, params = query('getAllBills'), []
    if user_type(user) == 'Guest':
        sql += ' AND r.Guest_ID = ?'
        params.append(user['id'])
    return [bill(r) for r in db.query(sql + ' ORDER BY b.Bill_ID DESC', params)]

@router.get('/bills/{id}')
def bill_detail(id: int, user=Depends(permit('bill:read:own', 'bill:read:all')), db=Depends(get_db, scope="function")):
    row = db.one(query('getBillById'), [id])
    if not row:
        fail(404, 'Bill not found')
    own(user, row['Guest_ID'], 'Bill not found')
    return {**bill(row), 'items': db.query(query('getBillById', 1), [id])}

@router.put('/bills/{id}')
@router.patch('/bills/{id}')
def update_bill(id: int, body: dict = Body(...), user=Depends(permit('bill:update')), db=Depends(get_db, scope="function")):
    existing(db, 'Bill', id)
    db.update('Bill', 'Bill_ID', id, {k: v for k, v in fields(body, 'Payment_Status Payment_Method Discounts Taxes Total_Amount').items() if v is not None})
    return bill(db.one(query('getBillById'), [id]))

@router.post('/bills/generate')
def generate_bill(body: dict = Body(...), user=Depends(permit('bill:create')), db=Depends(get_db, scope="function")):
    if not body.get('Reservation_ID'):
        fail(400, 'Reservation ID is required')
    r = db.one(query('generateBill'), [body['Reservation_ID']])
    if not r:
        fail(404, 'Reservation not found')
    records = db.query(query('generateBill', 1), [r['Guest_ID']])
    subtotal = float(r['Nightly_Rate']) * max(1, r['Total_Nights'] or 1) + sum(float(s.get('Charge') or s.get('Total_Cost') or 0) for s in records)
    b = db.one('SELECT * FROM Bill WHERE Reservation_ID = ?', [body['Reservation_ID']])
    values = {'Total_Amount': subtotal, 'Taxes': float(body.get('Taxes') or 0), 'Discounts': float(body.get('Discounts') or 0),
      'Payment_Method': body.get('Payment_Method') or (b and b.get('Payment_Method')) or 'Card', 'Payment_Status': 'Paid'}
    if b:
        ident = b['Bill_ID']
        db.update('Bill', 'Bill_ID', ident, values)
    else:
        ident = db.insert('Bill', {'Reservation_ID': body['Reservation_ID'], **values})
    db.query('UPDATE Service_Record SET Bill_ID = ? WHERE Guest_ID = ? AND (Bill_ID IS NULL OR Bill_ID = 0)', [ident, r['Guest_ID']])
    db.update('Reservation', 'Reservation_ID', body['Reservation_ID'], {'Reservation_Status': 'Checked Out'})
    db.update('Room', 'Room_ID', r['Room_ID'], {'Availability_Status': 'Available'})
    return bill(db.one(query('getBillById'), [ident]))

@router.get('/reports/dashboard')
def dashboard(user=Depends(permit('report:read:basic')), db=Depends(get_db, scope="function")):
    results = [db.query(s) for s in SQL['getDashboardStats']]
    keys = ['totalHotels', 'totalRooms', 'availableRooms', 'occupiedRooms', 'activeReservations', 'guestsToday']
    summary = {key: results[i][0]['count'] for i, key in enumerate(keys)}
    summary.update(todayRevenue=results[6][0]['total'], monthlyRevenue=results[7][0]['total'],
      occupancyRate=int(100 * summary['occupiedRooms'] / (summary['totalRooms'] or 1) + 0.5))
    return {'summary': summary, 'charts': {'revenueByMonth': results[8], 'roomTypeDist': results[9]}}

@router.get('/reports/top-spenders')
def top_spenders(user=Depends(permit('report:read:basic')), db=Depends(get_db, scope="function")):
    return [named(r) for r in db.query(query('getHighestSpendingGuests'))]

@router.get('/reports/upcoming-checkins')
def checkins(user=Depends(permit('report:read:basic')), db=Depends(get_db, scope="function")):
    return [named(r) for r in db.query(query('getUpcomingCheckins'))]

@router.get('/reports/employee-salary')
def salaries(user=Depends(permit('report:read:salary')), db=Depends(get_db, scope="function")):
    return db.query(query('getEmployeeSalaryReport'))

@router.get('/reports/occupancy')
def occupancy(user=Depends(permit('report:read:basic')), db=Depends(get_db, scope="function")):
    return db.query(query('getOccupancyReport'))

@router.get('/users/me/permissions')
def my_permissions(user=Depends(current_user)):
    return {'user': {'id': user['id'], 'type': user_type(user)}, 'role': user['role'], 'banned': False, 'permissions': ROLES.get(user['role'], [])}

@router.get('/users')
def users(user=Depends(permit('user:read:all')), db=Depends(get_db, scope="function")):
    return {'users': db.query('''SELECT ua.User_Account_ID, ua.User_Type, ua.User_Ref_ID, ua.Role, ua.Banned,
      ua.Banned_At, ua.Ban_Reason, COALESCE(g.Full_Name, e.Full_Name) AS Name,
      COALESCE(g.Email, e.Email) AS Email FROM User_Account ua
      LEFT JOIN Guest g ON ua.User_Type = 'Guest' AND ua.User_Ref_ID = g.Guest_ID
      LEFT JOIN Employee e ON ua.User_Type = 'Employee' AND ua.User_Ref_ID = e.Employee_ID
      ORDER BY ua.User_Account_ID DESC''')}

def target(type, id, db):
    if type not in ('guest', 'employee'):
        fail(400, 'Invalid user type')
    typ = 'Guest' if type == 'guest' else 'Employee'
    row = existing(db, typ, id)
    return typ, account(db, typ, id, 'Guest' if typ == 'Guest' else row.get('Role') or 'Receptionist')

@router.put('/users/{type}/{id}/role')
def set_role(type: str, id: int, body: dict = Body(...), user=Depends(permit('user:set:role')), db=Depends(get_db, scope="function")):
    role = body.get('role')
    if role not in ROLES:
        fail(400, 'Invalid role. Valid roles: Guest, Receptionist, Manager, Admin')
    typ, _ = target(type, id, db)
    if typ == user_type(user) and int(user['id']) == id:
        fail(403, 'You cannot change your own role')
    db.query('UPDATE User_Account SET Role = ? WHERE User_Type = ? AND User_Ref_ID = ?', [role, typ, id])
    revoke_all(db, typ, id)
    return {'message': f'Role updated to {role}'}

@router.post('/users/{type}/{id}/ban')
def ban_user(type: str, id: int, body: dict = Body(default={}), user=Depends(permit('user:ban')), db=Depends(get_db, scope="function")):
    typ, a = target(type, id, db)
    if a['Role'] == 'Admin':
        fail(403, 'An admin cannot ban another admin')
    if a['Banned']:
        fail(409, 'User is already banned')
    db.query('UPDATE User_Account SET Banned = 1, Banned_At = NOW(), Ban_Reason = ?, Banned_By = ? WHERE User_Type = ? AND User_Ref_ID = ?', [body.get('reason'), user['id'], typ, id])
    revoke_all(db, typ, id)
    return {'message': 'User banned'}

@router.post('/users/{type}/{id}/unban')
def unban_user(type: str, id: int, user=Depends(permit('user:unban')), db=Depends(get_db, scope="function")):
    typ, a = target(type, id, db)
    if not a['Banned']:
        fail(409, 'User is not banned')
    db.query('UPDATE User_Account SET Banned = 0, Banned_At = NULL, Ban_Reason = NULL, Banned_By = NULL WHERE User_Type = ? AND User_Ref_ID = ?', [typ, id])
    return {'message': 'User unbanned'}
