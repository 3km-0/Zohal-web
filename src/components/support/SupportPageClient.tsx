'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { IconBox, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

export function SupportPageClient() {
  const supabase = useMemo(() => createClient(), []);
  const [category, setCategory] = useState<'general' | 'billing' | 'bug' | 'feature_request'>('general');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitSupportTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setTicketId(null);
    if (!subject.trim() || !message.trim() || message.trim().length < 10) {
      setSubmitError('Please add a subject and at least 10 characters in the message.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('support-ticket-create', {
        body: {
          category,
          priority,
          subject: subject.trim(),
          message: message.trim(),
          email: email.trim() || undefined,
          source: 'web_support_tab',
        },
      });
      if (error || !data?.ticket?.id) {
        throw new Error(data?.message || 'Failed to create support ticket');
      }
      setTicketId(String(data.ticket.id));
      setSubject('');
      setMessage('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit support ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-12">
      <header className="text-center pt-16 pb-12">
        <IconBox size="xl" variant="muted" className="mx-auto mb-6">
          💬
        </IconBox>
        <h1 className="text-4xl md:text-5xl font-bold text-text tracking-tight mb-4">
          Support for Zohal
        </h1>
        <p className="text-xl text-text-soft max-w-2xl mx-auto">
          Get help with billing, onboarding, workflow setup, trials, or product issues.
        </p>
      </header>

      <section className="mb-12 rounded-zohal border border-border bg-surface p-6">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-text">Open a Support Ticket</h2>
          <p className="text-text-soft mt-1">
            Send your issue here and the support team will receive it directly.
          </p>
        </div>
        <form className="space-y-4" onSubmit={submitSupportTicket}>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="rounded-zohal border border-border bg-surface-alt px-3 py-2 text-sm text-text"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              <option value="general">General</option>
              <option value="billing">Billing</option>
              <option value="bug">Bug</option>
              <option value="feature_request">Feature Request</option>
            </select>
            <select
              className="rounded-zohal border border-border bg-surface-alt px-3 py-2 text-sm text-text"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              type="email"
              placeholder="Email (optional)"
              className="rounded-zohal border border-border bg-surface-alt px-3 py-2 text-sm text-text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <input
            type="text"
            placeholder="Subject"
            className="w-full rounded-zohal border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            placeholder="Describe your issue or request"
            className="w-full min-h-[140px] rounded-zohal border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-zohal bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
            {ticketId && <span className="text-sm text-success">Ticket created: {ticketId}</span>}
            {submitError && <span className="text-sm text-error">{submitError}</span>}
          </div>
        </form>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        <ContactCard
          icon="📧"
          title="Email Support"
          description="Have a question or need assistance? Send us an email."
          link="mailto:support@zohal.app"
          linkText="support@zohal.app →"
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
          description="Have an idea to make Zohal better? We review every serious request."
          link="mailto:ideas@zohal.app"
          linkText="ideas@zohal.app →"
          responseTime="Every idea is reviewed"
        />
      </div>

      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-text mb-2">Frequently Asked Questions</h2>
          <p className="text-text-soft">Quick answers about the product, billing, and support.</p>
        </div>

        <div className="space-y-3">
          <FAQItem
            icon="🚀"
            question="How do I get started with Zohal?"
            answer="Create an account on the web, upload your first document set, and start reviewing verified findings. If your team needs a guided rollout, contact us and we can help you set it up."
          />
          <FAQItem
            icon="🔐"
            question="Is my data secure?"
            answer={
              <>
                We use encryption in transit and at rest, access controls, and audit-oriented review
                workflows. Read our{' '}
                <Link href="/privacy" className="text-accent hover:opacity-80">
                  Privacy Policy
                </Link>{' '}
                for more detail.
              </>
            }
          />
          <FAQItem
            icon="💼"
            question="Who is Zohal built for?"
            answer="Zohal is built for teams that review sensitive documents and need outputs that can be checked, trusted, and shared with evidence attached."
          />
          <FAQItem
            icon="🧾"
            question="What does support cover?"
            answer="We help with billing, account access, onboarding questions, bug reports, workflow setup, and trial or team-plan questions."
          />
          <FAQItem
            icon="🗑️"
            question="How do I delete my account?"
            answer="You can delete your account from Settings > Delete Account. This permanently deletes your documents, notes, and workspaces. You can also email support and we will process the request."
          />
          <FAQItem
            icon="💳"
            question="How do subscriptions work?"
            answer={
              <>
                Zohal offers free and paid tiers for individuals and teams, including Core,
                Investor Pro, and Team. Web billing is managed through Moyasar for eligible
                plans, while App Store billing remains Apple-managed. See our{' '}
                <Link href="/terms" className="text-accent hover:opacity-80">
                  Terms of Use
                </Link>{' '}
                for full details.
              </>
            }
          />
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
    <Card className="text-center h-full" padding="lg">
      <IconBox size="lg" variant="muted" className="mx-auto mb-4">
        {icon}
      </IconBox>
      <h3 className="text-lg font-semibold text-text mb-2">{title}</h3>
      <p className="text-text-soft mb-4 leading-relaxed">{description}</p>
      <a
        href={link}
        className="inline-flex items-center text-accent font-medium hover:opacity-80 transition-opacity mb-3"
      >
        {linkText}
      </a>
      <div className="text-sm text-text-soft">{responseTime}</div>
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
  return (
    <div className={cn('rounded-zohal border border-border bg-surface p-5')}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-surface-alt border border-border rounded-zohal flex items-center justify-center flex-shrink-0 text-lg">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text mb-2">{question}</h3>
          <div className="text-text-soft leading-relaxed">{answer}</div>
        </div>
      </div>
    </div>
  );
}
