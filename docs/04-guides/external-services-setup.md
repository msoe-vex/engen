# External Services & OAuth Setup Guide

This guide covers setting up the external GCP services and Social Login OAuth applications required to run **Engineering Notebook** locally and in production.

> **Need help?** If you run into any issues or need access to existing developer apps, reach out to **Andrew Needham** at `aneedham0577@gmail.com`.

---

## 1. Social Login OAuth Apps

Authentication is handled by **Better Auth** on the Next.js `website` service. Every OAuth provider uses the same callback URL pattern:

- **Local development:** `http://localhost:3000/api/auth/callback/<provider>`
- **Production:** `https://<your-domain>/api/auth/callback/<provider>`

### Google (GCP OAuth 2.0)
1. Open **Google Cloud Console → APIs & Services → Credentials**.
2. Create an **OAuth 2.0 Client ID** (Application type: **Web application**).
3. Add **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - `https://<your-domain>`
4. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-domain>/api/auth/callback/google`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `website/.env.local` (or Secret Manager).

### GitHub
1. Open **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL** to `http://localhost:3000` (or `https://<your-domain>`).
3. Set **Authorization callback URL** to:
   - `http://localhost:3000/api/auth/callback/github` (create a separate OAuth App for production with `https://<your-domain>/api/auth/callback/github`).
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### Discord
1. Open **Discord Developer Portal → Applications → OAuth2**.
2. Add **Redirects**:
   - `http://localhost:3000/api/auth/callback/discord`
   - `https://<your-domain>/api/auth/callback/discord`
3. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

### LinkedIn
1. Open **LinkedIn Developer Portal → My Apps → Auth**.
2. Under **Products**, ensure **Sign In with LinkedIn using OpenID Connect** is added.
3. Add **Authorized redirect URLs for your app**:
   - `http://localhost:3000/api/auth/callback/linkedin`
   - `https://<your-domain>/api/auth/callback/linkedin`
4. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

---

## 2. Google Cloud Platform (GCP) Services

To keep idle hosting costs at **\$0/month**, deploy all 5 services to **Cloud Run** with `min-instances: 0`:

| Service | Source | Role |
| :--- | :--- | :--- |
| `website` | `website/Dockerfile` | Next.js UI + Better Auth |
| `core` | `services/core/Dockerfile` | Fastify API, RBAC, Metadata/Storage authority |
| `collab` | `services/collab/Dockerfile` | Hocuspocus Yjs WebSocket server |
| `compile` | `services/compile/Dockerfile` | LaTeX / BusyTeX PDF compiler worker |
| `judge` | `services/judge/Dockerfile` | Python / LangGraph rubric & grading worker |

### Required GCP Resources
1. **Artifact Registry:** Docker repository for the 5 service images.
2. **Firestore (Native mode):** Primary metadata store (`user`, `session`, `account`, `verification`, `org`, `notebook`, `entry`, etc.).
3. **Cloud Storage (GCS):** Private bucket for TipTap JSON, Yjs snapshots, assets, compiled PDFs, and rubric sources.
4. **Pub/Sub:** Topics and push/pull subscriptions for `compile` and `judge` async jobs.
5. **Secret Manager:** Store `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_SECRET`, and OAuth client secrets.

---

## 3. Terraform & CI/CD Deployment

Infrastructure and deployments are managed with **Terraform** and **GitHub Actions**:

- **Terraform (`infra/terraform/`):** Provisions Cloud Run services (`min-instances = 0`), Artifact Registry, GCS bucket, Pub/Sub topics, and Secret Manager secrets.
- **PR Checks (`.github/workflows/ci.yml`):** Runs `tsc --noEmit` and `lint` on pull requests into `main`.
- **Deployment (`.github/workflows/deploy.yml`):** On push to `dev` or `main`, builds and pushes Docker images to Artifact Registry via Workload Identity Federation, then runs `terraform apply` against the matching GitHub Environment (`dev` or `prod`).

---

## 4. Environments, Secrets & Variables

We use **GitHub Environments (`dev` and `prod`)** as the single source of truth for deployed environments, and `website/.env.local` (gitignored) for local development:

- **`dev` branch → `dev` GitHub Environment** (deploys to your dev GCP project)
- **`main` branch → `prod` GitHub Environment** (deploys to your prod GCP project)

### Exact Checklist for Each GitHub Environment (`dev` and `prod`)

**GitHub Environment Secrets** (**Settings → Environments → `<env>` → Environment secrets**):
- `GCP_WORKLOAD_IDENTITY_PROVIDER` — Workload Identity Provider resource name for keyless GCP auth
- `GCP_SERVICE_ACCOUNT` — Service account email used by GitHub Actions to deploy
- `BETTER_AUTH_SECRET` — Random 32+ char secret (also stored in GCP Secret Manager as `better-auth-secret`)
- `INTERNAL_SERVICE_SECRET` — Shared secret between `website`, `core`, `collab`, `compile`, `judge` (GCP Secret Manager: `internal-service-secret`)
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret (GCP Secret Manager: `google-client-secret`)
- `OAUTH_GITHUB_CLIENT_SECRET` — GitHub OAuth client secret (GCP Secret Manager: `github-client-secret`; GitHub disallows `GITHUB_*` secret names)
- `DISCORD_CLIENT_SECRET` — Discord OAuth client secret (GCP Secret Manager: `discord-client-secret`)
- `LINKEDIN_CLIENT_SECRET` — LinkedIn OAuth client secret (GCP Secret Manager: `linkedin-client-secret`)

**GitHub Environment Variables** (**Settings → Environments → `<env>` → Environment variables**):
- `GCP_PROJECT_ID` — Target GCP Project ID (e.g. `notebook-dev` or `notebook-prod`)
- `GCP_REGION` — GCP Region (e.g. `us-central1`)
- `APP_URL` — Public HTTPS URL for `website` (e.g. `https://dev.yourdomain.com` or `https://app.yourdomain.com`)
- `GOOGLE_CLIENT_ID` — Google OAuth Client ID
- `OAUTH_GITHUB_CLIENT_ID` — GitHub OAuth Client ID (GitHub disallows `GITHUB_*` variable names)
- `DISCORD_CLIENT_ID` — Discord OAuth Client ID
- `LINKEDIN_CLIENT_ID` — LinkedIn OAuth Client ID

> **Note:** `NEXT_PUBLIC_CORE_API_URL`, `CORE_API_INTERNAL_URL`, `NEXT_PUBLIC_COLLAB_WS_URL`, and `BETTER_AUTH_URL` are wired automatically by Terraform in `infra/terraform/main.tf`—you do **not** need to set them in GitHub.

### Generating `BETTER_AUTH_SECRET` & `INTERNAL_SERVICE_SECRET`
Generate strong random values for each environment (`dev` and `prod`):
```bash
openssl rand -base64 32
```
Store them in **GitHub Environment Secrets**—`deploy.yml` automatically syncs them (and your `*_CLIENT_SECRET` values) into GCP Secret Manager on deploy.

### Setting up `GCP_SERVICE_ACCOUNT` & `GCP_WORKLOAD_IDENTITY_PROVIDER`
Run the bootstrap script once per GCP project (`dev` and `prod`):
```bash
./infra/terraform/bootstrap-gcp.sh <GCP_PROJECT_ID> <GITHUB_OWNER/GITHUB_REPO>
```
It enables the required IAM/STS APIs, creates the `github-deploy` service account, configures Workload Identity Federation restricted to your GitHub repository, and prints the exact `GCP_SERVICE_ACCOUNT` and `GCP_WORKLOAD_IDENTITY_PROVIDER` values to paste into your GitHub Environment Secrets.

---

## 5. Custom Domain & DNS (`APP_URL`)

If you use a custom domain (e.g. `app.yourdomain.com` or `dev.yourdomain.com`), Terraform (`google_cloud_run_domain_mapping` in `infra/terraform/main.tf`) automatically creates the Cloud Run domain mapping when `APP_URL` is not a `*.run.app` URL.

You only need to:
1. Add the DNS record at your DNS provider:
   - **Subdomain (recommended, e.g. `app.yourdomain.com`):** `CNAME` record pointing to `ghs.googlehosted.com.`
   - **Apex domain (e.g. `yourdomain.com`):** Add the `A` / `AAAA` records provided by Cloud Run.
2. Set `APP_URL=https://<your-domain>` in your **GitHub Environment Variables** and ensure all OAuth apps have `https://<your-domain>/api/auth/callback/<provider>` listed as an authorized redirect URI.
