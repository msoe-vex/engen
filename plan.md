# Engineering Notebook Platform — Comprehensive Architecture, Security & Cleanup Plan

> **Purpose:** Single actionable roadmap to harden security/auth, eliminate idle/storage cost leaks, optimize Firestore/GCS performance, standardize service/API boundaries, reorganize code, expand test coverage, and consolidate documentation.
>
> **Locked-In Architectural Decisions:**
> 1. **Auth Tokens:** Opaque Better Auth `session.token` + short in-memory TTL cache (`30–60s`) in Core (remove unused `jwt()` plugin and `jwtVerify` path).
> 2. **User Data Split:** Better Auth owns `user/{uid}` (auth identity); Core owns `profile/{uid}` (app preferences, `platformRole`, `grants`, `secondaryEmails`).
> 3. **Storage Access:** Presigned GCS URLs (`getSignedPutUrl` / `getSignedReadUrl`) for large uploads/downloads so Core never buffers binaries in RAM; keep `/public/o/:slug/assets/:assetId` proxying/redirecting for stable public URLs.
> 4. **Naming Convention:** Plural REST URLs (`/users/me`, `/orgs/:orgId/notebooks/:notebookId/entries/:entryId`, `/admin/users`, `/admin/orgs`) without `/api` prefix on Core; singular Firestore collection names (`user`, `profile`, `org`, `notebook`, `entry`).
> 5. **Database Port Name:** Rename `MetadataStore` → `DocumentStore` (`FirestoreDocumentStore`, `HttpDocumentStore`).

---

## Execution Order

1. **Phase 1 (P0 — Security & Auth):** Fix fail-open auth bypass, remove `FirebaseAuthAdapter`, align token verification, separate `user/{uid}` vs `profile/{uid}` cleanly, harden `metadataStoreAdapter.ts` & `server.ts`, fix `docker-compose.yml`.
2. **Phase 2 (P1 — Legacy Cleanup & Cost/Infra Hygiene):** Remove dead files/deps, add Artifact Registry & GCS lifecycle rules, fix `purgeNotebookStorage` leaks, add orphan asset GC.
3. **Phase 3 (P1 — Service Architecture, Subdomains & Routes):** Add `api.*` and `collab.*` subdomains, eliminate Core binary buffering via signed URLs + `StoragePort.exists()`/`copyObject()`, standardize REST route paths across Core + all callers.
4. **Phase 4 (P1/P2 — Queries & Schema Optimization):** Extend `DocumentStore` query capabilities (cursors, projections, filtered `count()`), fix `GET /orgs` `O(N)` scan and N+1 waterfalls.
5. **Phase 5 (P2 — Repo Structure & Modularization):** Rename `MetadataStore` → `DocumentStore`, split `services/core/src/routes/org.ts` (~2,900 lines), reorganize `website/src/components/cloud/` & `lib/cloud/`.
6. **Phase 6 (P1/P2 — Test Coverage):** Add unit/integration tests for auth, Core routes, `packages/shared`, `collab`, `compile`, and `judge` (`pytest`), and enforce in CI.
7. **Phase 7 (P2 — Docs Consolidation):** Restructure `docs/` into 5 clean sections and eliminate Firebase Auth / legacy conflicts.

---

## Phase 1: Critical Security & Auth Hardening (P0)

### 1.1 Fix fail-open auth bypass in `BetterAuthAdapter.verifySession()`
- **File:** `services/core/src/auth/betterAuthAdapter.ts` (L18–85)
- **Current Bug:**
  - L22 initializes `let uid = trimmed;`.
  - In the opaque-token branch (L47–68), if `sessions[0]` is missing or `expiryDate <= new Date()`, execution never throws and falls through to L70–84, authenticating the caller with `uid = trimmed` (the raw bearer string).
  - In the JWT branch (L28–40), when `NODE_ENV !== "production"`, a failed `jwtVerify()` is caught and ignored, falling through with `uid = trimmed`.
- **Implementation:**
  - Remove `let uid = trimmed;`; declare `let uid: string | undefined;`.
  - Explicitly throw `new Error("Unauthorized: invalid or expired session")` if no valid session is found or `expiryDate <= new Date()`.
  - Gate the `"service-admin"` / `"uid|email"` dev fallback strictly behind `process.env.NODE_ENV !== "production" && process.env.AUTH_FALLBACK === "true"`.
- **Remove `FirebaseAuthAdapter` (`services/core/src/index.ts` & `services/core/src/auth/firebaseAuthAdapter.ts`):**
  - Delete `services/core/src/auth/firebaseAuthAdapter.ts` and remove the `AUTH_PROVIDER` switch in `services/core/src/index.ts` so `BetterAuthAdapter` is the sole auth adapter.
  - Remove `AUTH_PROVIDER` env var from `infra/terraform/main.tf` and `infra/docker-compose.yml` if no longer needed.

### 1.2 Align token format (Opaque Session Token + Short TTL Cache)
- **Files:**
  - `website/src/lib/auth/server.ts` (L76–80)
  - `website/src/lib/auth/client.ts` (L100–165)
  - `services/core/src/auth/betterAuthAdapter.ts` (L4, L14–40)
- **Implementation:**
  - Remove the unused `jwt()` plugin from `website/src/lib/auth/server.ts` (and verify nothing calls `/api/auth/token` or `/api/auth/jwks`).
  - Remove unused `createRemoteJWKSet` import, `this.secret`, and the `jwtVerify()` branch from `BetterAuthAdapter` (`services/core/src/auth/betterAuthAdapter.ts`).
  - Add a bounded in-memory TTL cache in `BetterAuthAdapter` (e.g., `Map<string, { user: SessionUser; cachedAt: number }>`, TTL `30_000ms`, max 1,000 entries, evicted if `session.expiresAt` is earlier) so repeated browser requests don't hit Firestore on every API call while still honoring sign-out/revocation within seconds.
  - Keep `website/src/lib/auth/client.ts` sending `session.token` as the `Authorization: Bearer <token>` header.

### 1.3 Separate `user/{uid}` (Better Auth) and `profile/{uid}` (Application Profile)
- **Files:**
  - `packages/shared/src/paths.ts` (L3–5)
  - `services/core/src/routes/user.ts` (L90–281)
  - `services/core/src/routes/admin.ts` (L21–100)
  - `services/core/src/routes/org.ts` (member displayName/profile lookups)
  - `services/core/src/auth/betterAuthAdapter.ts` (L60–75)
- **Current Bug:** Both Better Auth (`metadataStoreAdapter.ts` L99–100 with `{ merge: false }`) and Core (`userPath(uid)` -> `user/${uid}`) write to `user/{uid}`. When Better Auth creates `user/{uid}` first, `POST /user/me/bootstrap` sees `existing != null` and skips setting `uid`, `grants`, `preferences`, and `SERVICE_ADMIN_UID` `platformRole`.
- **Implementation:**
  - Add `profilePath(uid)` → `profile/${uid}` in `packages/shared/src/paths.ts` (keep `authUserPath(uid)` → `user/${uid}` for Better Auth reads).
  - Update Core `user.ts`, `admin.ts`, `betterAuthAdapter.ts`, and `org.ts` profile lookups to read/write `UserProfile` (`uid`, `displayName`, `platformRole`, `grants`, `preferences`, `secondaryEmails`) at `profile/{uid}`.
  - In `POST /user/me/bootstrap`, initialize `profile/{uid}` cleanly with `uid`, `grants`, `preferences`, and `SERVICE_ADMIN_UID` `platformRole`, reading `email`, `name`, and `emailVerified` from `user/{uid}` as needed.
  - In `GET /api/admin/user` (`admin.ts`), query `profile` (merging email/2FA metadata from `user` where helpful) and ensure `PATCH /api/admin/user/:uid` updates `profile/{uid}` with `{ merge: true }`.

### 1.4 Harden `metadataStoreAdapter.ts` & `website/src/lib/auth/server.ts`
- **File:** `website/src/lib/auth/metadataStoreAdapter.ts`
  - **Case-sensitivity fix (L41–46):** In `matchInProcess`, only compare strings case-insensitively when `clause.field === "email"`. For `token`, `id`, `accountId`, `verification.value`, and `userId`, require exact `===` match.
  - **Query fidelity:** Apply `select` field projection and `offset` slicing in `findOne` / `findMany`.
  - **Batch deletes:** Replace sequential `store.delete()` loops in `deleteMany` (L288–296) with `store.batch()` (`{ op: "delete", path }`).
  - **Firestore index safety (L206):** Do not forward `orderBy` to `store.query()` alongside `where` unless `orderBy.field === where.field`; otherwise fetch matching rows and sort in-memory so Better Auth queries never crash with `FAILED_PRECONDITION`.
  - **Joins:** Ensure `join` resolution also handles `session` or other models cleanly if Better Auth plugins (e.g., `passkey`, `twoFactor`) request them.
- **File:** `website/src/lib/auth/server.ts`
  - Fail fast at startup in `NODE_ENV === "production"` if `process.env.BETTER_AUTH_SECRET` is missing or equals the dev placeholder.
  - Gate each social provider: `enabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)` (same for `google`, `discord`, `linkedin`) instead of `enabled: true` with `"dev_*"` fallbacks.
  - **2FA OTP (L83–88):** Wire `twoFactor.otpOptions.sendOTP` to Core's notification/email transport (or disable email OTP in prod until an email transport is configured, keeping authenticator TOTP + passkeys active).
  - **Passkey origins (L90–106):** Support comma-separated `BETTER_AUTH_TRUSTED_ORIGINS` / array `origin` if multiple domains (`engen.msoevex.com`, `localhost:3000`) are used.

### 1.5 Fix local `docker-compose.yml` & `collab` internal secrets
- **File:** `infra/docker-compose.yml`
  - Add `CORE_API_INTERNAL_URL: http://core:8080` and `INTERNAL_SERVICE_SECRET: local-dev-secret` to the `website` container environment so `HttpMetadataStore` talks to `core:8080` instead of `localhost:8080`.
  - Document `COLLAB_AUTH_DISABLED=true` clearly as local-only (or disable it so local dev tests real `collab` -> `core` authorization).
- **File:** `services/collab/src/index.ts` (L8)
  - Fail fast in production if `INTERNAL_SERVICE_SECRET` is empty; align dev fallback behavior.
  - Either wire `collab` to call Core's `POST /internal/collab/connections` for active-connection telemetry or remove the unused endpoint from `services/core/src/index.ts`.

**Phase 1 Verification:**
- Unit tests for `BetterAuthAdapter` (expired/missing/invalid opaque tokens throw; valid token caches & resolves `SessionUser`; `profile/{uid}` + `user/{uid}` merge works).
- Unit tests for `metadataStoreAdapter` (case-sensitive `token`, `select`, `offset`, `batch` delete, `join`).
- `tsc --noEmit` across `packages/shared`, `services/core`, `services/collab`, `website`.

---

## Phase 2: Legacy Cleanup & Cost/Infra Hygiene (P1)

### 2.1 Delete unused legacy files, directories, and dependencies
- Delete `loadtest/` (`loadtest/k6-smoke.js` targeting obsolete port `8000` and `/orgs`).
- Delete `services/agents/` (empty leftover directory containing only `node_modules/`).
- Delete 0-byte stray file `services/core/src/realtime/sedn5czdg`.
- Delete `infra/firestore-debug.log` (1.1 MB) and add `firestore-debug.log` + `*.log` to `.gitignore`.
- Delete empty directory `website/src/app/api/core/[...path]/`.
- Remove unused `"octokit": "^5.0.5"` from `website/package.json` and update `package-lock.json`.
- Audit callers of `website/src/app/api/genai/` (`route.ts`, `models/route.ts`); migrate any remaining references to `/api/ai/complete` and `/api/ai/models`, then delete `website/src/app/api/genai/`.
- Audit `website/scripts/export-logo.tsx` and `website/scripts/generate-og-banner.ts` (either add `sharp` to `devDependencies` + npm scripts, or delete if one-off).

### 2.2 Add Artifact Registry & GCS lifecycle rules
- **File:** `infra/terraform/main.tf`
  - **Artifact Registry (`google_artifact_registry_repository.repo`, L74–79):**
    - Add `cleanup_policies`:
      1. `KEEP` most recent `5` tagged versions per package.
      2. `DELETE` untagged images older than `7d` (`604800s`).
  - **GCS Bucket (`google_storage_bucket.notebook_assets`, L81–86):**
    - Add `lifecycle_rule`:
      1. `AbortIncompleteMultipartUpload` after `1` day.
      2. Optional transition to `NEARLINE` after `90` days for archived/cold exports (if desired).

### 2.3 Fix storage leaks in `purgeNotebookStorage` & add orphan GC
- **File:** `services/core/src/routes/org.ts` (`purgeNotebookStorage`, L251–275)
  - Currently deletes `entry` TipTap/Yjs blobs and `asset` blobs, **but leaks** `export/*.pdf`, `rubric/*/source.*`, and subcollections (`entry/*/comment`, `shareLink`, `job`, `jobLock`).
  - Update `purgeNotebookStorage` to also:
    1. Delete all `compileExport` docs and their GCS `export/*.pdf` blobs (including `latest.pdf`).
    2. Delete all `rubric/*/source.*` GCS blobs before deleting `rubricsCollection` docs.
    3. Delete `entry/*/comment` subcollections for every entry, plus `shareLink`, `job`, and `jobLock` collections.
- **Orphan Asset & Export Retention GC:**
  - Add an internal endpoint `POST /internal/maintenance/gc` (protected by `assertInternalSecret`, callable by Cloud Scheduler or admin):
    - Reap `asset` docs (and their GCS blobs) where `usedBy` is empty (`[]`) and `updatedAt` is older than 30 days.
    - Prune old `compileExport` versions per notebook beyond the latest `10` (keeping any export referenced by a public `shareLink`).

**Phase 2 Verification:**
- `git status` clean of stray/legacy files; `npm --prefix website ci` / `build` succeeds without `octokit`.
- `terraform validate` / `terraform plan` shows Artifact Registry cleanup policies and GCS lifecycle rules cleanly.

---

## Phase 3: Service Architecture, Subdomains & Route Standardization (P1)

### 3.1 Custom subdomains for `core` and `collab`
- **File:** `infra/terraform/main.tf` (L483–495)
- Add optional variables `core_domain` (e.g. `api.engen.msoevex.com`) and `collab_domain` (e.g. `collab.engen.msoevex.com`) with `google_cloud_run_domain_mapping` resources (matching `website_domain`).
- Wire `website` env vars (`NEXT_PUBLIC_CORE_API_URL`, `NEXT_PUBLIC_COLLAB_WS_URL`) and `core`/`collab` `CORS_ORIGIN` to use the custom domains when set, falling back to `.run.app` URIs.

### 3.2 Eliminate Core RAM buffering via Signed GCS URLs + `exists()`/`copyObject()`
- **Files:**
  - `services/core/src/storage/storagePort.ts`
  - `services/core/src/storage/gcsStorage.ts`
  - `services/core/src/compile/recordCompileExport.ts`
  - `services/core/src/routes/judge.ts`
  - `services/core/src/routes/org.ts`
  - `services/core/src/routes/internalCompile.ts`
- **Implementation:**
  - Add `exists(key: string): Promise<boolean>` (using GCS `file.exists()`) and `copyObject(srcKey: string, dstKey: string): Promise<void>` (using GCS `file.copy()`) to `StoragePort` and `GcsStorage`.
  - Update existing `StoragePort.getSignedUrl(key, action, expiresMs?, contentType?)` so `"write"` signed URLs bind `contentType` in GCS V4 signing.
  - Add a `cors` block to `google_storage_bucket.notebook_assets` in `infra/terraform/main.tf` allowing `PUT`/`GET` from `var.app_url` (and `http://localhost:3000`).
  - Update `resolveExportPdfKey()` (`recordCompileExport.ts` L304–331) to call `storage.exists()` instead of `storage.getObject()` (stops downloading entire PDFs into Core memory just to check existence).
  - Update `saveCurrentPreviewAsVersion()` (`recordCompileExport.ts` L105–118) to use `storage.copyObject()`.
  - Migrate large browser/worker uploads (notebook assets, rubric source files, compiled PDFs) to a 2-step flow: `POST .../upload-url` -> direct `PUT` to signed GCS URL -> `POST .../confirm` (keeping `putObjectStream` fallback for local `fake-gcs-server`).

### 3.3 Standardize Core API routes (Plural REST URLs, no `/api` prefix)
- **Files:** `services/core/src/routes/*.ts`, `website/src/lib/cloud/api.ts`, `services/compile/src/coreClient.ts`, `services/judge/app/core_client.py`, `services/collab/src/index.ts`
- **Target Convention:**
  - `/users/me`, `/users/me/bootstrap`, `/users/me/secondary-emails`, `/users/me/verification/resend-gate`
  - `/orgs`, `/orgs/:orgId`, `/orgs/:orgId/members`, `/orgs/:orgId/teams`, `/orgs/:orgId/invites`, `/orgs/:orgId/assets`, `/orgs/:orgId/donors`, `/orgs/:orgId/projects`, `/orgs/:orgId/events`, `/orgs/:orgId/social-links`
  - `/orgs/:orgId/notebooks`, `/orgs/:orgId/notebooks/:notebookId`, `/orgs/:orgId/notebooks/:notebookId/entries`, `/orgs/:orgId/notebooks/:notebookId/entries/:entryId`, `/orgs/:orgId/notebooks/:notebookId/entries/:entryId/comments`, `/orgs/:orgId/notebooks/:notebookId/rubrics`, `/orgs/:orgId/notebooks/:notebookId/rubrics/:rubricId`, `/orgs/:orgId/notebooks/:notebookId/judgments`, `/orgs/:orgId/notebooks/:notebookId/judgments/:judgmentId`, `/orgs/:orgId/notebooks/:notebookId/exports`, `/orgs/:orgId/notebooks/:notebookId/share-links`, `/orgs/:orgId/notebooks/:notebookId/jobs`
  - `/admin/metrics`, `/admin/users`, `/admin/users/:uid`, `/admin/orgs` (remove `/api` prefix)
  - `/public/orgs/:slug/...` (keep `/public/o/:slug/...` alias/redirect if external links already exist!)
  - `/internal/...` (unchanged internal namespace)
- **Rollout Note:** Update Core, `website`, `compile`, `judge`, and `collab` together so all callers use the standardized routes.

**Phase 3 Verification:**
- Verify all `website`, `compile`, `judge`, and `collab` API calls match updated Core routes.
- Verify `resolveExportPdfKey()` no longer downloads PDF bytes into Core RAM.

---

## Phase 4: Query & Schema Optimization (P1/P2)

### 4.1 Extend `DocumentStore` (currently `MetadataStore`) query capabilities
- **Files:** `packages/shared/src/metadataStore.ts`, `services/core/src/db/metadataStore.ts`, `website/src/lib/cloud/httpMetadataStore.ts`
- Add to `MetadataWhereOp`: `"in"` and `"array-contains"`.
- Add to `MetadataQueryOpts`: `startAfter?: unknown` (cursor pagination), `select?: string[]` (field projection).
- Update `count(collectionPath: string, opts?: { where?: MetadataWhere[] }): Promise<number>` to support filtered Firestore `.count().get()` aggregations.

### 4.2 Eliminate `O(N)` full-collection scans and N+1 waterfalls
- **`GET /orgs` (`services/core/src/routes/org.ts` L346–376):**
  - Currently scans all `org` docs and runs `store().get(memberPath(id, user.uid))` per org (`O(total_orgs)`).
  - **Fix:** Maintain a denormalized membership index at `profile/{uid}/orgMembership/{orgId}` (updated on org create, member add/role-change/remove) OR use a Firestore `collectionGroup("member")` query filtering `uid == user.uid`. Then fetch only the user's orgs in `1` query + `K` gets (where `K` = user's orgs).
- **`recountEntryComments()` (`org.ts` L1944–1956):**
  - Replace full scan of `entryCommentsCollection` with two filtered `count()` queries (`status == "open"` and total) or atomic counter updates.
- **`DELETE .../folders/:folderId` (`org.ts` L1299–1328):**
  - Query `entriesCollection` with `where: [{ field: "folderId", op: "==", value: folderId }]` instead of scanning all entries.
- **`countCompileExports()` (`recordCompileExport.ts` L40–44):**
  - Replace `query` + `rows.length` with `store.count(compileExportsCollection(orgId, notebookId))`.
- **`GET .../notebooks` & `canAccessNotebook()` (`org.ts` L933–940, `rbac.ts` L102–105):**
  - Preload the caller's team IDs in the org once before filtering restricted notebooks instead of calling `store.get(teamMemberPath(...))` in a loop per notebook.
- **Add pagination + default limits:**
  - Add `limit` (e.g. default `50`, max `200`) and `cursor` query params to list endpoints (`entries`, `comments`, `assets`, `exports`, `judgments`, `admin/users`, `admin/orgs`).
- **`public.ts` & `internalCompile.ts`:**
  - Add `visibility == "public"` / `archived != true` `where` filters in Firestore queries instead of filtering in JS; batch `orgAssetPath` / `memberPath` reads with deduplicated UIDs/assetIds (`Set` + `Promise.all`).
  - For `GET .../entry/search`, index plain-text excerpts or search metadata fields first so Core doesn't sequentially download 80 TipTap JSON blobs from GCS on every search.

**Phase 4 Verification:**
- Verify Firestore read counts per `GET /orgs`, `GET /notebooks`, and `POST /comments` drop from `O(N)` to `O(1)`/`O(K)`.

---

## Phase 5: Repo Structure & Code Modularization (P2)

### 5.1 Rename `MetadataStore` → `DocumentStore`
- **Files:** `packages/shared/src/metadataStore.ts` → `documentStore.ts`, `services/core/src/db/metadataStore.ts` → `documentStore.ts`, `website/src/lib/cloud/httpMetadataStore.ts` → `httpDocumentStore.ts`
- Rename `MetadataStore` → `DocumentStore`, `MetadataDoc` → `DocumentData`, `MetadataWhere` → `DocumentWhere`, `MetadataQueryOpts` → `DocumentQueryOpts`, `FirestoreMetadataStore` → `FirestoreDocumentStore`, `HttpMetadataStore` → `HttpDocumentStore`.

### 5.2 Modularize `services/core/src/`
- Split monolithic `services/core/src/routes/org.ts` (~2,900+ lines) into focused route modules:
  - `routes/orgs.ts`, `routes/members.ts`, `routes/teams.ts`, `routes/invites.ts`, `routes/notebooks.ts`, `routes/folders.ts`, `routes/entries.ts`, `routes/comments.ts`, `routes/assets.ts`, `routes/exports.ts`, `routes/shareLinks.ts`, `routes/catalog.ts`.
- Group interfaces under `services/core/src/ports/` (`authPort.ts`, `documentStore.ts`, `storagePort.ts`, `jobDispatchPort.ts`, `notificationPort.ts`) and concrete implementations under `services/core/src/adapters/` (`firestore/`, `gcs/`, `pubsub/`, `auth/`, `ai/`).

### 5.3 Reorganize `website/src/components/cloud/` & `website/src/lib/cloud/`
- Move `website/src/components/cloud/*` (39 files) into domain directories:
  - `components/shell/` (`AppChrome`, `AppPageShell`, `AccountShell`, `NotebookShell`, `NotebookSideRail`, `NotebookSectionNav`, `EmailVerificationScreen`, `CloudShell`, `notebookPageSkeletons`)
  - `components/org/` (`OrgWorkspaceContext`, `OrgCatalogManager`, `OrgPeopleSearchPanel`, `CreateNotebookDialog`)
  - `components/notebook/` (`NotebookWorkspaceContext`, `NotebookEntryList`, `NotebookPhasesEditor`, `PhaseChip`, `PhasePicker`, `ShareNotebookDialog`, `AccessAllowlistPicker`, `NotebookAccessFields`, `CloudNotebookCompiler`, `CloudNotebookJudge`, `CollaborativeEntryEditor`, `EntryCommentsPanel`, `PublicTipTapViewer`)
  - `components/judge/` (move `components/cloud/judge/*` up one level)
  - `components/onboarding/` (move `components/cloud/onboarding/*` up one level)
- Move `website/src/lib/cloud/*` (16 files) into:
  - `lib/api/` (`client.ts`, `httpDocumentStore.ts`, `events.ts`, `errors.ts`, `fetchDedupe.ts`)
  - `lib/workspace/` (`workspaceState.ts`, `workspaceBridge.ts`, `workspaceHeaderStore.ts`, `editorChromeStore.ts`, `userPreferences.ts`, `onboarding.ts`, `roles.ts`, `entryQuality.ts`)
  - `lib/export/` (`compileCloudNotebook.ts`, `zipAssets.ts`, `zipV5.ts`)

**Phase 5 Verification:**
- `tsc --noEmit`, `npm --prefix website run lint`, `npm --prefix website test`, and `npm --prefix services/core test` all pass with zero broken imports.

---

## Phase 6: Test Coverage Expansion & CI Enforcement (P1/P2)

### 6.1 Auth & Adapter Unit Tests (Priority)
- `services/core/tests/betterAuthAdapter.test.ts`:
  - Valid opaque session returns `SessionUser` and caches for TTL.
  - Expired session, missing session, empty token, and malformed token all throw `Unauthorized`.
  - `AUTH_FALLBACK` dev tokens are rejected when `NODE_ENV === "production"`.
  - `profile/{uid}` + `user/{uid}` merge and `SERVICE_ADMIN_UID` resolution work correctly.
- `website/tests/metadataStoreAdapter.test.ts`:
  - `create`, `findOne`, `findMany`, `update`, `delete`, `deleteMany` (batch), `count`.
  - Case-sensitive `token` / `id` / `accountId` matching vs. case-insensitive `email` matching.
  - `join` resolution for `account` (`join.user`), `session` (`join.user`), and `user` (`join.account`).

### 6.2 Core Routes, Shared Package, & Worker Tests
- `services/core/tests/routes/`: Fastify `app.inject()` tests with in-memory `DocumentStore` and `StoragePort` fakes covering:
  - `user.ts` (`/users/me/bootstrap` with existing Better Auth `user/{uid}` doc)
  - `admin.ts` (403 for non-admin, 200 for `service_admin`)
  - `orgs.ts` & `notebooks.ts` (RBAC, `purgeNotebookStorage` completeness)
  - `public.ts` & `internalCompile.ts` (`x-internal-secret` fail-closed check)
- `packages/shared/tests/`: Unit tests for `paths.ts`, `entryValidation.ts`, `migrate.ts`, `limits.ts`.
- `services/collab/tests/`: Unit tests for auth hook delegation and Yjs load/flush error handling.
- `services/compile/tests/`: Unit tests for `hydrateSnapshot.ts` and `buildWorkspace.ts`.
- `services/judge/tests/`: `pytest` suite covering `normalize.py`, `tiptap.py`, `graph.py`, and `core_client.py`.
- **CI (`.github/workflows/ci.yml`):** Add `packages/shared` build+test, `services/compile` test, `services/collab` test, and `services/judge` `pytest` job.

**Phase 6 Verification:**
- All workspace test suites pass locally and in GitHub Actions CI.

---

## Phase 7: Documentation Consolidation (P2)

### 7.1 Restructure `docs/` (71 files → 5 clean, non-overlapping sections)
```text
docs/
├── README.md                  # Audience router + "one fact, one place" rule
├── CONTRIBUTING-DOCS.md       # How to keep reference docs synced with code
├── architecture/              # "Where & why"
│   ├── overview.md
│   ├── tenancy-acl.md
│   ├── realtime.md
│   ├── async-jobs.md
│   ├── diagrams.md
│   └── decisions/ADR-*.md
├── reference/                 # Single source of truth for contracts
│   ├── api.md                 # Exact routes from services/core & website/src/app/api
│   ├── schema.md              # Exact Firestore collections + GCS keys (from paths.ts)
│   └── env-vars.md            # Every env var per service (from Terraform + compose)
├── specs/                     # Concise FR-* / NFR-* specs + legal pointers
├── guides/                    # onboarding-engineer.md, local-development.md, deployment.md, smoke-tests.md
└── ops/                       # monitoring.md, security-route-checklist.md, runbooks/
```

### 7.2 Resolve Conflicting & Stale Content
- **Eliminate Firebase Auth conflicts:** Update `journeys.md`, `NFR-security.md`, `FR-auth.md`, `api-contracts.md`, `env-vars.md`, `local-development.md`, and `incident-auth.md` to document Better Auth (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_PROVIDER=better-auth`, OAuth env vars) instead of Firebase Auth / emulator `localhost:9099`.
- **Sync routes & paths:** Update `FR-auth.md` and `reference/api.md` to reflect `/users/me`, `user/{uid}`, `profile/{uid}`, and all standardized Core + Next.js `/api/*` routes.
- **Sync `ADR-010-better-auth.md`:** Update to reflect the locked-in opaque `session.token` + Core TTL cache architecture and actual secret handling.
- **Prune completed plans:** Merge any remaining unimplemented items from `docs/01-requirements/plans/*.md` into `specs/` or `plan.md`, then delete completed plan files.
- **Clean legacy pointers:** Remove references to `website/archive/legacy/` from `AGENTS.md` and `website/LEGACY.md` (since that directory no longer exists on disk).
