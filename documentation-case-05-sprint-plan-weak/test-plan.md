# Test Plan | Campus Event App | Team Rocket | Rev 1.0 | 2026-05-01

## Test Scenarios

### Scenario 1: User Registration (US-1)
**Given** a new user enters `test@campus.edu` and `Pass123!`
**When** they click Register
**Then** account is created and user is redirected to dashboard

**Inputs:** Email: `test@campus.edu`, Password: `Pass123!`
**Expected Output:** HTTP 201, redirect to `/dashboard`
**Result:** Pass

## Unit Tests
Unit tests in `/tests/unit/` run via Jest (`npm test`).

| Suite | Tests | Passed | Failed |
|-------|-------|--------|--------|
| `auth/register.test.ts` | 5 | 5 | 0 |

**Total: 5 passed, 0 failed**
