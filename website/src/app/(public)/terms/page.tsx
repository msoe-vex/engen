import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui";

export const metadata = {
  title: "Terms of Service | ENGen",
  description: "Terms of Service for ENGen Cloud Engineering Notebook Platform",
};

export default function TermsOfServicePage() {
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
            <FileText className="h-4 w-4 text-nb-primary" />
            <span>Official Agreement</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <article className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-nb-on-surface">Terms of Service</h1>
            <p className="mt-2 text-nb-caption text-nb-on-surface-variant">
              Effective Date: November 26, 2026 · MSOE VEX Robotics (<code className="rounded bg-nb-surface-low px-1.5 py-0.5">msoe-vex</code>)
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">1. Acceptance of Terms</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              By accessing or using ENGen (&ldquo;the Service&rdquo;), provided by MSOE VEX Robotics (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;),
              you agree to be bound by these Terms of Service. If you represent an educational institution, school club, or competition
              team, you confirm that you have the authority to bind that group to these terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">2. Description of Service</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              ENGen provides real-time collaborative engineering notebook authoring, LaTeX-to-PDF compilation, rubric evaluation,
              and team management designed primarily for competitive robotics (including VEX U, VRC, and related STEM competitions).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">3. Intellectual Property & Content Ownership</h2>
            <div className="space-y-2 text-nb-body text-nb-on-surface-variant">
              <p>
                <strong>Your Content Is Yours:</strong> You and your robotics team retain <strong>100% full ownership and copyright</strong> of
                all documentation, CAD models, diagrams, and design records uploaded to ENGen. We claim no ownership over your intellectual property.
              </p>
              <p>
                <strong>License to Host:</strong> You grant ENGen a worldwide, royalty-free license solely to store, process, synchronize,
                and render your content as necessary to provide the platform functionality (e.g., compiling PDFs, caching assets, and delivering WebSocket updates).
              </p>
              <p>
                <strong>Competition Compliance:</strong> Teams are solely responsible for ensuring their notebooks comply with REC Foundation
                guidelines and student-centered academic honesty policies.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">4. User Conduct & Acceptable Use</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              Users agree not to:
            </p>
            <ul className="list-disc space-y-1.5 pl-6 text-nb-body text-nb-on-surface-variant">
              <li>Upload malicious payloads, malware, or destructive code.</li>
              <li>Attempt to circumvent security boundaries, authentication controls, or tenant isolation.</li>
              <li>Disrupt or overload backend microservices with abusive automated requests.</li>
              <li>Post infringing, defamatory, or unlawful material.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">5. Disclaimers & Limitation of Liability</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              The Service is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis. Teams are strongly advised to periodically
              export offline backups of their notebooks before major competition milestones. To the maximum extent permitted by law,
              MSOE VEX Robotics and the Milwaukee School of Engineering disclaim liability for indirect or consequential damages,
              competition outcomes, or service downtime.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-nb-on-surface">6. Governing Law & Contact</h2>
            <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
              These Terms are governed by the laws of the State of Wisconsin, USA. Questions regarding these Terms may be directed
              to{" "}
              <a href="mailto:vex@msoe.edu" className="font-medium text-nb-primary underline hover:opacity-85">
                vex@msoe.edu
              </a>.
            </p>
          </section>
        </article>

        <div className="mt-12 flex items-center justify-between border-t border-nb-outline-variant/30 pt-6">
          <Link href="/privacy">
            <Button variant="secondary" size="sm">
              View Privacy Policy
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
