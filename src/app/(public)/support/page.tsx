'use client';

import { useState } from 'react';
import Link from 'next/link';
import { IconBox, Card } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function SupportPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-12">
      {/* Header */}
      <header className="text-center pt-16 pb-12">
        <IconBox size="xl" variant="muted" className="mx-auto mb-6">
          💬
        </IconBox>
        <h1 className="text-4xl md:text-5xl font-bold text-text tracking-tight mb-4">
          How Can We Help?
        </h1>
        <p className="text-xl text-text-soft max-w-lg mx-auto">
          We&apos;re here to make sure you have the best experience with Zohal. Find answers or
          reach out directly.
        </p>
      </header>

      {/* Contact Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        <ContactCard
          icon="📧"
          title="Email Support"
          description="Have a question or need assistance? Send us an email. For Google API / verification inquiries, you can also reach us at abdullah@watd.co."
          link="mailto:support@zohal.app"
          linkText="support@zohal.app (or abdullah@watd.co) →"
          responseTime="Usually responds within 24 hours"
        />
        <ContactCard
          icon="🐛"
          title="Report a Bug"
          description="Found something not working right? Let us know."
          link="mailto:bugs@zohal.app"
          linkText="bugs@zohal.app →"
          responseTime="We prioritize bug fixes"
        />
        <ContactCard
          icon="💡"
          title="Feature Request"
          description="Have an idea to make Zohal better? We'd love to hear it!"
          link="mailto:ideas@zohal.app"
          linkText="ideas@zohal.app →"
          responseTime="Every idea is reviewed"
        />
      </div>

      {/* FAQ Section */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-text mb-2">Frequently Asked Questions</h2>
          <p className="text-text-soft">Quick answers to common questions about Zohal</p>
        </div>

        <div className="space-y-3">
          <FAQItem
            icon="🚀"
            question="How do I get started with Zohal?"
            answer="Getting started is easy! Download Zohal from the App Store, create your account with email or Apple Sign In, and follow the quick onboarding guide. You'll be up and running in less than a minute."
          />
          <FAQItem
            icon="🔐"
            question="Is my data secure?"
            answer={
              <>
                Absolutely. We use industry-standard encryption to protect your data both in transit
                and at rest. We never sell your personal information to third parties. Read our{' '}
                <Link href="/privacy" className="text-accent hover:opacity-80">
                  Privacy Policy
                </Link>{' '}
                for complete details.
              </>
            }
          />
          <FAQItem
            icon="📱"
            question="Which devices are supported?"
            answer="Zohal is available for iPhone and iPad running iOS 17.0 or later. We've optimized the experience for all screen sizes, so whether you're on an iPhone or iPad Pro, you'll have a great experience."
          />
          <FAQItem
            icon="🔄"
            question="How do I sync my data across devices?"
            answer="Your data syncs automatically when you're signed into the same account on multiple devices. Just make sure you're connected to the internet and signed in, and everything will stay in sync seamlessly."
          />
          <FAQItem
            icon="🗑️"
            question="How do I delete my account?"
            answer="You can delete your account from Settings > Delete Account within the app. This will permanently delete all your data including documents, notes, and workspaces. Alternatively, email us at support@zohal.app and we'll process your request within 48 hours."
          />
          <FAQItem
            icon="💳"
            question="How do subscriptions work?"
            answer={
              <>
                Zohal offers both free and premium tiers (Pro and Premium). Subscriptions are managed
                through the App Store and can be cancelled anytime in your Apple ID settings.
                You&apos;ll retain access until the end of your billing period. See our{' '}
                <Link href="/terms" className="text-accent hover:opacity-80">
                  Terms of Use
                </Link>{' '}
                for full details.
              </>
            }
          />
        </div>
      </section>

      {/* Quick Links */}
      <section className="mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickLink href="/terms" icon="📜" label="Terms of Use" />
          <QuickLink href="/privacy" icon="🔒" label="Privacy Policy" />
          <QuickLink
            href="mailto:support@zohal.app?subject=Account%20Help"
            icon="👤"
            label="Account Help"
          />
          <QuickLink
            href="mailto:support@zohal.app?subject=Billing%20Question"
            icon="💰"
            label="Billing Questions"
          />
        </div>
      </section>

      {/* System Requirements */}
      <section className="bg-surface border border-border rounded-scholar p-7">
        <h3 className="text-lg font-semibold text-text mb-5 flex items-center gap-2">
          📋 System Requirements
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Requirement label="Platform" value="iOS / iPadOS" />
          <Requirement label="Minimum Version" value="iOS 17.0+" />
          <Requirement label="Devices" value="iPhone & iPad" />
          <Requirement label="Internet" value="Required for sync" />
        </div>
      </section>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  description,
  link,
  linkText,
  responseTime,
}: {
  icon: string;
  title: string;
  description: string;
  link: string;
  linkText: string;
  responseTime: string;
}) {
  return (
    <Card padding="md" className="text-center hover:-translate-y-0.5 transition-transform">
      <div className="w-14 h-14 bg-surface-alt border border-border rounded-scholar-lg flex items-center justify-center text-2xl mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">{title}</h3>
      <p className="text-text-soft text-sm mb-4">{description}</p>
      <a
        href={link}
        className="inline-flex items-center gap-1 text-accent font-semibold hover:opacity-80"
      >
        {linkText}
      </a>
      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full text-xs text-success">
        <span className="w-1.5 h-1.5 bg-success rounded-full" />
        {responseTime}
      </div>
    </Card>
  );
}

function FAQItem({
  icon,
  question,
  answer,
}: {
  icon: string;
  question: string;
  answer: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-scholar overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-surface-alt transition-colors"
      >
        <div className="w-9 h-9 bg-surface-alt border border-border rounded-scholar-sm flex items-center justify-center text-base flex-shrink-0">
          {icon}
        </div>
        <h3 className="flex-1 font-semibold text-text">{question}</h3>
        <span
          className={cn(
            'text-text-soft text-xl transition-transform duration-200',
            isOpen && 'rotate-45'
          )}
        >
          +
        </span>
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          isOpen ? 'max-h-96' : 'max-h-0'
        )}
      >
        <div className="px-5 pb-5 pl-[4.5rem] text-text-soft leading-relaxed">{answer}</div>
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-4 bg-surface border border-border rounded-scholar transition-all duration-200 hover:-translate-y-0.5 hover:border-accent"
    >
      <div className="w-10 h-10 bg-surface-alt rounded-scholar-lg flex items-center justify-center">
        {icon}
      </div>
      <span className="font-semibold text-text text-sm">{label}</span>
    </Link>
  );
}

function Requirement({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-surface-alt rounded-scholar-sm text-center">
      <div className="text-xs text-text-soft uppercase tracking-wider mb-1">{label}</div>
      <div className="font-semibold text-text">{value}</div>
    </div>
  );
}

