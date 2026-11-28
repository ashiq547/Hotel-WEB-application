# Hotel Management System

A full-stack hotel management and guest reservation application built with React, Node.js, Express, and MySQL.

The application provides separate guest and staff experiences. Guests can browse hotels and rooms, register, make reservations, view their stays, order services, and manage their profiles. Staff can manage hotels, rooms, employees, reservations, services, bills, reports, and role-based access.

## Features

- Guest registration and login
- Staff login with Admin, Manager, and Receptionist roles
- JWT authentication with secure refresh sessions
- Role-based access control and session management
- Hotel and room browsing
- Reservation creation and status management
- Guest stay, service, and profile dashboards
- Hotel, room, employee, bill, and service management
- Revenue, occupancy, guest, and employee reports
- MySQL database initialization and sample data seeding

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Axios, React Router, Recharts |
| Backend | Node.js, Express.js, JWT, bcrypt, Cookie Parser |
| Database | MySQL or MariaDB with `mysql2` |
| Icons | Phosphor Icons |

## Project Structure

```text
Hotel-WEB-application/
├── client/                 # React and Vite frontend
│   ├── src/
│   │   ├── components/     # Shared layout and UI components
│   │   ├── context/        # Authentication context
│   │   ├── pages/          # Application pages
│   │   ├── services/       # Axios API client
│   │   ├── types/          # Shared TypeScript types
│   │   └── utils/          # Frontend utilities
│   └── vite.config.ts
├── server/                 # Express REST API
│   ├── config/             # MySQL connection pool
│   ├── controllers/        # Request and business logic
│   ├── middleware/         # Authentication and error handling
│   ├── routes/             # API route definitions
│   ├── scripts/            # Database initialization utilities
│   └── utils/              # RBAC, password, session, and account helpers
├── database/               # Database SQL resources
├── docs/                   # Project requirements and design documents
├── Hotel_Management_System.sql
├── package.json            # Root development scripts
└── vercel.json             # Frontend Vercel configuration
```

## Prerequisites

- Node.js 18 or newer
- npm
- MySQL or MariaDB

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/ashiq547/Hotel-WEB-application.git
cd Hotel-WEB-application
```

### 2. Install dependencies

Install dependencies for the root runner, frontend, and backend:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

### 3. Start MySQL

Ensure MySQL or MariaDB is running. The database is named `Hotel_Management_System` by default.

Create `server/.env`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=Hotel_Management_System

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=15m
PEPPER=replace_with_a_long_random_pepper
REFRESH_TTL_DAYS=7
BCRYPT_ROUNDS=10
```

Use different, securely generated values for `JWT_SECRET` and `PEPPER` in production.

### 4. Initialize the database

```bash
npm run db:init
```

This command creates the configured database and rebuilds its tables. It also seeds hotels, rooms, guests, staff accounts, reservations, bills, and services.

> **Warning:** Database initialization drops existing tables in the configured database. Do not run it against data you need to preserve.

### 5. Start the application

```bash
npm run dev
```

This starts:

- Frontend at `http://localhost:3000`
- Backend API at `http://localhost:5000`

The Vite development server proxies `/api` requests to the backend.

## Seeded Accounts

The database initializer creates these accounts for development and demonstration.

### Staff accounts

| Portal | Username | Password | Role |
|---|---|---|---|
| `/login` | `admin` | `admin123` | Admin |
| `/login` | `receptionist` | `admin123` | Receptionist |
| `/login` | `admin2` | `54321` | Admin |

### Guest accounts

| Portal | Username | Password |
|---|---|---|
| `/guest-login` | `tanvir` | `password` |
| `/guest-login` | `nusrat` | `password` |
| `/guest-login` | `arif` | `password` |
| `/guest-login` | `sabbir` | `1234` |

Guest login also accepts the seeded email addresses or phone numbers where supported by the login form.

## Application Pages

| Route | Access |
|---|---|
| `/` | Public home page |
| `/hotels` | Public hotel directory |
| `/rooms` | Public room inventory |
| `/register` | Guest self-registration |
| `/guest-login` | Guest login |
| `/login` | Staff login |
| `/guest-dashboard` | Guest |
| `/dashboard` | Admin, Manager, Receptionist |
| `/services` | Admin, Manager, Receptionist |
| `/billing` | Admin, Manager, Receptionist |
| `/employees` | Admin, Manager |
| `/reports` | Admin, Manager, Receptionist |
| `/settings` | Admin, Manager |
| `/profile` | Authenticated users |
| `/users` | Admin |

## REST API

The backend exposes APIs under `/api`:

| Area | Base path |
|---|---|
| Health check | `/api/health` |
| Authentication | `/api/auth` |
| Hotels | `/api/hotels` |
| Rooms | `/api/rooms` |
| Guests | `/api/guests` |
| Employees | `/api/employees` |
| Reservations | `/api/reservations` |
| Services | `/api/services` |
| Bills | `/api/bills` |
| Reports | `/api/reports` |
| Users | `/api/users` |

The frontend sends its short-lived access token as a Bearer authorization header. Refresh tokens are stored in an HTTP-only cookie.

## Root npm Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start frontend and backend in development mode |
| `npm run dev:server` | Start only the Express backend |
| `npm run dev:client` | Start only the Vite frontend |
| `npm run db:init` | Recreate and seed the MySQL database |
| `npm run build` | Create the production frontend build |

## Frontend Build

```bash
npm run build
```

The built static application is written to `client/dist`.

The included `vercel.json` configures Vercel to build the frontend and route all paths to `index.html`. The Express API must be deployed and reachable separately, or must be configured behind the same hosting environment.

## Database

The SQL schema is provided in `Hotel_Management_System.sql`. The initializer in `server/scripts/initDb.js` executes this schema and adds UI-related columns before inserting development data.

The database contains hotel, guest, employee, room, reservation, service, bill, and service-record entities. Available rooms are also exposed through the `Available_Rooms` view.

## Security Notes

- Do not commit `server/.env` or other environment files.
- Use a strong random `JWT_SECRET` and `PEPPER` in production.
- Change all seeded passwords before a public deployment.
- Run `npm run db:init` only for development or disposable databases.
- Keep frontend route guards consistent with server-side RBAC checks.

## Documentation

Additional project documents are available in [`docs/`](docs):

- [Product Requirements Document](docs/PRD.md)
- [Software Requirements Specification](docs/SRS.md)
- [Technical Design Document](docs/TDD.md)
