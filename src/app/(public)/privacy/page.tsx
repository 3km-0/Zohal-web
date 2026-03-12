import { absoluteUrl } from '@/lib/seo';
import { Badge } from '@/components/ui';

export async function generateMetadata() {
  return {
    title: 'Privacy Policy',
    description:
      'Learn what Zohal collects, how document and AI processing works, and which service providers process your data.',
    alternates: {
      canonical: absoluteUrl('/privacy'),
    },
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
      <h2 className="website-display text-2xl text-text mb-3">{title}</h2>
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

function BulletList({ items }: { items: Array<{ title: string; description: string }> }) {
  return (
    <ul className="space-y-2.5 my-4">
      {items.map((item, i) => (
        <li key={i} className="relative pl-6">
          <span className="absolute left-0 top-2.5 w-1.5 h-1.5 bg-accent rounded-full" />
          <strong className="text-text">{item.title}:</strong> {item.description}
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-12">
      <header className="text-center pt-16 pb-12">
        <Badge variant="success" dot className="mb-6">
          Last updated: March 2026
        </Badge>
        <h1 className="website-display text-4xl md:text-5xl text-text tracking-tight mb-4">
          Privacy Policy
        </h1>
        <p className="text-xl text-text-soft max-w-2xl mx-auto">
          This policy explains what data Zohal collects, how document and AI processing works, and
          which service providers process data on our behalf.
        </p>
      </header>

      <main>
        <Section icon="🔒" title="Our Commitment to Privacy">
          <p>
            Welcome to <strong className="text-text">Zohal</strong>. We believe your data belongs
            to you. We collect and process information only as needed to provide document analysis,
            retrieval, collaboration, billing, security, and support.
          </p>
          <HighlightBox>
            <p className="text-sm">
              <strong className="text-text">In short:</strong> We do not sell personal data. We
              ask for in-app permission before the first standard-mode cloud AI request, and users
              can use Privacy Mode for sanitized processing paths.
            </p>
          </HighlightBox>
        </Section>

        <Section icon="📊" title="Information We Collect">
          <BulletList
            items={[
              {
                title: 'Account Information',
                description:
                  'Email address, profile details you provide, subscription state, and authentication records.',
              },
              {
                title: 'Document Content',
                description:
                  'Documents, notes, prompts, selected excerpts, evidence anchors, workspace records, and related metadata you upload or create.',
              },
              {
                title: 'AI Request Data',
                description:
                  'Prompts, selected text, nearby context, retrieved excerpts, and image regions needed to answer an AI or OCR request.',
              },
              {
                title: 'Usage and Device Information',
                description:
                  'Basic device details, app version, diagnostic events, and feature usage needed to secure, operate, and improve the service.',
              },
            ]}
          />
        </Section>

        <Section icon="⚙️" title="How We Use Your Information">
          <BulletList
            items={[
              {
                title: 'Provide Services',
                description:
                  'To operate document storage, retrieval, AI chat, explanations, OCR, evidence-grade analysis, account access, and workspace features.',
              },
              {
                title: 'Personalization',
                description: 'To remember preferences and tailor your experience.',
              },
              {
                title: 'Support and Communication',
                description:
                  'To send service notices, respond to support requests, and communicate about your account.',
              },
              {
                title: 'AI Processing',
                description:
                  'To generate explanations, chat responses, OCR results, and document-analysis outputs that you explicitly request.',
              },
              {
                title: 'Security and Reliability',
                description: 'To prevent abuse, secure the service, and troubleshoot issues.',
              },
            ]}
          />
        </Section>

        <Section icon="🤖" title="AI Processing, Privacy Mode, and Consent">
          <p>
            Zohal offers standard processing and Privacy Mode. In standard processing, some AI
            features may send relevant document data to cloud AI processors after you give in-app
            permission. In Privacy Mode, the original PDF stays on your device and supported cloud
            features use sanitized content instead.
          </p>
          <BulletList
            items={[
              {
                title: 'What may be sent',
                description:
                  'Selected text, nearby context, prompts, retrieved excerpts, document text required for a requested analysis, and image regions required for OCR.',
              },
              {
                title: 'When it is sent',
                description:
                  'Only when you choose AI-assisted features such as chat, Explain, OCR, or contract analysis.',
              },
              {
                title: 'Permission',
                description:
                  'We ask for one-time in-app permission before the first standard-mode cloud AI request, and you can withdraw that permission later in Settings.',
              },
              {
                title: 'Model training',
                description:
                  'Client documents and AI request content are not used by Zohal to train third-party AI models.',
              },
            ]}
          />
        </Section>

        <Section icon="🤝" title="Data Sharing and Service Providers">
          <p>We share data only as needed to provide the service, comply with law, or with your direction.</p>
          <BulletList
            items={[
              {
                title: 'Core Infrastructure',
                description:
                  'We use Supabase for authentication, database services, access controls, and operational backend services, and Google Cloud infrastructure for storage and compute operations.',
              },
              {
                title: 'AI and OCR Processors',
                description:
                  'We use Google Cloud Vertex AI, OpenAI, and Mathpix to power specific AI and OCR features. Depending on the selected model or workspace configuration, Vertex AI may process requests using Google-hosted or supported third-party publisher models available through Vertex AI.',
              },
              {
                title: 'Connected Services',
                description:
                  'If you connect Google Drive, Google Sign-In, Microsoft OneDrive, or other integrations, we process the data needed to provide that connection at your request.',
              },
              {
                title: 'Legal Requirements',
                description:
                  'We may disclose information if required by law or to protect rights, safety, or the integrity of the service.',
              },
              {
                title: 'With Your Direction',
                description:
                  'We process or share data with other services only when you trigger those actions or otherwise authorize them.',
              },
            ]}
          />
        </Section>

        <Section icon="🗂️" title="Third-Party Processor Summary">
          <BulletList
            items={[
              {
                title: 'Google Cloud Vertex AI',
                description:
                  'Processes AI prompts, selected text, retrieved excerpts, and document-analysis inputs for supported features.',
              },
              {
                title: 'OpenAI',
                description:
                  'Processes AI prompts, selected text, retrieved excerpts, and document-analysis inputs for supported features.',
              },
              {
                title: 'Mathpix',
                description:
                  'Processes image regions or handwriting inputs when you use OCR or handwriting-recognition features.',
              },
              {
                title: 'Google Drive and Microsoft OneDrive',
                description:
                  'Process authentication and file-import actions only when you connect those services and choose files to import.',
              },
            ]}
          />
        </Section>

        <Section icon="🧩" title="Google API Services">
          <p>
            Zohal uses Google API Services to provide sign-in and optional file import features.
            When you connect your Google account, we may access the following:
          </p>
          <BulletList
            items={[
              {
                title: 'Google Sign-In',
                description:
                  'Basic profile information such as name, email address, and profile image for authentication and account creation.',
              },
              {
                title: 'Google Drive',
                description:
                  'The files or folders you choose to import into Zohal. We do not access unrelated files in your Drive.',
              },
              {
                title: 'Google Calendar',
                description:
                  'Permission to create calendar events on your behalf only when you explicitly ask us to create them.',
              },
            ]}
          />
          <HighlightBox>
            <p className="text-sm">
              Our use of Google API Services complies with the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:opacity-80"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </HighlightBox>
        </Section>

        <Section icon="🛡️" title="Data Security">
          <ul className="space-y-2 my-4">
            {[
              'Encryption of data in transit and at rest where supported by the underlying service',
              'Authenticated access controls and role-based restrictions',
              'Operational logging and security reviews',
              'Limited access to personal data on a need-to-know basis',
            ].map((item, i) => (
              <li key={i} className="relative pl-6">
                <span className="absolute left-0 top-2.5 w-1.5 h-1.5 bg-accent rounded-full" />
                {item}
              </li>
            ))}
          </ul>
          <p>
            No system is perfectly secure, but we work to maintain appropriate technical and
            organizational safeguards.
          </p>
        </Section>

        <Section icon="✨" title="Your Rights and Choices">
          <BulletList
            items={[
              { title: 'Access', description: 'Request a copy of your personal data.' },
              { title: 'Correction', description: 'Update or correct inaccurate information.' },
              {
                title: 'Deletion',
                description:
                  'Delete your account and data through Settings > Delete Account in the app.',
              },
              {
                title: 'AI Consent',
                description:
                  'Grant or withdraw standard-mode cloud AI processing permission in the app settings.',
              },
              { title: 'Portability', description: 'Export your documents and data where available.' },
              {
                title: 'Marketing Opt-Out',
                description: 'Unsubscribe from marketing communications at any time.',
              },
            ]}
          />
        </Section>

        <Section icon="👶" title="Children&apos;s Privacy">
          <p>
            Zohal is not intended for children under 13 years of age, and we do not knowingly
            collect personal information from children under 13.
          </p>
        </Section>

        <Section icon="📝" title="Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. If changes are material, we may
            provide notice through the app, email, or other appropriate means before the updated
            policy becomes effective.
          </p>
        </Section>

        <Section icon="💬" title="Contact Us">
          <p>If you have questions about this Privacy Policy or our data practices, contact us:</p>
          <HighlightBox>
            <p className="text-sm">
              📧{' '}
              <a href="mailto:support@zohal.app" className="text-accent hover:opacity-80">
                support@zohal.app
              </a>{' '}
              or{' '}
              <a href="mailto:abdullah@watd.co" className="text-accent hover:opacity-80">
                abdullah@watd.co
              </a>
            </p>
          </HighlightBox>
        </Section>
      </main>
    </div>
  );
}
