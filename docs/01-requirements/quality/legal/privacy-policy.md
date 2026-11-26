# Privacy Policy

**Effective Date:** November 26, 2026  
**Product:** ENGen (Cloud Engineering Notebook Platform)  
**Organization:** MSOE VEX Robotics (`msoe-vex`)

---

## 1. Overview
ENGen ("we", "our", or "the Platform") provides collaborative digital engineering notebook tooling, compilation, rubric evaluation, and team management for robotics teams and educational programs. We are committed to protecting the privacy of students, mentors, coaches, and volunteers who use our platform.

---

## 2. Information We Collect

### A. Account & Authentication Information
When you create an account or sign in, we collect:
* **Account Credentials & Profiles:** Your name, email address, password hash (if using email/password), profile picture, and account timestamps.
* **OAuth Information:** If you authenticate via third-party providers (Google, GitHub, Discord, LinkedIn), we receive standard public profile information (name, verified email address, and avatar URL) authorized by your consent screen. We do **not** access your external repositories, private messages, or contacts.
* **Authentication Factors:** Multi-factor authentication status (TOTP or email OTP) and FIDO2/WebAuthn public keys (for passkey sign-ins).

### B. Notebook & Educational Content
* **Notebook Entries:** Written text, engineering logs, mathematical formulations (LaTeX), diagrams, code snippets, project phases, and revision histories.
* **Uploaded Media & Assets:** Photos, technical drawings, CAD renderings, test plots, and attached PDFs.
* **Organization & Team Data:** Organization names, custom slugs, team designations (e.g. VEX U / VRC team numbers), member rosters, and role assignments.

### C. Technical & Usage Information
* **Real-Time Collaboration Data:** Ephemeral presence indicators (active editor cursors, peer presence, and real-time edits synchronized via Yjs/WebSockets).
* **Application Logs:** Diagnostic crash logs, compile job statuses (LaTeX to PDF conversion), and API error traces to maintain platform uptime.

---

## 3. Student and Minor Privacy (COPPA & Educational Context)
* ENGen is designed for students, competitive robotics participants, and educational institutions.
* We do **not** sell student data or use notebook content for behavioral advertising.
* Minor accounts should be created under the supervision of a team coach, mentor, school educator, or parent/guardian.
* Team mentors and organization owners have administrative authority to manage member rosters, review shared content, and delete student data within their organization.

---

## 4. How We Use Information
We use your information exclusively to:
1. Provide, authenticate, and maintain the ENGen collaborative platform.
2. Synchronize real-time edits across team members working on notebook entries simultaneously.
3. Compile notebooks into competition-ready PDFs with verifiable hash watermarks.
4. Provide opt-in automated rubric scoring and engineering feedback when explicitly triggered by team mentors or students.
5. Enforce role-based access control (RBAC) so restricted notebooks remain accessible only to designated team members and mentors.

---

## 5. Artificial Intelligence (AI) and Machine Learning
* ENGen provides optional AI-assisted features (such as rubric alignment checks and entry quality analysis).
* **No Public Training:** Your notebook entries, technical documentation, and design notes are **not** sold or used to train public machine learning foundation models.
* Data transmitted to AI inference endpoints is processed strictly to generate the immediate evaluation or suggestion requested by the user.

---

## 6. Data Sharing & Third-Party Services
We do not sell, rent, or trade your personal information. We only share data with infrastructure subprocessors essential to hosting and running the service:
* **Google Cloud Platform (GCP):** Cloud Run compute, Cloud Firestore metadata storage, and Cloud Storage for asset files, operating in US regions (`us-central1`).
* **OAuth Providers (Google, GitHub, Discord, LinkedIn):** Strictly for identity verification and account authentication.

---

## 7. Data Retention, Portability & Deletion
* **Data Portability:** Organization administrators and authors can export full notebook archives (compiled PDFs, LaTeX sources, images, and JSON metadata) at any time.
* **Data Deletion:** Organization owners may archive or permanently delete notebooks, entries, or entire organizations. When an account or organization is deleted, associated metadata and stored assets are purged from active production databases.

---

## 8. Security
We implement modern technical safeguards to protect your data:
* All network traffic is encrypted in transit using TLS 1.3.
* Cloud storage buckets and databases are encrypted at rest using Google-managed encryption keys.
* Fine-grained service-to-service authentication and Workload Identity Federation eliminate persistent static credentials.

---

## 9. Contact Us
If you have questions about this Privacy Policy or wish to request data deletion, please contact the maintainers at:
* **Email:** `vex@msoe.edu`
* **Repository:** [https://github.com/msoe-vex/engen](https://github.com/msoe-vex/engen)
