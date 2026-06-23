# Lead decisions log

Per `implement.md` Part A.4 / I.6, any deviation from the locked spec is a Lead-owned
`contract` decision and must be written down here. This file is the record.

## D-001 — SQLite backend: `node:sqlite` instead of `better-sqlite3`

**Spec:** Part B.4 locks `better-sqlite3`.

**Decision:** Use Node's built-in `node:sqlite` (`DatabaseSync`) as the V1 SQLite backend.

**Why:**
- The build/runtime is Node 26. `better-sqlite3` is a native addon and has no reliable
  prebuilt binaries for bleeding-edge Node majors, so `pnpm install` would frequently
  fail with a node-gyp compile.
- `node:sqlite` ships with the runtime (Node 22.5+), is synchronous (same programming
  model `better-sqlite3` was chosen for), needs zero native compilation, and adds zero
  dependencies — which strengthens the "npm i and run" promise from `work.md` §6.
- The whole point of the `Store` interface (Part B.2) is that the SQLite engine is a
  hidden implementation detail. No caller changes. If we ever need `better-sqlite3`
  features, swapping it back is a one-file change behind the same interface.

**Scope of change:** `src/storage/sqliteStore.ts` only. The `Store` interface is unchanged.

## D-002 — Schema stored as a string constant (`schema.ts`), mirrored by `schema.sql`

**Spec:** Part B.3/L reference `storage/schema.sql`.

**Decision:** The runtime canonical schema lives in `src/storage/schema.ts` as an exported
string. `src/storage/schema.sql` is kept as the human-readable / spec-referenced copy. A
unit test asserts the two never drift.

**Why:** Bundling (tsup) makes reading a sibling `.sql` file at runtime path-fragile across
dev (`tsx`), test (`vitest`), and the bundled `dist`. A string constant is robust everywhere;
the mirrored `.sql` keeps the spec artifact and the drift test keeps them honest.

## D-003 — V1 surface

Per Part A.4 the V1 commands are `why`, `risk`, and `explain-commit`, GitHub-only, SQLite
behind `Store`, no graph DB, no server. GitLab/Bitbucket and `who`/`search`/`ask` are V2 and
are not built (Part A.6 / #26). The `HostClient` interface stays so they plug in later.
