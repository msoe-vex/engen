import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui";

export const metadata = {
  title: "Privacy Policy | ENGen",
  description: "Privacy Policy for ENGen Cloud Engineering Notebook Platform",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-nb-surface text-nb-on-surface">
      <header className="border-b border-nb-outline-variant/30 bg-nb-surface-low/50 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-nb-body font-semibold text-nb-primary hover:opacity-85"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to ENGen</span>
          </Link>
          <div className="flex items-center gap-2 text-nb-caption text-nb-on-surface-variant">
            <Shield className="h-4 w-4 text-nb-primary" />
            <span>Official Policy</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <article className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-nb-on-surface">Privacy Policy</h1>
            <p className="mt-2 text-nb-caption text-nb-on-surface-variant">
              Effective Date: November 26, 2026 · MSOE VEX Robotics (<code className="rounded bg-nb-surface-low px-1.5 py-0.5">msoe-vex</code>)
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">1. Overview</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              ENGen (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the Platform&rdquo;) provides collaborative digital engineering notebook tooling,
              compilation, rubric evaluation, and team management for robotics teams and educational programs. We are committed
              to safeguarding the privacy of students, mentors, coaches, and volunteers who use our platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">2. Information We Collect</h2>
            <div className="space-y-2 text-nb-body text-nb-on-surface-variant">
              <p>
                <strong>Account & Authentication:</strong> When you register or sign in, we collect your name, email address,
                password hash (for direct credentials), and avatar. If you use OAuth (Google, GitHub, Discord, LinkedIn), we only
                receive your public profile and verified email. We do not access external code repositories, private messages, or contact lists.
              </p>
              <p>
                <strong>Notebook Content:</strong> Entries, text, LaTeX math, sketches, uploaded diagrams, attached CAD/PDF assets,
                and revision histories created by you and your team.
              </p>
              <p>
                <strong>Real-Time Collaboration:</strong> Editor cursor positions and ephemeral synchronization states via Yjs and WebSockets
                while actively editing an entry with teammates.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">3. Student Privacy & Minors</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              ENGen is designed for students, competitive robotics participants, and educational teams. We do <strong>not</strong> sell student
              data or track students for commercial advertising. Accounts for minor students should be created with the permission
              and guidance of a team mentor, school educator, or parent/guardian. Organization owners and coaches have administrative authority
              to inspect rosters and request deletion of student records at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">4. AI Features & Machine Learning</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              Optional AI features (such as rubric judging alignment and entry review suggestions) process content solely to deliver
              the requested immediate result. <strong>Your engineering notebooks, sketches, and design logs are never used to train public machine learning models.</strong>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">5. Data Ownership, Export & Deletion</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              Teams retain 100% intellectual property ownership of all notebook content. Team leads can export full archives (PDFs, ZIPs, LaTeX, and JSON)
              at any point. When an organization or account is deleted, all stored assets and database records are permanently purged.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">6. Security & Infrastructure</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              All network communications are protected by TLS 1.3 encryption in transit. Files and databases hosted on Google Cloud Platform
              are encrypted at rest with Google-managed keys.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">7. Contact Information</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              If you have any questions or data deletion requests regarding this policy, please reach out to us at{" "}
              <a href="mailto:vex@msoe.edu" className="font-medium text-nb-primary underline hover:opacity-85">
                vex@msoe.edu
              </a>{" "}
              or via our{" "}
              <a
                href="https://github.com/msoe-vex/engen"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-nb-primary underline hover:opacity-85"
              >
                GitHub repository
              </a>.
            </p>
          </section>
        </article>

        <div className="mt-12 flex items-center justify-between border-t border-nb-outline-variant/30 pt-6">
          <Link href="/terms">
            <Button variant="secondary" size="sm">
              View Terms of Service
            </Button>
          </Link>
          <Link href="/">
            <Button variant="primary" size="sm">
              Return to App
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
