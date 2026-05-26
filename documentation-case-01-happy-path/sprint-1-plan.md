# Sprint 1 Plan | Campus Event App | Team Rocket | Due: May 30, 2026 | Rev 1.0 | 2026-05-01

## Team
- Alice — Scrum Master
- Bob — Product Owner
- Carol — Developer
- Dave — Developer

## Sprint Goal
Deliver user registration, login, event browsing, and event RSVP for the Campus Event App MVP demo on May 30.

## Capacity
- Team available hours: 120h
- Committed hours: 100h
- Buffer reserved: 20h (17%)

## Scrum Times
- Monday 10:00am — Daily Standup
- Wednesday 10:00am — Daily Standup
- Thursday 2:00pm — TA Visit (weekly)
- Friday 10:00am — Sprint Review / Retrospective Prep

---

## User Stories

### US-1: User Registration
**As a** new visitor, **I want to** register an account with my email and password, **so that** I can access the Campus Event App.

**Acceptance Criteria:**
1. Given I am on the registration page, when I submit a valid email and password (8+ chars), then my account is created and I am redirected to the dashboard.
2. Given I submit an email already in use, when I click Register, then I see the error "An account with this email already exists."

**Tasks:**
- [ ] Design registration form component with email/password fields and validation messages (4h) — Carol
- [ ] Implement POST /api/auth/register endpoint with email uniqueness check and bcrypt hashing (6h) — Dave
- [ ] Write Jest unit tests for registration validation logic (3h) — Carol
- [ ] Connect frontend form to API and handle success/error responses (3h) — Carol

**Story Total: 16h**

---

### US-2: User Login
**As a** registered user, **I want to** log in with my email and password, **so that** I can access my personalized dashboard.

**Acceptance Criteria:**
1. Given I enter valid credentials, when I click Log In, then I am authenticated and redirected to my dashboard with my name displayed.
2. Given I enter an incorrect password three times, when I attempt a fourth login, then my account is temporarily locked for 15 minutes and I see a lockout message.

**Tasks:**
- [ ] Build login form component with field validation and error display (3h) — Carol
- [ ] Implement POST /api/auth/login with JWT issuance and rate-limiting middleware (6h) — Dave
- [ ] Add account lockout logic after 3 failed attempts (4h) — Dave
- [ ] Write unit tests for login endpoint and lockout behavior (4h) — Carol

**Story Total: 17h**

---

### US-3: Browse Upcoming Events
**As a** logged-in student, **I want to** browse a list of upcoming campus events, **so that** I can find events relevant to my interests.

**Acceptance Criteria:**
1. Given I am on the events page, when the page loads, then I see a paginated list of events sorted by date with title, date, location, and category.
2. Given I filter by category "Academic", when results update, then only events tagged "Academic" are shown.

**Tasks:**
- [ ] Create EventList component with pagination and category filter UI (5h) — Carol
- [ ] Implement GET /api/events endpoint with query params for category and page (4h) — Dave
- [ ] Seed database with 20 sample events across 4 categories (2h) — Bob
- [ ] Write integration test for event list filtering (3h) — Carol

**Story Total: 14h**

---

### US-4: RSVP to an Event
**As a** logged-in student, **I want to** RSVP to an event, **so that** I can keep track of events I plan to attend.

**Acceptance Criteria:**
1. Given I am viewing an event detail page, when I click "RSVP", then my RSVP is saved and the button changes to "You're going" with a green indicator.
2. Given I have already RSVP'd, when I click "Cancel RSVP", then my RSVP is removed and the button returns to its default state.

**Tasks:**
- [ ] Add RSVP button component with toggling state and optimistic UI update (4h) — Carol
- [ ] Implement POST /api/events/:id/rsvp and DELETE /api/events/:id/rsvp endpoints (5h) — Dave
- [ ] Display RSVP count on event detail page (2h) — Carol
- [ ] Write unit tests for RSVP toggle endpoints (3h) — Dave

**Story Total: 14h**

---

## Initial Task Assignments
- Carol: US-1 tasks 1, 3, 4 · US-2 task 1 · US-3 tasks 1, 4 · US-4 tasks 1, 3
- Dave: US-1 task 2 · US-2 tasks 2, 3 · US-3 task 2 · US-4 tasks 2, 4
- Bob: US-3 task 3 (seed data), Product Backlog grooming
- Alice: Facilitates standups, removes blockers, coordinates TA visit agenda

**Total committed: 61h (Alice/Bob overhead ~39h = 100h total)**
