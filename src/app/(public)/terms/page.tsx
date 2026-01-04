import { Badge } from '@/components/ui';
import Link from 'next/link';

export async function generateMetadata() {
  return {
    title: 'Terms of Use (EULA) - Zohal',
    description:
      'End User License Agreement for Zohal - Please read these terms carefully before using the app.',
  };
}

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-scholar p-7 mb-5">
      <div className="w-11 h-11 bg-surface-alt border border-border rounded-scholar-lg flex items-center justify-center text-xl mb-4">
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-text mb-3">{title}</h2>
      <div className="text-text-soft space-y-3">{children}</div>
    </section>
  );
}

function HighlightBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-alt border border-border border-l-[3px] border-l-accent rounded-scholar-sm p-4 my-4">
      {children}
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-12">
      {/* Header */}
      <header className="text-center pt-16 pb-12">
        <Badge variant="success" dot className="mb-6">
          Effective: December 2025
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold text-text tracking-tight mb-4">
          Terms of Use (EULA)
        </h1>
        <p className="text-xl text-text-soft max-w-lg mx-auto">
          End User License Agreement for Zohal - Please read these terms carefully before using the
          app.
        </p>
      </header>

      {/* Content */}
      <main>
        <Section icon="📜" title="1. Acceptance of Terms">
          <p>
            By downloading, installing, or using Zohal (&quot;the App&quot;), you agree to be bound
            by these Terms of Use (End User License Agreement). If you do not agree to these terms,
            do not use the App.
          </p>
          <HighlightBox>
            <p className="text-sm">
              <strong className="text-text">Important:</strong> This agreement is between you and
              Zohal (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). Apple is not a party to this
              agreement and has no obligation to provide maintenance or support for the App.
            </p>
          </HighlightBox>
        </Section>

        <Section icon="📱" title="2. License Grant">
          <p>
            Subject to your compliance with these Terms, we grant you a limited, non-exclusive,
            non-transferable, revocable license to:
          </p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>Download and install the App on devices that you own or control</li>
            <li>Use the App for your personal, non-commercial purposes</li>
            <li>Access and use the features and content made available through the App</li>
          </ul>
          <p>
            This license does not allow you to use the App on any device that you do not own or
            control, and you may not distribute or make the App available over a network where it
            could be used by multiple devices at the same time.
          </p>
        </Section>

        <Section icon="🔄" title="3. Subscription Terms">
          <p>
            Zohal offers auto-renewable subscription plans that provide access to premium features:
          </p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>
              <strong className="text-text">Zohal Pro:</strong> Unlimited AI explanations, 100
              documents, 5GB storage, all plugin tools
            </li>
            <li>
              <strong className="text-text">Zohal Premium:</strong> Everything in Pro plus unlimited
              documents, 50GB storage, two-way Google Drive sync
            </li>
          </ul>
          <p>
            <strong className="text-text">Billing:</strong>
          </p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>
              Payment will be charged to your Apple ID account at confirmation of purchase
            </li>
            <li>
              Subscription automatically renews unless cancelled at least 24 hours before the end of
              the current period
            </li>
            <li>
              Your account will be charged for renewal within 24 hours prior to the end of the
              current period
            </li>
            <li>You can manage and cancel subscriptions in your App Store account settings</li>
            <li>
              Any unused portion of a free trial period will be forfeited when purchasing a
              subscription
            </li>
          </ul>
        </Section>

        <Section icon="🚫" title="4. Restrictions">
          <p>You agree NOT to:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>Copy, modify, or distribute the App or any content within it</li>
            <li>Reverse engineer, decompile, or disassemble the App</li>
            <li>Rent, lease, lend, sell, or sublicense the App</li>
            <li>Use the App for any unlawful purpose or in violation of any laws</li>
            <li>Attempt to gain unauthorized access to any systems or networks</li>
            <li>Interfere with or disrupt the integrity or performance of the App</li>
            <li>Upload any content that is illegal, harmful, or infringes on others&apos; rights</li>
            <li>
              Use automated systems to access the App in a manner that exceeds reasonable use
            </li>
          </ul>
        </Section>

        <Section icon="📄" title="5. User Content">
          <p>
            You retain ownership of any content you create, upload, or store in the App (&quot;User
            Content&quot;). By using the App, you grant us a license to host, store, and process
            your User Content solely for the purpose of providing the App&apos;s services to you.
          </p>
          <p>You are responsible for:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>Ensuring you have the rights to upload any content</li>
            <li>Maintaining backups of your important content</li>
            <li>The accuracy and legality of your User Content</li>
          </ul>
        </Section>

        <Section icon="🤖" title="6. AI-Generated Content">
          <p>
            The App uses artificial intelligence to provide explanations, analysis, and other
            features. You acknowledge that:
          </p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>AI-generated content is provided for informational purposes only</li>
            <li>AI responses may not always be accurate, complete, or appropriate</li>
            <li>You should verify important information independently</li>
            <li>We are not responsible for decisions made based on AI-generated content</li>
          </ul>
        </Section>

        <Section icon="🛡️" title="7. Disclaimer of Warranties">
          <p className="uppercase">
            THE APP IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF
            ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
          <p>We do not warrant that:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>The App will be uninterrupted or error-free</li>
            <li>Defects will be corrected</li>
            <li>The App or servers are free of viruses or harmful components</li>
            <li>The results obtained from using the App will be accurate or reliable</li>
          </ul>
        </Section>

        <Section icon="⚖️" title="8. Limitation of Liability">
          <p className="uppercase">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL WE BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR
            REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL,
            OR OTHER INTANGIBLE LOSSES.
          </p>
          <p>
            Our total liability for any claims arising from or related to this agreement shall not
            exceed the amount you paid us in the twelve (12) months preceding the claim.
          </p>
        </Section>

        <Section icon="🔒" title="9. Privacy">
          <p>
            Your privacy is important to us. Our collection and use of personal information is
            governed by our{' '}
            <Link href="/privacy" className="text-accent hover:opacity-80">
              Privacy Policy
            </Link>
            , which is incorporated into these Terms by reference.
          </p>
        </Section>

        <Section icon="🗑️" title="10. Account Termination">
          <p>
            You may delete your account at any time through the App&apos;s Settings. We may
            terminate or suspend your access to the App immediately, without prior notice, for any
            reason, including breach of these Terms.
          </p>
          <p>Upon termination:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>Your license to use the App will immediately cease</li>
            <li>We may delete your User Content after a reasonable period</li>
            <li>Provisions that by their nature should survive termination will survive</li>
          </ul>
        </Section>

        <Section icon="🍎" title="11. Apple-Specific Terms">
          <p>If you downloaded the App from the Apple App Store, you acknowledge that:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>These Terms are between you and us only, not Apple</li>
            <li>Apple has no obligation to furnish any maintenance and support services</li>
            <li>Apple is not responsible for any product warranties or claims</li>
            <li>Apple is not responsible for addressing any claims relating to the App</li>
            <li>Apple and its subsidiaries are third-party beneficiaries of these Terms</li>
          </ul>
        </Section>

        <Section icon="📝" title="12. Changes to Terms">
          <p>
            We reserve the right to modify these Terms at any time. If we make material changes, we
            will notify you through the App or via email. Your continued use of the App after
            changes become effective constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section icon="💬" title="13. Contact Us">
          <p>If you have any questions about these Terms of Use, please contact us:</p>
          <HighlightBox>
            <p className="text-sm">
              📧 Email:{' '}
              <a href="mailto:support@zohal.app" className="text-accent hover:opacity-80">
                support@zohal.app
              </a>
            </p>
          </HighlightBox>
        </Section>
      </main>
    </div>
  );
}

