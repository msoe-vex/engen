Ran list root, services, packages, and infra directories
Used tool: invoke_subagent
Used tool: invoke_subagent
Used tool: invoke_subagent
Used tool: invoke_subagent

I've launched 4 parallel research audits covering:
1. **Service Architecture, Routes & Infra** (`core`, `collab`, `compile`, `judge`, `agents`, Next.js API routes, Terraform/Cloud Run)
2. **Database Queries, Schema, GCS Lifecycle & Idle Costs**
3. **Repo Structure, Legacy Files & Test Coverage**
4. **Auth Setup (Better Auth + Core/Collab) & Documentation Structure**

I'll compile the findings into a structured audit once all four complete.

Three of the four audit streams (Architecture/Routes, Schema/Queries/Costs, and Auth/Docs) have reported back with concrete findings. Waiting on the final stream (Repo Structure, Legacy Files & Test Coverage) before compiling the full audit.

Found 4 subagents
Analyzed betterAuthAdapter.ts:L1-85
Analyzed httpMetadataStore.ts:L1-100
Analyzed main.tf:L40-100
Analyzed README.md:L1-29

Here is the full audit across architecture, queries/costs, repo structure, auth, documentation, legacy files, and test coverage.

---

### Critical Issues Found (Fix First)

1. **Auth Bypass in `BetterAuthAdapter.verifySession()`** ([betterAuthAdapter.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/auth/betterAuthAdapter.ts#L18-L85))
   - Line 22 initializes `let uid = trimmed;`.
   - In the opaque-token branch (`else` at L47–68), if no `session` is found in Firestore or `expiryDate <= new Date()`, execution **never throws** — it falls through to L70–84 and authenticates the caller with `uid = trimmed` (the raw bearer string).
   - Same in the JWT branch (L28–40) when `NODE_ENV !== "production"`: a failed `jwtVerify()` is caught and falls through with `uid = trimmed`.
2. **JWT vs. Opaque Token Mismatch**
   - [server.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/lib/auth/server.ts#L76-L80) configures Better Auth's `jwt()` plugin (asymmetric JWKS-signed JWTs via `/api/auth/token`), while [client.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/lib/auth/client.ts#L100-L165) reads `session.token` (an **opaque** token, never calling `/api/auth/token`).
   - Meanwhile, [betterAuthAdapter.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/auth/betterAuthAdapter.ts#L4-L30) imports `createRemoteJWKSet` (unused) and calls `jwtVerify(trimmed, this.secret)` with a symmetric secret.
3. **`user/{uid}` Schema Collision Between Better Auth and Core**
   - Better Auth writes its `user` table (`name`, `email`, `twoFactorEnabled`, etc.) to `user/${id}` with `{ merge: false }` ([metadataStoreAdapter.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/lib/auth/metadataStoreAdapter.ts#L99-L100)).
   - Core's `userPath(uid)` ([paths.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/packages/shared/src/paths.ts#L3-L5)) writes `UserProfile` (`uid`, `displayName`, `platformRole`, `grants`, `preferences`) to the exact same `user/${uid}` path.
   - In [user.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/user.ts#L97-L127), `POST /user/me/bootstrap` sees `existing` (created by Better Auth) and skips initializing `uid`, `grants`, `preferences`, and the `SERVICE_ADMIN_UID` `platformRole` check (L112–114).
4. **Local Docker Compose Gap** ([docker-compose.yml](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/infra/docker-compose.yml))
   - `website` does not set `CORE_API_INTERNAL_URL` or `INTERNAL_SERVICE_SECRET`, so `HttpMetadataStore` falls back to `NEXT_PUBLIC_CORE_API_URL` (`http://localhost:8080`), which inside the `website` container points to itself rather than `http://core:8080`.

---

### 1. Service Architecture, Routing & Domains

* **Current Topology (Good overall):**
  - `website` (Next.js, port 3000) -> Better Auth (`/api/auth/*`), BYOK AI (`/api/ai/*`), public asset/PDF proxies, and internal metadata calls.
  - `core` (Fastify, port 8080) -> REST API, RBAC, Firestore/GCS gateway, Pub/Sub job publisher, SSE (`/org/:orgId/notebook/:notebookId/events`).
  - `collab` (Hocuspocus, port 1234) -> WebSocket Yjs sync, delegating auth/load/flush to `core` `/internal/collab/*`.
  - `compile` (Node/XeLaTeX, port 8090) & `judge` (Python/FastAPI/LangGraph, port 8091) -> Private Cloud Run Pub/Sub workers calling `core` `/internal/*`.
* **Should anything be split or called directly?**
  - **Keep `compile` and `judge` private behind Pub/Sub + `core`.** Do not expose them directly to the browser.
  - **Uploads / Exports:** Browser-to-GCS **signed URLs** (especially `PUT` for large assets/rubrics and direct `GET` for PDFs/assets) would eliminate Core RAM buffering. Currently, rubric uploads ([judge.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/judge.ts#L228-L246)) and PDF uploads ([org.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/org.ts#L2421-L2433), [internalCompile.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/internalCompile.ts#L300-L312)) buffer full binaries into Core memory with `Buffer.concat(chunks)`.
  - **Empty proxy folder:** [website/src/app/api/core/[...path]/](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/app/api/core/%5B...path%5D) is empty; [website/src/app/api/genai/](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/app/api/genai/route.ts) is just a duplicate re-export of `/api/ai/*`.
* **Custom Subdomains (`api.*`, `collab.*`):**
  - Currently `website` uses `var.app_url` (`engen.msoevex.com`), while `core` and `collab` use raw `.run.app` URLs ([main.tf](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/infra/terraform/main.tf#L483-L495)).
  - Adding `api.engen.msoevex.com` -> `core` and `collab.engen.msoevex.com` -> `collab` is recommended: it decouples clients from Cloud Run generated hashes, simplifies CORS/CSP, and keeps SSE/WebSocket origins clean.
* **Route Naming Inconsistencies:**
  - **Prefix:** Only [admin.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/admin.ts) uses `/api/admin/*`; all other Core routes omit `/api` (`/user/me/*`, `/org/*`, `/ai/complete`, `/public/o/:slug/*`, `/internal/*`). Standardize on no `/api` prefix in Core (or `/v1/...`).
  - **Singular vs. Plural:** Firestore paths in [paths.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/packages/shared/src/paths.ts) are consistently singular (`user`, `org`, `notebook`, `entry`), while Core routes mix them: e.g. `/org/:orgId/notebook/:notebookId/entries` vs `/entry/:entryId`, `/rubrics` vs `/rubric/:rubricId`, `/api/admin/user` vs `/user/me/secondary-emails`. Pick one convention for REST resources (standard REST plural collections: `/orgs/:orgId/notebooks/:notebookId/entries/:entryId`) while keeping Firestore doc paths singular.

---

### 2. Queries, Schema, GCS Lifecycle & Idle Costs

* **Idle Cost (`$0` compute goal):**
  - **Compute & Network:** All 5 Cloud Run services have `min_instance_count = 0`, no VPC/Cloud NAT, Pub/Sub is pay-per-message, and Firestore is Native pay-per-op -> **$0/mo idle compute**.
  - **Cost Leaks to Fix:**
    1. **Artifact Registry ([main.tf](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/infra/terraform/main.tf#L74-L79)):** No `cleanup_policies` — Docker images from all 5 services accumulate at `$0.10/GiB-month` after 0.5 GiB. Add a policy keeping only the last 3–5 tagged images and deleting untagged images after 7 days.
    2. **GCS Bucket ([main.tf](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/infra/terraform/main.tf#L81-L86)):** No `lifecycle_rule` blocks — stale `latest.pdf` previews, old exports, and orphaned assets stay forever.
    3. **Orphaned Data & Incomplete Deletes:**
       - `purgeNotebookStorage()` ([org.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/org.ts#L251-L275)) deletes `entry` blobs and `asset` blobs, **but leaks** `export/*.pdf`, `rubric/*/source.*`, `entry/*/comment`, `shareLink`, `job`, and `jobLock`.
       - Assets whose `usedBy` becomes `[]` are never reaped. Add a `DELETE` / scheduled cleanup (or Cloud Scheduler -> Core internal endpoint) for unreferenced assets older than e.g. 30 days and `compileExport` retention.
* **Query & Memory Optimizations:**
  - **Missing pagination & `limit`:** [MetadataQueryOpts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/packages/shared/src/metadataStore.ts#L15-L19) lacks `startAfter`/cursor, field `select`, and `"in"`/`"array-contains"` operators. Almost all list endpoints in [org.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/org.ts) run unbounded collection scans.
  - **Worst N+1 / Full-Scan hotspots:**
    - `GET /org` ([org.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/org.ts#L346-L376)): Scans **every `org`** in the database and does a sequential `memberPath` `get()` per org. Store a `user/{uid}/orgMembership/{orgId}` (or Firestore `collectionGroup("member")` query on `uid`) so `GET /org` is **1 query** instead of `O(total_orgs)`.
    - `recountEntryComments()` ([org.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/org.ts#L1944-L1956)): Fetches all comments in the entry on every comment write instead of using `count()` or atomic increment.
    - `DELETE .../folders/:folderId` ([org.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/routes/org.ts#L1299-L1328)): Scans all entries instead of filtering `where("folderId", "==", folderId)`.
    - `countCompileExports()` ([recordCompileExport.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/compile/recordCompileExport.ts#L40-L44)): Fetches all export docs to read `rows.length` instead of `store.count()`.
    - `resolveExportPdfKey()` ([recordCompileExport.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/services/core/src/compile/recordCompileExport.ts#L304-L331)): Calls `storage.getObject()` (which runs `file.download()` into RAM) **just to check if a PDF exists**, causing PDF routes to download the file into Core memory twice. Add `StoragePort.exists(key)` (`file.exists()`) and `copyObject(src, dst)` (`file.copy()`).

---

### 3. Repo Structure & Naming

* **Rename `MetadataStore`?**
  - `MetadataStore` is accurate for its role (document metadata vs. GCS `StoragePort` blob store), though `DatabasePort` or `DocumentStore` is clearer now that it also stores Better Auth tables (`user`, `session`, `account`, `verification`, `passkey`, `twoFactor`). If you keep it as a port, `DocumentStore` (with `FirestoreDocumentStore` and `HttpDocumentStore`) is cleaner and less misleading than `MetadataStore`.
* **Organizing `website/src/components/cloud/` (39 files) & `website/src/lib/cloud/` (16 files):**
  - `cloud` was a migration catch-all and is now the main product UI. Splitting by domain makes navigation much easier:
    - `components/layout/` or `components/shell/`: `AppChrome`, `AppPageShell`, `AccountShell`, `NotebookShell`, `NotebookSideRail`, `NotebookSectionNav`, `EmailVerificationScreen`
    - `components/org/`: `OrgWorkspaceContext`, `OrgCatalogManager`, `OrgPeopleSearchPanel`, `CreateNotebookDialog`
    - `components/notebook/`: `NotebookWorkspaceContext`, `NotebookEntryList`, `NotebookPhasesEditor`, `ShareNotebookDialog`, `CloudNotebookCompiler`, `CollaborativeEntryEditor`, `EntryCommentsPanel`
    - `components/judge/`: (already nicely grouped in `judge/`)
    - `lib/api/`: `client.ts` (from `cloud/api.ts`), `events.ts` (`notebookEvents.ts`), `errors.ts`, `fetchDedupe.ts`
    - `lib/sync/` or `lib/export/`: `compileCloudNotebook.ts`, `zipAssets.ts`, `zipV5.ts`
* **Decoupling Core (`services/core/src/`):**
  - Split `services/core/src/routes/org.ts` (~2,900+ lines!) into domain route files: `orgs.ts`, `notebooks.ts`, `entries.ts`, `comments.ts`, `assets.ts`, `compile.ts`, `shareLinks.ts`.
  - Group adapters under `services/core/src/adapters/` (`firestore/`, `gcs/`, `pubsub/`, `auth/`, `ai/`) and ports under `services/core/src/ports/`.

---

### 4. Authentication & Better Auth Adapter

Beyond the critical `BetterAuthAdapter` bypass and `user/{uid}` collision above:

* **Direct Firestore vs. `HttpMetadataStore` hop:**
  - Every Better Auth DB call in `website` currently makes an HTTP round-trip to `core` `/internal/metadata/*` (`HttpMetadataStore`). That works for keeping Firestore credentials out of `website`, **but** Better Auth should not have to serialize queries across HTTP with hardcoded `limit: 25` / `limit: 100`.
  - If you keep `HttpMetadataStore` on `website`:
    1. Fix `matchInProcess` in [metadataStoreAdapter.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/lib/auth/metadataStoreAdapter.ts#L41-L46) so case-insensitive matching only applies to `email`, **never** `token`, `id`, or `verification.value`.
    2. Respect `select` and `offset` in `findOne`/`findMany`, use `store.batch()` in `deleteMany`, and avoid sending `orderBy` + `where` on different fields to Firestore without a composite index.
    3. Separate Core's `UserProfile` to `userProfile/{uid}` (or merge cleanly without overwriting Better Auth's `user/{uid}` fields).
* **Production Hardening in [server.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/lib/auth/server.ts):**
  - Fail fast if `BETTER_AUTH_SECRET` is missing in production (instead of falling back to `"dev-better-auth-secret-key-min-32-chars-long"`).
  - Gate each OAuth provider `enabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)` instead of hardcoding `enabled: true` with `"dev_*"` strings.
  - Wire `twoFactor.otpOptions.sendOTP` to a real email transport (currently `console.log` only).
  - Either configure [client.ts](file:///home/needhama/Documents/GitHub/engineering-notebook-editor/website/src/lib/auth/client.ts) to exchange for a JWT via `/api/auth/token` and verify via JWKS in Core (matching `ADR-010`), **or** intentionally use opaque session tokens and remove the unused `jwt()` plugin + broken `jwtVerify` path in Core.

---

### 5. Legacy Files, `loadtest/`, & Test Coverage

* **Safe to Delete / Clean Up:**
  - `loadtest/` (`loadtest/k6-smoke.js`) — targets legacy port `8000` (`agents`) and `/orgs`.
  - `services/agents/` — empty leftover directory containing only `node_modules/`.
  - `services/core/src/realtime/sedn5czdg` — 0-byte stray file.
  - `infra/firestore-debug.log` — 1.1 MB local emulator log (also add to `.gitignore`).
  - `website/src/app/api/core/[...path]/` — empty directory.
  - `website/src/app/api/genai/` — redundant re-exports of `/api/ai/*` (once callers point to `/api/ai/*`).
  - `"octokit": "^5.0.5"` in `website/package.json` — unused anywhere in `website/src/`.
  - Update `AGENTS.md` and `website/LEGACY.md` to remove references to `website/archive/legacy/` (which no longer exists on disk).
* **Test Coverage Gaps:**
  - Currently only **8 test files** exist (`7` in `website/tests/` + `1` in `services/core/tests/rbac.test.ts`).
  - **0 tests** for: `metadataStoreAdapter.ts`, `BetterAuthAdapter` (which would have caught the auth bypass), Core's 10 route modules, `services/collab`, `services/compile`, `services/judge`, `packages/shared`, and `website/src/lib/cloud/*`.

---

### 6. Proposed Documentation Structure

Right now `docs/` has **71 files** with widespread conflicts (Firebase Auth + `/users/me` in `FR-auth.md`, `api-contracts.md`, `env-vars.md`, `local-development.md`, `incident-auth.md` vs. Better Auth + `/user/me` in `ADR-010` and `schema.md`) and stale "active" plans under `01-requirements/plans/`.

A leaner, non-duplicative structure:

```text
docs/
├── README.md                  # Audience router + doc rules ("one fact, one place")
├── architecture/              # "How it fits together" (overview, tenancy/RBAC, realtime, async-jobs, ADRs)
├── reference/                 # Single source of truth for contracts (generated/verified against code)
│   ├── api.md                 # Exact routes from services/core & website/src/app/api
│   ├── schema.md              # Exact Firestore collections + GCS keys (derived from paths.ts)
│   └── env-vars.md            # Every env var per service (derived from Terraform + compose)
├── specs/                     # Current product specs only (concise FRs/NFRs; merge or delete completed plans)
├── guides/                    # local-development.md, deployment.md, smoke-tests.md
└── ops/                       # monitoring.md + runbooks/ (updated for Better Auth, Cloud Run, Pub/Sub)
```

- **Key rule:** Move completed `01-requirements/plans/*.md` out of active docs (or delete them once implemented — git history preserves them), and keep `reference/api.md`, `schema.md`, and `env-vars.md` strictly synchronized with `packages/shared/src/paths.ts`, `services/core/src/routes/`, and `infra/terraform/main.tf`.

---

### Recommended Order of Attack
1. **Security/Auth fix:** Patch `BetterAuthAdapter.verifySession()` fail-closed behavior, align opaque vs. JWT verification, and fix `user/{uid}` vs. `UserProfile` bootstrap.
2. **Cleanup & Infra hygiene:** Delete `loadtest/`, `services/agents/`, stray files, add Artifact Registry + GCS lifecycle rules, and fix `docker-compose.yml` env vars for `website`.
3. **Query/Storage optimization:** Add `StoragePort.exists()` / `copyObject()`, fix `GET /org` O(N) scan and `purgeNotebookStorage` leaks, and split `services/core/src/routes/org.ts`.
4. **Tests & Docs:** Add unit tests for `BetterAuthAdapter`, `metadataStoreAdapter`, and Core routes, then consolidate `docs/`.

Let me know which of these areas you want to tackle first!