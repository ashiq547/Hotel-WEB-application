# Technical Design Document

## Stack and architecture

The React/TypeScript client uses Vite, Tailwind CSS and Axios. The Python 3.9+ backend uses FastAPI, Uvicorn, PyMySQL, PyJWT, bcrypt and python-dotenv. Data remains in the existing MySQL/MariaDB schema.

Requests follow this path:

```text
React client -> /api -> FastAPI routes -> security dependencies -> MySQL
```

Vite proxies `/api` to `http://localhost:5001` during development. OpenAPI is available at `/openapi.json`, with interactive documentation at `/docs`.

## Server files

| File | Responsibility |
|---|---|
| `server/app.py` | FastAPI entry point, CORS, health check, error handlers and route registration |
| `server/auth_api.py` | Login, profile, password changes and refresh sessions |
| `server/api.py` | Hotels, rooms, guests, employees, reservations, services, bills, reports and user administration |
| `server/security.py` | JWT, bcrypt with pepper, database roles, ownership and hotel membership |
| `server/db.py` | Request-scoped MySQL connection and transactions |
| `server/queries.json` | Parameterized SQL queries |
| `server/permissions.json` | Role-to-permission definitions |
| `server/seed.json` | Sample database records, with passwords hashed during initialization |
| `server/scripts/init_db.py` | Empty-database initialization; refuses existing tables |
| `server/run.py` | Python startup, reload, database initialization and test commands |
| `server/tests/` | pytest API/security tests and the expected method/path contract |
| `server/requirements.txt` | Python dependencies |

## Data and API

The core tables are `Hotel`, `Room`, `Guest`, `Employee`, `Reservation`, `Service`, `Service_Record` and `Bill`. Supporting tables are `User_Account`, `Refresh_Token` and `Hotel_Member`. `Available_Rooms` is a database view. The SQL schema is defined in `Hotel_Management_System.sql`; initialization adds the application enhancement columns.

The API keeps the existing `/api/auth`, `/api/hotels`, `/api/rooms`, `/api/guests`, `/api/employees`, `/api/reservations`, `/api/services`, `/api/bills`, `/api/reports` and `/api/users` route groups and field names. The full method/path contract is checked against `server/tests/expected_routes.json`. Errors use an `error` field, with HTTP statuses for validation, authentication, permissions, missing resources, conflicts and server failures.

Database connections are lazy and request-scoped. Successful requests commit before the response is sent; exceptions roll back, and connections close in all cases. Booking locks the selected room while creating the reservation and reserving the room. Bill generation updates billing, service links, reservation checkout and room availability in one transaction.

## Authentication and authorization

Passwords use bcrypt with a server-side pepper. Existing hashes remain compatible when the original `PEPPER` is retained. Access tokens are signed HS256 JWTs, with a default lifetime of 15 minutes. Axios sends them in the Authorization header.

Refresh tokens are random values stored in an HttpOnly cookie scoped to `/api/auth`. Only SHA-256 hashes are stored in MySQL. Refresh rotates the token; logout and session management revoke server-side sessions.

Roles and bans are read from `User_Account` on authenticated requests. Role permissions, guest ownership and hotel membership are enforced by the backend. Password changes and role changes revoke refresh sessions. Production requires `JWT_SECRET` and uses secure refresh cookies.

## Configuration and operations

Copy `server/.env.example` to `server/.env` and configure the database, JWT secret, pepper and allowed frontend origins. Secrets are excluded from Git. Reusing an existing database requires retaining the original secret and pepper; no database reset is needed.

```bash
python3 -m venv server/.venv
server/.venv/bin/python -m pip install -r server/requirements.txt
python3 server/run.py --reload
python3 server/run.py --test
```

Initialize sample data only in an empty database with `python3 server/run.py --init-db`. The initializer refuses nonempty databases.

Root npm commands remain convenient for running the frontend and backend together, but the server itself has no JavaScript runtime or npm dependencies.

Deploy the frontend using the root Vercel configuration. Deploy FastAPI on a Python-capable host with MySQL connectivity, and route frontend `/api` requests to it. Configure `CORS_ORIGINS` and production secrets for the deployed environment.

## Verification

pytest tests cover the API route contract, public and protected endpoints, JWT rejection, database roles and bans, guest ownership, login cookies, refresh rotation, profile access, booking, checkout billing, SQL parameter adaptation and transaction cleanup. The suite uses a mocked database; live MySQL integration must be checked separately in an environment with database access.
