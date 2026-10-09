# Technical Design Document (TDD)

**Project:** Hotel Web Application
**Version:** 1.0
**Date:** 10 October 2026

---

## 1. Introduction
This document explains how the Hotel Web Application will be built. It follows the requirements in PRD.md and SRS.md.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Phosphor Icons, Axios |
| Backend | Node.js, Express.js, JWT Authentication, Dotenv |
| Database | MongoDB with Mongoose |
| Password hashing | bcrypt |
| Tools | VS Code, Git, GitHub |
| Deployment (Beta) | Vercel (frontend), Render (backend), MongoDB Atlas (database) |

## 3. Architecture

```
+----------------+      HTTPS / JSON      +------------------+      +-----------+
|  React Client  |  ------ Axios ------>  |  Express REST    | ---> | MongoDB   |
|  (Vite, TS)    |  <-----------------    |  API (Node.js)   | <--- |           |
+----------------+                        +------------------+      +-----------+
                                            |  Middleware: JWT auth, RBAC,
                                            |  validation, error handler
```

The backend uses a layered design: **routes -> controllers -> models**.

## 4. Folder Structure

```
hotel-web-application/
├── docs/
│   ├── PRD.md
│   ├── SRS.md
│   └── TDD.md
├── backend/
│   ├── src/
│   │   ├── config/        # db connection, env
│   │   ├── models/        # User, Room, Booking
│   │   ├── controllers/   # business logic
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # auth, role check, errors
│   │   └── server.js
│   ├── .env
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/           # Axios setup
    │   ├── components/
    │   ├── pages/
    │   ├── context/       # auth state (Beta)
    │   └── main.tsx
    └── package.json
```

## 5. Database Design

### User (Beta)

| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | Primary key |
| name | String | Required |
| email | String | Required, unique |
| password | String | bcrypt hash |
| role | String | `guest` or `admin`, default `guest` |
| createdAt | Date | Auto |

### Room (MVP)

| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | Primary key |
| roomNumber | String | Required, unique |
| type | String | single, double, suite |
| price | Number | Price per night |
| capacity | Number | Number of guests |
| description | String | Optional |

### Booking (MVP)

| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | Primary key |
| room | ObjectId | Reference to Room |
| guestName | String | MVP: entered in form |
| user | ObjectId | Reference to User (Beta) |
| checkIn | Date | Required |
| checkOut | Date | Must be after checkIn |
| totalPrice | Number | nights x room price |
| status | String | `confirmed` or `cancelled` |

**Relationships:** one Room has many Bookings; one User has many Bookings.

## 6. REST API Design

Base URL: `/api`

| Method | Endpoint | Description | Auth | Role | Release |
|---|---|---|---|---|---|
| GET | /rooms | List all rooms | No | Any | MVP |
| GET | /rooms/:id | Get one room | No | Any | MVP |
| POST | /rooms | Create room | MVP: No / Beta: Yes | Admin | MVP |
| PUT | /rooms/:id | Update room | MVP: No / Beta: Yes | Admin | MVP |
| DELETE | /rooms/:id | Delete room | MVP: No / Beta: Yes | Admin | MVP |
| GET | /bookings | List bookings | MVP: No / Beta: Yes | Admin: all, Guest: own | MVP |
| GET | /bookings/:id | Get one booking | MVP: No / Beta: Yes | Owner or Admin | MVP |
| POST | /bookings | Create booking | MVP: No / Beta: Yes | Guest, Admin | MVP |
| PUT | /bookings/:id | Update booking | MVP: No / Beta: Yes | Owner or Admin | MVP |
| DELETE | /bookings/:id | Cancel booking | MVP: No / Beta: Yes | Owner or Admin | MVP |
| POST | /auth/register | Register user | No | Any | Beta |
| POST | /auth/login | Log in, get JWT | No | Any | Beta |
| GET | /users/me | Get own profile | Yes | Any | Beta |
| PUT | /users/me | Update own profile | Yes | Any | Beta |
| GET | /admin/summary | Totals for dashboard | Yes | Admin | Beta |

### Standard responses
- `200 OK`, `201 Created`, `400 Bad Request` (validation), `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict` (booking overlap), `500 Server Error`.

## 7. Key Logic

### Booking overlap check
A new booking for a room conflicts if an existing `confirmed` booking for the same room satisfies:

```
existing.checkIn < new.checkOut  AND  existing.checkOut > new.checkIn
```

If any match is found, return `409 Conflict`.

### Total price
`totalPrice = number of nights x room.price`

## 8. Authentication and Authorization (Beta)

1. User registers; password is hashed with bcrypt and saved.
2. User logs in; server checks the password and returns a signed JWT containing `userId` and `role`.
3. Frontend stores the token and sends `Authorization: Bearer <token>` with each Axios request.
4. `authMiddleware` verifies the token and attaches the user to the request.
5. `roleMiddleware('admin')` blocks users without the required role (`403`).
6. Ownership check: guests can only access bookings where `booking.user` equals their id.

## 9. Security Considerations
- Secrets (`JWT_SECRET`, `MONGO_URI`, `PORT`) are kept in `.env`, which is listed in `.gitignore`.
- Passwords are hashed, never returned in responses.
- Server-side validation on all inputs.
- CORS limited to the frontend origin.
- JWT has an expiry time (for example 1 day).
- Generic login error message to avoid revealing which field was wrong.

## 10. Frontend Design

| Page | Route | Access | Release |
|---|---|---|---|
| Home / Rooms list | / | Public | MVP |
| Room details and booking form | /rooms/:id | Public (MVP), Login required (Beta) | MVP |
| Admin: manage rooms | /admin/rooms | Admin | MVP |
| Admin: manage bookings | /admin/bookings | Admin | MVP |
| Login | /login | Public | Beta |
| Register | /register | Public | Beta |
| Profile dashboard | /dashboard | Logged-in user | Beta |

Axios is configured once in `src/api` with the base URL and a request interceptor that adds the token (Beta).

## 11. Testing Plan

| Type | What | Tool |
|---|---|---|
| API testing | Test every endpoint, including error cases | Postman |
| Manual UI testing | Walk through each use case | Browser |
| Unit tests (optional) | Booking overlap and price logic | Jest |

Key test cases:
- Create a booking with valid dates: success.
- Create a booking with overlapping dates: `409`.
- Check-out before check-in: `400`.
- Guest calls an admin endpoint: `403` (Beta).
- No token on a protected route: `401` (Beta).

## 12. Deployment Plan (Beta)
- Frontend: build with Vite and deploy to Vercel.
- Backend: deploy to Render with environment variables set.
- Database: MongoDB Atlas (free tier).
- Update the frontend API base URL and CORS origin to the deployed URLs.

## 13. Milestones

| Milestone | Content | Release |
|---|---|---|
| 1 | Project setup, DB connection, Room CRUD API | MVP |
| 2 | Booking CRUD API with overlap check | MVP |
| 3 | React pages for rooms and bookings | MVP |
| 4 | Register and login with JWT | Beta |
| 5 | RBAC, permissions, profile dashboard | Beta |
| 6 | Testing and deployment | Beta |
