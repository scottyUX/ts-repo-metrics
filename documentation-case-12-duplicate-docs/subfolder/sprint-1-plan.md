# Sprint 1 Plan
**Product:** Campus Event App | **Team:** Team Rocket | **Sprint:** 1 | **Dates:** May 1–14, 2026

## Sprint Goal
Deliver core event browsing functionality to students.

## Team Capacity
- Dave: 20h available (frontend)
- Emma: 18h available (backend)
- Frank: 16h available (full-stack)

## User Stories

### US-01: View upcoming campus events (5 pts)
*As a student, I want to see a list of upcoming campus events so I can find things to do.*

**Acceptance Criteria:**
- Events list shows title, date, and location
- List sorted newest first
- Pagination added for more than 10 events

**Tasks:**
- [ ] Build EventFeed component (Dave, 4h)
- [ ] Implement events API route (Emma, 3h)
- [ ] Add pagination component (Frank, 3h)
- [ ] Write tests for EventFeed (Dave, 2h)

### US-02: RSVP to an event (3 pts)
*As a student, I want to RSVP to an event so the organizer knows I'm attending.*

**Tasks:**
- [ ] Add RSVP button to EventCard (Dave, 2h)
- [ ] Implement POST /api/rsvp endpoint (Emma, 2h)
