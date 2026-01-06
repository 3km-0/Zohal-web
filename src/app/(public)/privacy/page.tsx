import { getTranslations } from 'next-intl/server';
import { Badge, IconBox } from '@/components/ui';

export async function generateMetadata() {
  return {
    title: 'Privacy Policy - Zohal',
    description: 'Your privacy matters to us. Learn how we protect and handle your information.',
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
      {/* Header */}
      <header className="text-center pt-16 pb-12">
        <Badge variant="success" dot className="mb-6">
          Last updated: December 2025
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold text-text tracking-tight mb-4">
          Privacy Policy
        </h1>
        <p className="text-xl text-text-soft max-w-lg mx-auto">
          Your privacy matters to us. Here&apos;s how we protect and handle your information.
        </p>
      </header>

      {/* Content */}
      <main>
        <Section icon="🔒" title="Our Commitment to Privacy">
          <p>
            Welcome to <strong className="text-text">Zohal</strong>. We believe your personal data
            belongs to you. This Privacy Policy explains our practices regarding the collection,
            use, and protection of your information when you use our application.
          </p>
          <HighlightBox>
            <p className="text-sm">
              <strong className="text-text">In short:</strong> We collect only what&apos;s necessary
              to provide you with a great experience, and we never sell your personal data to third
              parties.
            </p>
          </HighlightBox>
        </Section>

        <Section icon="📊" title="Information We Collect">
          <p>To provide and improve Zohal, we may collect the following types of information:</p>
          <BulletList
            items={[
              {
                title: 'Account Information',
                description:
                  'When you create an account, we collect your email address and any profile information you choose to provide.',
              },
              {
                title: 'Usage Data',
                description:
                  'We collect anonymous data about how you interact with the app, including features used and session duration, to improve your experience.',
              },
              {
                title: 'Device Information',
                description:
                  'Basic device details like operating system version and device type help us optimize the app for your device.',
              },
              {
                title: 'User Content',
                description:
                  'Documents, notes, and other content you create or upload within the app is stored securely to provide our services.',
              },
            ]}
          />
        </Section>

        <Section icon="⚙️" title="How We Use Your Information">
          <p>Your information helps us deliver and improve the Zohal experience:</p>
          <BulletList
            items={[
              {
                title: 'Provide Services',
                description:
                  'To operate, maintain, and deliver the features you use, including AI-powered explanations and document analysis.',
              },
              {
                title: 'Personalization',
                description: 'To customize your experience and remember your preferences.',
              },
              {
                title: 'Communication',
                description:
                  'To send important updates, respond to inquiries, and provide customer support.',
              },
              {
                title: 'Improvement',
                description: 'To analyze usage patterns and continuously enhance the app.',
              },
              {
                title: 'Security',
                description: 'To detect and prevent fraud, abuse, and security incidents.',
              },
            ]}
          />
        </Section>

        <Section icon="🤝" title="Data Sharing & Third Parties">
          <p>We take your trust seriously. Here&apos;s when and how we might share information:</p>
          <BulletList
            items={[
              {
                title: 'We Never Sell Your Data',
                description: 'Your personal information is not for sale. Period.',
              },
              {
                title: 'Service Providers',
                description:
                  "We work with trusted partners who help us operate (hosting, analytics, AI services, and Google services when you connect your Google account). They're bound by strict confidentiality agreements.",
              },
              {
                title: 'AI Processing',
                description:
                  'Document content may be processed by AI services to provide explanations and analysis. This data is not used to train AI models.',
              },
              {
                title: 'Legal Requirements',
                description:
                  'We may disclose information if required by law or to protect rights and safety.',
              },
              {
                title: 'With Your Consent',
                description:
                  "We'll share information for any other purpose only with your explicit permission.",
              },
            ]}
          />
        </Section>

        <Section icon="🧩" title="Google API Services">
          <p>
            Zohal uses Google API Services to provide certain features. When you connect your Google
            account, we may access the following:
          </p>
          <BulletList
            items={[
              {
                title: 'Google Sign-In',
                description:
                  'Basic profile information (name, email address, profile picture) used solely for authentication and account creation.',
              },
              {
                title: 'Google Calendar',
                description:
                  'Permission to create calendar events on your behalf. We only add events you explicitly request through the app, and we do not read, store, or access your existing calendar events.',
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
          <p className="text-sm">
            You can revoke Zohal&apos;s access to your Google data at any time by visiting your{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:opacity-80"
            >
              Google Account permissions
            </a>
            .
          </p>
        </Section>

        <Section icon="🛡️" title="Data Security">
          <p>
            Protecting your data is a top priority. We implement industry-standard security measures
            including:
          </p>
          <ul className="space-y-2 my-4">
            {[
              'Encryption of data in transit (TLS) and at rest',
              'Secure cloud infrastructure with regular security audits',
              'Secure authentication practices including Apple Sign In',
              'Limited access to personal data on a need-to-know basis',
            ].map((item, i) => (
              <li key={i} className="relative pl-6">
                <span className="absolute left-0 top-2.5 w-1.5 h-1.5 bg-accent rounded-full" />
                {item}
              </li>
            ))}
          </ul>
          <p>
            While no system is 100% secure, we work hard to protect your information and continuously
            improve our security practices.
          </p>
        </Section>

        <Section icon="✨" title="Your Rights & Choices">
          <p>
            You have control over your data. Depending on your location, you may have the right to:
          </p>
          <BulletList
            items={[
              { title: 'Access', description: 'Request a copy of your personal data.' },
              { title: 'Correction', description: 'Update or correct inaccurate information.' },
              {
                title: 'Deletion',
                description:
                  'Delete your account and data through Settings > Delete Account in the app.',
              },
              { title: 'Portability', description: 'Export your documents and data.' },
              {
                title: 'Opt-Out',
                description: 'Unsubscribe from marketing communications at any time.',
              },
            ]}
          />
          <p>To exercise these rights, use the in-app settings or contact us at the email below.</p>
        </Section>

        <Section icon="👶" title="Children's Privacy">
          <p>
            Zohal is not intended for children under 13 years of age. We do not knowingly collect
            personal information from children under 13. If you believe we have inadvertently
            collected such information, please contact us immediately and we will take steps to
            delete it.
          </p>
        </Section>

        <Section icon="📝" title="Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices
            or for legal reasons. When we make significant changes, we&apos;ll notify you through
            the app or via email. We encourage you to review this policy periodically.
          </p>
        </Section>

        <Section icon="💬" title="Contact Us">
          <p>
            Have questions about this Privacy Policy or how we handle your data? We&apos;re here to
            help.
          </p>
          <HighlightBox>
            <p className="text-sm">
              📧 Email us at:{' '}
              <a href="mailto:support@zohal.app" className="text-accent hover:opacity-80">
                support@zohal.app
              </a>
              {' '}or{' '}
              <a href="mailto:abdullah@watd.co" className="text-accent hover:opacity-80">
                abdullah@watd.co
              </a>
            </p>
          </HighlightBox>
          <p>We typically respond within 24-48 hours.</p>
        </Section>
      </main>
    </div>
  );
}

