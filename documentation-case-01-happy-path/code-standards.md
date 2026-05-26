# Code Standards | Campus Event App | Team Rocket | Rev 1.0 | 2026-05-01

## Style Guides

This project follows the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) and enforces rules via the [Airbnb ESLint config](https://github.com/airbnb/javascript) (`eslint-config-airbnb-typescript`).

---

## Naming Conventions

- **Boolean variables** must use the `is` or `has` prefix (e.g., `isLoading`, `hasError`, `isAuthenticated`)
- **Functions** are named with a verb+noun pattern (e.g., `fetchEvents`, `renderLoginForm`, `validateEmail`)
- **No magic numbers** — extract numeric literals into named constants (e.g., `const MAX_LOGIN_ATTEMPTS = 3`)
- **Constants** use `UPPER_SNAKE_CASE`; variables and parameters use `camelCase`

---

## Formatting

- **Indentation:** 2 spaces (no tabs)
- **Opening braces:** same line as the statement (`if (x) {`, not on the next line)
- **Strings:** single quotes for all string literals; template literals for interpolation
- **Semicolons:** required at end of all statements
- **Max line length:** 100 characters

---

## Best Practices

- **DRY (Don't Repeat Yourself):** extract repeated logic into shared utility functions in `/lib/utils/`
- **Single responsibility:** each function does one thing; if a function needs a comment to explain what it does, it should be split
- **Clarity over cleverness:** prefer readable code over terse one-liners; code is read more than it is written
- **No `any` types:** use proper TypeScript types or `unknown` with type guards

---

## React-Specific

- **Components** are named in PascalCase and live in `/components/` (e.g., `EventCard.tsx`, `LoginForm.tsx`)
- **Custom hooks** are prefixed with `use` (e.g., `useAuth`, `useEventList`)
- **Props interfaces** are defined above the component and named `<ComponentName>Props`

---

## Stack Reference

This repo uses **TypeScript** (strict mode) and **React 18** for the frontend, with **Node.js/Express** for the API layer. All new code must be fully typed.
