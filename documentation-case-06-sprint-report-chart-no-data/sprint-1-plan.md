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
1. Given I submit valid credentials, then my account is created and I am redirected to the dashboard.
2. Given I submit a duplicate email, then I see an error message.

**Tasks:**
- [ ] Code registration form component (4h) — Carol
- [ ] Write POST /api/auth/register endpoint (6h) — Dave
- [ ] Write unit tests for registration (3h) — Carol

**Story Total: 13h**

---

### US-2: User Login
**As a** registered user, **I want to** log in, **so that** I can view my dashboard.

**Acceptance Criteria:**
1. Given valid credentials, I am redirected to my dashboard.
2. Given invalid credentials, I see an error message.

**Tasks:**
- [ ] Code login form component (3h) — Carol
- [ ] Write POST /api/auth/login endpoint (5h) — Dave
- [ ] Write unit tests for login (3h) — Carol

**Story Total: 11h**

---

### US-3: Browse Upcoming Events
**As a** student, **I want to** browse upcoming events, **so that** I can find relevant ones.

**Acceptance Criteria:**
1. Given I am on the events page, I see events sorted by date.
2. Given I filter by category, only matching events are shown.

**Tasks:**
- [ ] Code EventList component with filter (5h) — Carol
- [ ] Write GET /api/events endpoint (4h) — Dave
- [ ] Write unit tests for event list (3h) — Carol

**Story Total: 12h**

---

## Initial Task Assignments
- Carol: US-1 tasks 1, 3 · US-2 tasks 1, 3 · US-3 tasks 1, 3
- Dave: US-1 task 2 · US-2 task 2 · US-3 task 2
- Bob: Backlog grooming
- Alice: Standup facilitation
