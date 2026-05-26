# Sprint 1 Plan
**Product:** Campus Event App | **Team:** Team Rocket | **Sprint:** 1 | **Dates:** May 1–14, 2026

## Sprint Goal
Enable students to discover and view upcoming campus events.

## Team Capacity
- Alice: 20h available (frontend)
- Bob: 18h available (backend)
- Carol: 16h available (full-stack)

## User Stories

### US-01: View upcoming campus events (5 pts)
*As a student, I want to see a list of upcoming campus events so I can plan my schedule.*

**Acceptance Criteria:**
- Events displayed with title, date, time, and location
- Events sorted by date ascending
- Empty state shown when no events exist

**Tasks:**
- [ ] Create EventList component (Alice, 3h)
- [ ] Create EventCard component (Alice, 2h)
- [ ] Implement GET /api/events endpoint (Bob, 3h)
- [ ] Write unit tests for EventList and EventCard (Carol, 2h)

### US-02: Filter events by category (3 pts)
*As a student, I want to filter events by category so I only see events relevant to me.*

**Acceptance Criteria:**
- Category filter buttons displayed above event list
- Selecting a category shows only matching events

**Tasks:**
- [ ] Add category filter UI (Alice, 2h)
- [ ] Implement filter logic in EventList (Carol, 2h)
- [ ] Write unit tests for filter behavior (Carol, 1h)
