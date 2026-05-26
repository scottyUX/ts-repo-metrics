# Test Plan | Campus Event App | Team Rocket | Rev 1.0 | 2026-05-01

## Test Scenarios

---

### Scenario 1: Successful User Registration (US-1)

**Given** a new visitor is on the `/register` page  
**When** they enter `newuser@campus.edu` and password `Secure123!` and click "Register"  
**Then** their account is created, they are redirected to `/dashboard`, and a welcome message "Welcome, newuser!" is displayed

**Inputs:** Email: `newuser@campus.edu`, Password: `Secure123!`  
**Expected Output:** HTTP 201 response, JWT cookie set, redirect to `/dashboard`, "Welcome, newuser!" visible  
**Result:** Pass

---

### Scenario 2: Login with Valid Credentials (US-2)

**Given** a registered user with email `alice@campus.edu` and password `MyPass456!` is on the `/login` page  
**When** they enter their credentials and click "Log In"  
**Then** they are authenticated, a JWT is issued, and they are redirected to `/dashboard` showing "Welcome back, Alice"

**Inputs:** Email: `alice@campus.edu`, Password: `MyPass456!`  
**Expected Output:** HTTP 200 response, JWT cookie set, redirect to `/dashboard`, "Welcome back, Alice" visible  
**Result:** Pass

---

### Scenario 3: Browse and Filter Events by Category (US-3)

**Given** a logged-in student is on the `/events` page  
**When** they select the "Academic" category filter  
**Then** the event list refreshes and displays only events tagged "Academic" (e.g., "CS Capstone Showcase", "Math Club Lecture")

**Inputs:** Category filter: `Academic`  
**Expected Output:** Event list contains only events where `category === "Academic"`, pagination shows correct count  
**Result:** Pass

---

## Unit Tests

Unit tests are located in `/tests/unit/` and run via **Jest** (`npm test`).

| Suite                          | File                              | Tests | Passed | Failed |
|--------------------------------|-----------------------------------|-------|--------|--------|
| Registration validation        | `auth/register.test.ts`           | 8     | 8      | 0      |
| Login + lockout logic          | `auth/login.test.ts`              | 10    | 10     | 0      |
| Event list filtering           | `events/eventList.test.ts`        | 6     | 6      | 0      |
| RSVP toggle endpoints          | `events/rsvp.test.ts`             | 5     | 5      | 0      |

**Total: 29 tests — 29 passed, 0 failed**
