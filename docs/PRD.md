# Product Requirements Document (PRD)

**Project:** Hotel Web Application
**Version:** 1.0
**Date:** 10 October 2026

---

## 1. Overview
The Hotel Web Application lets guests browse hotel rooms and book them online. It lets hotel staff (admins) manage rooms and bookings from one place, replacing paper records and phone calls.

## 2. Problem Statement
Small hotels often handle room availability and bookings by phone or on paper. This causes double bookings, lost records, and slow service. Guests cannot see available rooms or prices without calling.

## 3. Goals
- Let guests see rooms and book them online.
- Let admins manage rooms and bookings easily.
- Prevent double bookings for the same room and dates.
- Keep user data and access secure.

## 4. Non-Goals (Out of Scope)
- Online payment processing
- Multi-hotel or chain support
- Mobile app
- Email or SMS notifications
- Reviews and ratings

## 5. Target Users

| User | Description | Main Needs |
|---|---|---|
| Guest | A person who wants to book a room | Browse rooms, book, view and cancel own bookings |
| Admin | Hotel staff or manager | Manage rooms, view and manage all bookings, manage users |

## 6. Release Plan

| Release | Purpose | Focus |
|---|---|---|
| **MVP** | Mid-term demo | Core features through REST APIs, running locally |
| **Beta** | Final demo | Authentication, roles (RBAC), profile dashboard, permissions, deployment |

## 7. Features

| ID | Feature | Description | Release |
|---|---|---|---|
| F-01 | Room Management | Admin can create, view, update, delete rooms | MVP |
| F-02 | Room Listing | Anyone can view the list of rooms and room details | MVP |
| F-03 | Booking Management | Create, view, update, cancel bookings | MVP |
| F-04 | Availability Check | System blocks overlapping bookings for the same room | MVP |
| F-05 | Basic Web UI | React pages for rooms and bookings | MVP |
| F-06 | Registration and Login | Users sign up and log in with JWT | Beta |
| F-07 | Role-Based Access (RBAC) | Roles: Guest and Admin with different permissions | Beta |
| F-08 | User Profile Dashboard | Guest sees profile and own bookings; admin sees summary | Beta |
| F-09 | Security Scopes/Permissions | Protected routes; guests can only access their own data | Beta |
| F-10 | Deployment | App hosted online | Beta |

## 8. User Stories

**MVP**
- As a guest, I want to see all rooms with price and type, so I can choose one.
- As a guest, I want to book a room for chosen dates, so I can reserve it.
- As an admin, I want to add, edit and delete rooms, so the listing stays correct.
- As an admin, I want to see all bookings, so I can manage the hotel.

**Beta**
- As a user, I want to register and log in, so my bookings are private.
- As a guest, I want a profile dashboard, so I can see and cancel my bookings.
- As an admin, I want only admins to access management pages, so data stays safe.

## 9. Success Metrics
- All MVP features work through REST APIs and the UI locally by the mid-term demo.
- No two bookings overlap for the same room.
- Protected endpoints reject requests without a valid token (Beta).
- App is live and working at the final demo.

## 10. Assumptions and Constraints
- Single hotel, small number of rooms.
- Tech stack: React 18, TypeScript, Vite, Tailwind CSS, Phosphor Icons, Axios, Node.js, Express.js, JWT, Dotenv.
- Payment is out of scope; booking is a reservation only.
- Scope is kept small so the project can be completed and secured.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Scope too large | Keep to the features above; finish MVP first |
| Double bookings | Check date overlap before saving a booking |
| Security mistakes | Hash passwords, validate input, protect routes |
