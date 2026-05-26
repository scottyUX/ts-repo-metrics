# Sprint 1 Plan | Campus Event App | Team Rocket | Due: May 30, 2026 | Rev 1.0 | 2026-05-01

## Team
- Alice — Scrum Master
- Bob — Product Owner
- Carol — Developer
- Dave — Developer

## Sprint Goal
Deliver user registration, login, and event browsing for the MVP demo.

## Capacity
- Team available hours: 90h
- Committed hours: 75h
- Buffer reserved: 15h (17%)

## Scrum Times
- Monday 10:00am — Daily Standup
- Wednesday 10:00am — Daily Standup
- Thursday 2:00pm — TA Visit
- Friday 10:00am — Sprint Review

---

## User Stories

### US-1: User Registration
**As a** new user, **I want to** register an account, **so that** I can access the platform.

**Acceptance Criteria:**
1. Given I submit a valid email and password, then my account is created and I am redirected to the dashboard.
2. Given I submit a duplicate email, then I see the error "An account with this email already exists."

**Tasks:**
- [ ] Code registration form component with email/password fields and validation (4h) — Carol
- [ ] Write POST /api/auth/register endpoint with email uniqueness check (6h) — Dave
- [ ] Design error state UI for duplicate email and empty fields (2h) — Carol

**Story Total: 12h**

---

### US-2: User Login
**As a** registered user, **I want to** log in, **so that** I can view my personalized dashboard.

**Acceptance Criteria:**
1. Given I enter valid credentials, then I am authenticated and redirected to my dashboard.
2. Given I enter an incorrect password, then I see the error "Invalid email or password."

**Tasks:**
- [ ] Code login form component with field validation (3h) — Carol
- [ ] Write POST /api/auth/login endpoint with JWT issuance (5h) — Dave
- [ ] Design redirect logic from login to dashboard (2h) — Carol

**Story Total: 10h**

---

### US-3: Browse Upcoming Events
**As a** student, **I want to** browse upcoming events, **so that** I can find ones relevant to my interests.

**Acceptance Criteria:**
1. Given I am on the events page, then I see events sorted by date with title, date, and location.
2. Given I filter by category, then only matching events are displayed.

**Tasks:**
- [ ] Code EventList component with pagination and category filter (5h) — Carol
- [ ] Write GET /api/events endpoint with category and pagination params (4h) — Dave
- [ ] Design category filter UI with clear active state (2h) — Carol

**Story Total: 11h**

---

## Initial Task Assignments
- Carol: US-1 tasks 1, 3 · US-2 tasks 1, 3 · US-3 tasks 1, 3
- Dave: US-1 task 2 · US-2 task 2 · US-3 task 2
- Bob: Backlog grooming
- Alice: Standup facilitation, blocker removal
