# Software Requirements Specification (SRS)

**Project:** Hotel Web Application
**Version:** 1.0
**Date:** 10 October 2026

---

## 1. Introduction

### 1.1 Purpose
This document describes the functional and non-functional requirements of the Hotel Web Application. It is for developers, testers and evaluators.

### 1.2 Scope
The system is a web application where guests browse and book hotel rooms and admins manage rooms and bookings. It has a React frontend and a Node.js/Express REST API backend.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| MVP | First release for the mid-term demo |
| Beta | Second release for the final demo |
| JWT | JSON Web Token, used for authentication |
| RBAC | Role-Based Access Control |
| CRUD | Create, Read, Update, Delete |
| API | Application Programming Interface (REST) |

### 1.4 References
- Product Requirements Document (PRD.md)
- Technical Design Document (TDD.md)

## 2. Overall Description

### 2.1 Product Perspective
A standalone web application with a frontend client and a backend REST API connected to a database.

### 2.2 User Classes

| User | Description |
|---|---|
| Guest | Browses rooms, books rooms, manages own bookings |
| Admin | Manages rooms, all bookings and users |

### 2.3 Operating Environment
- Modern web browser (Chrome, Firefox, Edge)
- Node.js server
- MVP runs locally; Beta is deployed online

### 2.4 Constraints
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Phosphor Icons, Axios
- Backend: Node.js, Express.js, JWT, Dotenv

### 2.5 Assumptions
- One hotel only.
- No online payment.
- Users have internet access.

## 3. Functional Requirements

### 3.1 Room Management

| ID | Requirement | Release |
|---|---|---|
| FR-01 | The system shall allow an admin to create a room with number, type, price, capacity and description. | MVP |
| FR-02 | The system shall allow anyone to view a list of all rooms. | MVP |
| FR-03 | The system shall allow anyone to view the details of one room. | MVP |
| FR-04 | The system shall allow an admin to update a room. | MVP |
| FR-05 | The system shall allow an admin to delete a room. | MVP |
| FR-06 | The system shall not allow two rooms with the same room number. | MVP |

### 3.2 Booking Management

| ID | Requirement | Release |
|---|---|---|
| FR-07 | The system shall allow a booking to be created with room, guest name, check-in date and check-out date. | MVP |
| FR-08 | The system shall reject a booking if the check-out date is not after the check-in date. | MVP |
| FR-09 | The system shall reject a booking if the room is already booked for overlapping dates. | MVP |
| FR-10 | The system shall calculate the total price from nights and room price. | MVP |
| FR-11 | The system shall allow viewing bookings. | MVP |
| FR-12 | The system shall allow a booking to be updated or cancelled. | MVP |

### 3.3 Authentication (Beta)

| ID | Requirement | Release |
|---|---|---|
| FR-13 | The system shall allow a user to register with name, email and password. | Beta |
| FR-14 | The system shall store passwords as hashes, never as plain text. | Beta |
| FR-15 | The system shall allow a user to log in and receive a JWT. | Beta |
| FR-16 | The system shall reject requests to protected endpoints without a valid JWT. | Beta |

### 3.4 Roles and Permissions (Beta)

| ID | Requirement | Release |
|---|---|---|
| FR-17 | The system shall support two roles: Guest and Admin. | Beta |
| FR-18 | Only admins shall create, update or delete rooms. | Beta |
| FR-19 | Guests shall only view, update and cancel their own bookings. | Beta |
| FR-20 | Admins shall view and manage all bookings and users. | Beta |

### 3.5 Profile Dashboard (Beta)

| ID | Requirement | Release |
|---|---|---|
| FR-21 | A guest shall see their profile and list of their bookings. | Beta |
| FR-22 | A guest shall be able to update their name and password. | Beta |
| FR-23 | An admin shall see a summary: total rooms, total bookings, total users. | Beta |

### 3.6 Frontend

| ID | Requirement | Release |
|---|---|---|
| FR-24 | The UI shall show a rooms page, room details page and booking form. | MVP |
| FR-25 | The UI shall show login and register pages. | Beta |
| FR-26 | The UI shall hide admin pages from guests. | Beta |

## 4. Non-Functional Requirements

| ID | Category | Requirement | Release |
|---|---|---|---|
| NFR-01 | Security | Passwords shall be hashed with bcrypt. | Beta |
| NFR-02 | Security | JWT secret and database URL shall be stored in environment variables (Dotenv), not in code. | MVP |
| NFR-03 | Security | All input shall be validated on the server. | MVP |
| NFR-04 | Performance | API responses should take under 2 seconds under normal use. | MVP |
| NFR-05 | Usability | The UI shall work on desktop and mobile screens. | MVP |
| NFR-06 | Reliability | The API shall return clear error messages and correct HTTP status codes. | MVP |
| NFR-07 | Maintainability | Code shall follow a clear folder structure (routes, controllers, models). | MVP |
| NFR-08 | Availability | The deployed app shall be reachable online at the final demo. | Beta |

## 5. External Interface Requirements

### 5.1 User Interface
React web pages styled with Tailwind CSS and Phosphor Icons.

### 5.2 Software Interface
The frontend calls the backend REST API with Axios, using JSON.

### 5.3 Database Interface
The backend connects to the database through environment-configured connection settings.

## 6. Use Cases

| ID | Use Case | Actor | Release |
|---|---|---|---|
| UC-01 | View rooms | Guest | MVP |
| UC-02 | Book a room | Guest | MVP |
| UC-03 | Manage rooms | Admin | MVP |
| UC-04 | Manage bookings | Admin | MVP |
| UC-05 | Register and log in | Guest | Beta |
| UC-06 | View profile dashboard | Guest | Beta |
| UC-07 | View admin summary | Admin | Beta |

**UC-02 Book a room (main flow)**
1. Guest opens the rooms page and selects a room.
2. Guest enters check-in and check-out dates.
3. System checks the dates and availability.
4. System saves the booking and shows a confirmation with total price.

*Alternate flow:* If the room is not available, the system shows an error and the booking is not saved.
