# COL-02-T-1

List the books.

## Repository

The repository is checked out at `/app` at commit `4122f9a921e8471c7d4fd06551e1dadf79694787` of `JoKHerre/Bookworm`, with dependencies installed.
Make the change described above. Tests that exercise it will be run afterwards; do not modify or delete existing tests.

## Database

The tests use a PostgreSQL database that runs next to this container as host `postgres`; `DATABASE_URL` points to it. The repository's CI creates its schema from the repository root with:

```sh
(
  cd server
  pnpm db:push
)
```
