# Code Standards
**Product:** Campus Event App | **Team:** Team Rocket | **Stack:** TypeScript, React, Next.js

## Style Guide
We follow the **Google TypeScript Style Guide** and enforce it via **ESLint with Airbnb config** (`eslint-config-airbnb-typescript`). All PRs must pass `npm run lint` with zero errors.

## Naming Conventions
- **Variables:** Use descriptive names that reveal intent. Boolean variables must use `is` or `has` prefix (e.g., `isLoggedIn`, `hasPermission`, `isLoading`)
- **Functions/Methods:** Use verb+noun pattern that describes what the function does (e.g., `fetchUserById`, `validateEventDate`, `renderEventCard`). Avoid vague verbs: no `handleData()`, `processStuff()`, `doThing()`
- **Constants:** Use UPPER_SNAKE_CASE for module-level constants (e.g., `MAX_EVENT_CAPACITY = 500`)
- **React Components:** PascalCase (e.g., `EventCard`, `UserProfile`)
- **React Hooks:** Prefix with `use` (e.g., `useEventData`, `useAuthStatus`)
- **No magic numbers:** Replace inline numbers with named constants

## Formatting
- **Indentation:** 2 spaces (no tabs)
- **Quotes:** Single quotes for strings, except JSX attributes use double quotes
- **Braces:** Opening brace on same line as declaration (`if (x) {`)
- **Line length:** Maximum 100 characters
- **Semicolons:** Required at end of statements

## Best Practices
- **DRY:** Extract repeated logic into utility functions. No copy-paste code blocks
- **Single Responsibility:** Each function does one thing. If you can't describe it in one sentence, split it
- **Clarity over cleverness:** Prefer readable code over clever one-liners. Future readers matter more than character count
- **No commented-out code:** Delete dead code; use git history to recover it
