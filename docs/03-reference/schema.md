# Cloud data model (schema v5)

Authoritative TypeScript types & Firestore path helpers: [`packages/shared/src/paths.ts`](../../packages/shared/src/paths.ts) and [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts).  
All Firestore collections and document paths are **strictly singular** across the entire stack. Clients never talk to Firestore/metadata store directly (`infra/firestore.rules` deny); Core / Collab use server adapters ([ADR-009](../02-architecture/decisions/ADR-009-platform-ports.md)).

## Current collections (Implemented & Strictly Singular)

### Top-level

| Path | Key fields |
| --- | --- |
| `user/{uid}` | Better Auth profile (`email`, `name`, `emailVerified`, `image`, `twoFactorEnabled`, `createdAt`, `updatedAt`) |
| `session/{id}` | Better Auth active sessions (`userId`, `token`, `expiresAt`, `ipAddress`, `userAgent`) |
| `account/{id}` | Better Auth linked accounts & OAuth credentials (`userId`, `providerId`, `accountId`, `password`) |
| `verification/{id}` | Better Auth verification tokens (`identifier`, `value`, `expiresAt`, `createdAt`) |
| `passkey/{id}` | Better Auth WebAuthn passkeys (`userId`, `name`, `publicKey`, `credentialID`, `counter`) |
| `twoFactor/{id}` | Better Auth MFA settings (`userId`, `secret`, `backupCodes`) |
| `org/{orgId}` | Organization metadata (`name`, `createdBy`, `createdAt`, `updatedAt`) |
| `invite/{inviteId}` | Organization invites (`orgId`, `email`, `role`, `status`, `expiresAt`) |
| `orgSlug/{slug}` | Global uniqueness lookup for public organization vanity URLs |
| `system/metrics` | Platform request counters (`totalRequests`, `status2xx/4xx/5xx`, `totalLatencyMs`, `persistedAt`) |

### Under `org/{orgId}`

| Path | Role | Key fields |
| --- | --- | --- |
| `member/{uid}` | Org ACL + public profile credits | `role`, `title?`, `public?` (default true), `email?`, `displayName?`, `imageAssetId?`, `status?` (`active`\|`alumni`), `joinedAt` |
| `asset/{assetId}` | Org-scoped media | `contentType`, `byteSize`, `gcsPath`, `createdBy`, `usedBy[]` — GCS `org/{orgId}/asset/{id}/compressed` |
| `team/{teamId}` | Org ACL groups | `name`, `createdBy`, timestamps |
| `team/{teamId}/member/{uid}` | Team membership | `joinedAt` |
| `notebook/{notebookId}` | Notebook summary | Name, folders tree, phases, contributor UIDs, latest export |
| `notebook/{id}/member/{memberId}` | Legacy credits docs | `name`, `role`, `order`, `imageAssetId?`, `orgMemberUid?`, `deletedAt?` |
| `notebook/{id}/entry/{entryId}` | Entry metadata only | See below |
| `notebook/{id}/entry/{entryId}/comment/{commentId}` | Comment thread body | `body`, `createdBy`, `createdAt`, `resolvedAt?`, `anchorQuote?`, `mentionedUids?` |
| `notebook/{id}/asset/{assetId}` | Notebook asset metadata | `contentType`, `byteSize`, `gcsPath`, `createdBy`, `usedBy[]` |
| `notebook/{id}/rubric/{rubricId}` | Competition rubrics | `name`, `matrix?`, `status`, `sourceGcsPath?`, `deletedAt?` |
| `notebook/{id}/judgment/{judgmentId}` | Judge grades | `rubricId`, `matrix`, `categories[]`, `totalPoints`, `totalMaxPoints`, `summary`, `status` |
| `notebook/{id}/job/{jobId}` | Async jobs | `type` (`compile`\|`judge`), `status`, `payload`, `result?` |
| `notebook/{id}/compileExport/{exportId}` | Compiled export metadata | Export status, format, GCS PDF path |
| `notebook/{id}/shareLink/{linkId}` | Public share links | `token`, `role`, `accessMode`, `expiresAt` |

### Notebook summary (`NotebookSummary`)

```
schemaVersion: 5
orgId, name
title?, subtitle?, logoAssetId?
folders: Record<folderId, { name, parentId, order }>
  // folder.order = sibling position under parentId (explorer tree only)
access?: { mode: "org" | "restricted", teamIds[], userIds[] }
phases?: Record<phaseId, { name, description, iconName, color, order, deletedAt? }>
contributorUids?: string[]   // ordered org member uids for credits
latestExportId?              // most recent compile export id
publicKey? / publicExportId? // legacy single-link fields; prefer shareLinks/
createdAt?, createdBy?, updatedAt
```

### Entry metadata (`EntryMetadata`) — Firestore only

```
title, authors[], phase, date
folderId, explorerOrder   // file explorer (sibling order within folder)
order                     // calendar + compile same-day tiebreaker
isTemplate?
hidden?                   // omit from PDF compile; still listed in explorer
resources?, references?, assetIds?
isValid?, validationErrors?
tipTapGcsPath, tipTapRev, yjsGcsPath, yjsRev
deletedAt?                // soft-delete (Trash); omit/null when live
openCommentCount?         // denorm unresolved threads
commentCount?             // denorm all threads
createdAt, updatedAt
```

**Two order axes (do not conflate):**

| Axis | Fields | Controlled in | Used by |
| --- | --- | --- | --- |
| Explorer tree | `folderId`, `explorerOrder`; folders `parentId`+`order` | File explorer DnD | Sidebar listing only |
| Compile / calendar | `date`, then `order` | Calendar DnD (same day) | BusyTeX / LaTeX entry order |

Compile sort: `date` ascending → `order` ascending → `id`. Folder nesting never affects compile order.

`order` is **per-date**: many entries may share `order: 1` on different dates. Within one date, calendar DnD densifies to `0…n-1`.

Core: `POST …/entries/reorder` with `mode: "explorer" | "day"` reindexes only the listed siblings.

Bodies are **never** in Firestore. Blobs live behind Core `StoragePort` (GCS adapter today).

### Object-key contract (adapter-agnostic)

Keys are plain strings built by [`gcsKeys`](../../packages/shared/src/paths.ts) in `packages/shared` (historical name; not an SDK type). Metadata fields `tipTapGcsPath` / `yjsGcsPath` / `gcsPath` / `sourceGcsPath` store those same keys. Routes and workers must not import a vendor storage SDK — only `StoragePort` (or Core `/internal/storage/object` for workers).

| Blob | Key pattern (`gcsKeys.*`) |
| --- | --- |
| TipTap JSON | `org/{orgId}/notebook/{notebookId}/entry/{entryId}.json` |
| Yjs binary | `org/{orgId}/notebook/{notebookId}/yjs/{entryId}.ydoc` |
| Notebook asset | `org/{orgId}/notebook/{notebookId}/asset/{assetId}/compressed` (and optionally `original`) |
| Org asset | `org/{orgId}/asset/{assetId}/compressed` |
| Export PDF | `org/{orgId}/notebook/{notebookId}/export/{exportId}.pdf` (compile worker writes `latest` via Core) |
| Rubric source | `org/{orgId}/notebook/{notebookId}/rubric/{rubricId}/source{ext}` |
| Static BusyTeX / LaTeX | `static/busytex/{appVersion}/…`, `static/latex-template/{appVersion}/…` |

Collab room name: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`.

### Naming: three “team” concepts

| Concept | Store | UI |
| --- | --- | --- |
| **Organization** | `org/{id}` | Home / org hub |
| **Org Team** (ACL group) | `org/{id}/team/{teamId}` | Org Teams page |
| **Notebook roster** (credits) | `org/{id}/notebook/{id}/member` | Notebook → Members |
| **Notebook branding** | `title` / `subtitle` / `logoAssetId` / `phases` on notebook | Notebook → Setup (+ phases TBD) |

Do not conflate org ACL Members with notebook credits Members.

---

## Underused / optional fields

| Field | Notes |
| --- | --- |
| `AssetMetadata.gcsPathOriginal` | Never written — client uploads a single compressed JPEG today |
| Metrics | In-memory in Core; Firestore `system/metrics` |

See [backlog.md](../01-requirements/backlog.md).

## What must NOT go in Firestore

| Data | Where |
| --- | --- |
| BYOK / GenAI API keys | localStorage or ephemeral request body |
| TipTap / Yjs / images / PDFs / BusyTeX WASM | Object store via `StoragePort` (GCS adapter) |
| Service credentials | Secret Manager / env |
| Full entry bodies inside judgments | Rationale + entry id cites only |

## Cascade deletes

Notebook (and org) delete removes Firestore children (entries, assets, rubrics, judgments, jobs, roster) **and** related storage objects (TipTap, Yjs, assets, exports, rubric sources) via `StoragePort`.

---

## Public / people / auth extras (in `types.ts`; wire remaining UI polish as needed)

Implemented fields for [FR-org-public-page](../01-requirements/features/FR-org-public-page.md), [FR-public-notebook](../01-requirements/features/FR-public-notebook.md), [FR-orgs](../01-requirements/features/FR-orgs.md) alumni, [FR-auth](../01-requirements/features/FR-auth.md). Keep FRs in sync as acceptance criteria are checked off.

### Org slug + public page

| Path / field | Notes |
| --- | --- |
| `org/{orgId}.slug` | Globally unique, URL-safe; admin-set if not taken; reserved list |
| `orgSlug/{slug}` → `{ orgId }` | Lookup / uniqueness (or equivalent unique index) |
| `org/{orgId}.publicPage` | `{ visibility, announcement?, about?, logoAssetId?, cta?, sections?: { about?, donors?, projects?, events?, members?, social? } }` — section keys omit/true = on; `mission` legacy alias of `about` |
| `…/donor/{id}` | name, imageAssetId?, url?, tier?, order, `public?` (default true) |
| `…/project/{id}` | title, season?, summary, highlights[], externalUrl?, imageAssetId?, order, `public?` |
| `…/event/{id}` | kind?, day/time or date; title; location; imageAssetId?; order; `public?` |
| Public members | Org `member/{uid}` where `public !== false` (incl. alumni) |
| `…/socialLink/{id}` | label, url, imageAssetId?, order, `public?` |
| `…/publicMedia/{id}` | assetId, caption?, order |

Public URLs: `/o/:slug`, `/o/:slug/projects`, `/events`, `/members`.

### Public notebook share links

Preferred model: explicit `shareLink/{linkId}` under the notebook:

```
id, key            // unguessable UUID in the public URL
name               // user-facing label
exportId           // compile export this link serves
createdAt, createdBy?, updatedAt?
revokedAt?         // set when revoked; public lookup removed
```

| Lookup | Purpose |
| --- | --- |
| `org/{orgId}/publicNotebookKey/{key}` → `{ notebookId, linkId }` | Resolve `/o/:orgSlug/n/:key` |
| `…/notebook/{notebookId}/shareLink/{linkId}` | Share link metadata |
| `…/notebook/{notebookId}/compileExport/{exportId}` | Retained versions (max 10; optional `label`) |
| GCS `…/export/{exportId}.pdf` (+ `latest.pdf` alias) | Compiled PDF bytes |

Legacy notebook fields `publicAccess` / `publicKey` / `publicExportId` may still exist; Core migrates them into one share link named “Share” on first share-links read.

URL: **`/o/:orgSlug/n/:key`** serves that link’s PDF via website → Core proxy. At most **10** compile exports (`MAX_COMPILE_EXPORTS`).

### Org member alumni

| Field | Notes |
| --- | --- |
| `org/{orgId}/member/{uid}.status` | `"active"` \| `"alumni"` (default active) |
| `org/{orgId}/member/{uid}.alumniAt?` | set when moved to alumni |

### Auth / user profile extras

| Field | Notes |
| --- | --- |
| `user/{uid}.secondaryEmails[]` | `{ email, verified, verifiedAt? }` — invite matching when verified |
| `user/{uid}.linkedProviders[]` | provider ids from IdP (informational; source of truth is IdP) |

### Notifications

No durable “mail queue” required in MVP; optional later `notificationLog/{id}` for admin audit. Provider secrets stay in env — [FR-notifications](../01-requirements/features/FR-notifications.md).
