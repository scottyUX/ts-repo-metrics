# Definition of Done | Campus Event App | Team Rocket | Rev 1.0 | 2026-05-01

## Task Level — "Did we build it right?"

A task is done when ALL of the following are true:

- Code reviewed by at least one other team member before merging into main
- All unit tests pass in CI (`npm test` returns 0 failures)
- Code pushed to `main` branch via pull request (no direct pushes)
- No ESLint errors (`npm run lint` passes with 0 errors)
- External APIs and public functions documented with JSDoc comments

## User Story Level — "Did we build the right thing?"

A user story is done when ALL of the following are true:

- All tasks for the story are marked complete and meet the Task-Level DoD
- All acceptance criteria tests have been executed and results documented in the test plan
- Feature reviewed and approved by the Product Owner (verbal or written sign-off)
- Help text or user-facing documentation updated if the feature introduces new UI elements or user interactions
