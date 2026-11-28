# Hotel Management System

A full-stack hotel management and guest reservation application built with React, Node.js, Express, and MySQL.

The application provides separate guest and staff experiences. Guests can browse hotels and rooms, register, make reservations, view their stays, order services, and manage their profiles. Staff can manage hotels, rooms, employees, reservations, services, bills, reports, and role-based access.

## Features

- Guest registration and login
- Staff login with Admin, Manager, and Receptionist roles
- JWT authentication with secure refresh sessions
- Role-based access control, revocable access/refresh sessions, and session management
- Database-backed login lockout after 5 failed attempts for an account or 20 from an IP within 15 minutes
- Admin dashboard for user moderation, audit/security review, content moderation, and CSV export
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

- Node.js 20.19+ or 22.12+
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

Copy `server/.env.example` to `server/.env` and set your local database credentials:

```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=Hotel_Management_System

JWT_SECRET=
JWT_EXPIRES_IN=15m
PEPPER=
REFRESH_TTL_DAYS=7
BCRYPT_ROUNDS=10
FRONTEND_ORIGINS=http://localhost:3000

# Set private passwords of at least 12 characters before initializing the database.
DEMO_GUEST_PASSWORD=
DEMO_GUEST_ALT_PASSWORD=
DEMO_ADMIN_PASSWORD=
DEMO_SECOND_ADMIN_PASSWORD=
DEMO_RECEPTIONIST_PASSWORD=
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

The database initializer creates these accounts for development and demonstration. The passwords are intentionally not published in this repository; provide demo credentials separately through the instructor submission form.

### Staff account IDs and roles

| User type | User ID | Role |
|---|---:|---|
| Employee | 1 | Admin |
| Employee | 2 | Receptionist |
| Employee | 3 | Admin |

### Guest account IDs and roles

| User type | User ID | Role |
|---|---:|---|
| Guest | 1 | Guest |
| Guest | 2 | Guest |
| Guest | 3 | Guest |
| Guest | 4 | Guest |

Sample data includes six hotels, ten rooms, reservations, bills, and services. Demo credentials must be shared privately, not in this README.

### Shared hotel group example

The database initializer creates Hotel 1 as a shared group:

| Member | Group role | Group permissions |
|---|---|---|
| Employee 1 (Admin) | Owner | Rename/delete hotel; manage members; full hotel access |
| Employee 2 (Receptionist) | Member | Create and edit rooms; create reservations; cannot edit/delete reservations or assign services |
| Employee 3 (Admin) | Manager member | Member actions plus room/reservation management, service assignment, room deletion, and hotel detail edits; cannot rename/delete the hotel or manage members |

New guest, staff, and password-change credentials must be at least 12 characters and include at least one letter and one number.
Hotel owners can review the permission matrix and change an existing member's Member/Manager role in the hotel member screen.

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
| `/users` | Admin (users, activity, security, and content moderation) |

## REST API

The backend exposes APIs under `/api`:

| Area | Base path |
|---|---|
| Health check | `/api/health` |
| API documentation | `/api/docs` |
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

Admin endpoints under `/api/users` include `/audit`, `/security`, `/content`, `/bulk`, and `/export/{users,records,activity}`. User detail endpoints are `/api/users/{guest|employee}/:id`.
Hotel owners can review and manage group members through `/api/hotels/:id/members`; `PUT /api/hotels/:id/members/:employeeId` changes an existing member's role. The current user's group roles are returned by `/api/users/me/permissions`.

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

The root `vercel.json` configures the frontend build and client-side routes. The Express API has a separate Vercel configuration in `server/vercel.json`; deploy it as a second Vercel project with the project root set to `server/`.

For a split deployment, configure:

- **Frontend project:** set `VITE_API_BASE_URL` to the backend URL ending in `/api`, for example `https://your-api.example/api`.
- **API project:** set `FRONTEND_ORIGINS` to the exact deployed frontend origin (no trailing slash), and configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, and `PEPPER`.
- **Database:** use a hosted MySQL-compatible database. Local database files or localhost database connections will not persist or be reachable from Vercel.

Production requires random `JWT_SECRET` and `PEPPER` values of at least 32 characters each. Use HTTPS for the deployments; the refresh cookie is configured as secure and cross-site in production. Vercel deployment still requires you to create the projects, configure these environment variables, and provide hosted database credentials.

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
