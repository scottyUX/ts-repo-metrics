# Sprint 1 Plan | Task Manager App | Team Nova | Due: June 7, 2026 | Rev 1.0 | 2026-05-10

## Team
- Sam — Scrum Master
- Priya — Product Owner
- Leo — Developer
- Mia — Developer

## Sprint Goal
Enable users to create, view, and complete tasks in the Task Manager App.

## Capacity
- Team available hours: 80h
- Committed hours: 66h
- Buffer reserved: 14h (17%)

## Scrum Times
- Tuesday 9:00am — Daily Standup
- Thursday 9:00am — Daily Standup
- Thursday 3:00pm — TA Visit
- Friday 2:00pm — Sprint Review

---

## User Stories

### US-1: Create a Task
**As a** logged-in user, **I want to** create a new task with a title and due date, **so that** I can track what I need to do.

**Acceptance Criteria:**
1. Given I submit a title and valid due date, the task appears in my task list within 1 second.
2. Given I submit with an empty title, I see the error "Title is required."

**Tasks:**
- [ ] Build CreateTask form component with title and date fields (4h) — Leo
- [ ] Implement POST /api/tasks endpoint with validation (4h) — Mia
- [ ] Write unit tests for task creation (3h) — Leo

**Story Total: 11h**

---

### US-2: View My Tasks
**As a** logged-in user, **I want to** see a list of all my tasks, **so that** I know what is pending.

**Acceptance Criteria:**
1. Given I navigate to /tasks, I see all my tasks sorted by due date.
2. Given I have no tasks, I see the message "No tasks yet — create one!"

**Tasks:**
- [ ] Build TaskList component with sorting (4h) — Leo
- [ ] Implement GET /api/tasks endpoint (3h) — Mia
- [ ] Write unit tests for task list retrieval (3h) — Mia

**Story Total: 10h**

---

### US-3: Mark a Task Complete
**As a** logged-in user, **I want to** mark a task as complete, **so that** I can track my progress.

**Acceptance Criteria:**
1. Given I click "Complete" on a task, it moves to the completed section with a timestamp.
2. Given a task is already complete, the "Complete" button is disabled.

**Tasks:**
- [ ] Add complete toggle button to TaskCard component (3h) — Leo
- [ ] Implement PATCH /api/tasks/:id endpoint for status update (4h) — Mia
- [ ] Write unit tests for task completion (3h) — Leo

**Story Total: 10h**

---

## Initial Task Assignments
- Leo: US-1 tasks 1, 3 · US-2 task 1 · US-3 tasks 1, 3
- Mia: US-1 task 2 · US-2 tasks 2, 3 · US-3 task 2
- Sam: Facilitation, blocker removal
- Priya: Backlog grooming, stakeholder updates
