import fs from "fs";
import path from "path";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui";

export const metadata = {
  title: "Privacy Policy | ENGen",
  description: "Privacy Policy for ENGen Cloud Engineering Notebook Platform",
};

export default function PrivacyPolicyPage() {
  const filePath = path.join(process.cwd(), "src/content/legal/privacy-policy.md");
  const content = fs.readFileSync(filePath, "utf8");

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
        <article className="prose prose-neutral dark:prose-invert max-w-none text-nb-on-surface-variant prose-headings:text-nb-on-surface prose-a:text-nb-primary prose-a:underline hover:prose-a:opacity-85">
          <ReactMarkdown>{content}</ReactMarkdown>
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
