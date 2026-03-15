'use client';

import Link from 'next/link';
import { AlertTriangle, CalendarDays, FileSearch, Layers, ListChecks, ReceiptText, Building2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { GenericModuleTab, type GenericModuleItem } from './GenericModuleTab';
import type { SummaryMetric, SummarySectionModel } from '@/lib/analysis/pane';
import { cn } from '@/lib/utils';

type SharedSummaryActions = {
  onCreatePinnedContext: () => void;
  onGenerateKnowledgePack: () => void;
  onRunCompliance: () => void;
  isGeneratingKnowledgePack: boolean;
  isRunningCompliance: boolean;
};

export interface GenericSummaryTabProps extends SharedSummaryActions {
  title: string;
  subtitle: string;
  metrics: SummaryMetric[];
  sections: SummarySectionModel[];
}

function SummaryActions({
  onCreatePinnedContext,
  onGenerateKnowledgePack,
  onRunCompliance,
  isGeneratingKnowledgePack,
  isRunningCompliance,
}: SharedSummaryActions) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onCreatePinnedContext}>
          Pin this run
        </Button>
        <Button size="sm" variant="secondary" onClick={onGenerateKnowledgePack} disabled={isGeneratingKnowledgePack}>
          {isGeneratingKnowledgePack ? 'Generating...' : 'Generate pack'}
        </Button>
        <Button size="sm" onClick={onRunCompliance} disabled={isRunningCompliance}>
          {isRunningCompliance ? 'Checking...' : 'Run compliance'}
        </Button>
      </CardContent>
    </Card>
  );
}

export function GenericSummaryTab({
  title,
  subtitle,
  metrics,
  sections,
  onCreatePinnedContext,
  onGenerateKnowledgePack,
  onRunCompliance,
  isGeneratingKnowledgePack,
  isRunningCompliance,
}: GenericSummaryTabProps) {
  return (
    <div className="space-y-4 animate-fadeInUp">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-accent/20 bg-accent/10">
              <Layers className="h-6 w-6 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-text leading-tight">{title}</h3>
              <p className="mt-2 text-sm text-text-soft">{subtitle}</p>
            </div>
          </div>

          {metrics.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-scholar border border-border bg-surface-alt p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">{metric.label}</div>
                  <div
                    className={cn(
                      'mt-1 text-sm font-semibold',
                      metric.tone === 'danger'
                        ? 'text-error'
                        : metric.tone === 'warning'
                          ? 'text-accent'
                          : metric.tone === 'success'
                            ? 'text-success'
                            : 'text-text'
                    )}
                  >
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {sections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {section.items.length === 0 ? (
              <p className="text-sm text-text-soft">No items recorded for this section.</p>
            ) : (
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.id} className="rounded-scholar border border-border bg-surface-alt p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">{item.label}</div>
                    {item.href ? (
                      <Link href={item.href} className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
                        <FileSearch className="h-3.5 w-3.5" />
                        {item.value}
                      </Link>
                    ) : (
                      <div className="mt-1 text-sm text-text">{item.value}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <SummaryActions
        onCreatePinnedContext={onCreatePinnedContext}
        onGenerateKnowledgePack={onGenerateKnowledgePack}
        onRunCompliance={onRunCompliance}
        isGeneratingKnowledgePack={isGeneratingKnowledgePack}
        isRunningCompliance={isRunningCompliance}
      />
    </div>
  );
}

export function RenewalSummaryTab(props: GenericSummaryTabProps & { nextAction?: string | null }) {
  const nextActionSection = props.nextAction
    ? [{ id: 'next-action', title: 'Next action', items: [{ id: 'next-action', label: 'Action', value: props.nextAction }] }]
    : [];
  return <GenericSummaryTab {...props} sections={[...nextActionSection, ...props.sections]} />;
}

export function InvoiceSummaryTab(props: GenericSummaryTabProps) {
  return <GenericSummaryTab {...props} />;
}

export interface NativeModuleTabProps {
  items: GenericModuleItem[];
  emptyTitle: string;
  emptyDescription: string;
  workspaceId: string;
  documentId: string;
  onReject: (itemId: string) => void;
  isPatchingSnapshot?: boolean;
}

type StructuredFindingsTabProps = NativeModuleTabProps & {
  moduleId: string;
  moduleTitle: string;
  badgeLabel: string;
  subtitle: string;
  badgeVariant?: 'default' | 'warning' | 'success' | 'error';
};

function renderEvidenceLink(item: GenericModuleItem) {
  if (!item.sourceHref) return null;
  return (
    <Link href={item.sourceHref} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
      <FileSearch className="h-3 w-3" />
      Source
    </Link>
  );
}

export function RenewalActionsTab(props: NativeModuleTabProps) {
  const sorted = [...props.items].sort((a, b) => {
    const aDate = String(a.metadata?.['Due Date'] || a.metadata?.Due || a.metadata?.Deadline || '');
    const bDate = String(b.metadata?.['Due Date'] || b.metadata?.Due || b.metadata?.Deadline || '');
    return aDate.localeCompare(bDate);
  });

  if (sorted.length === 0) {
    return <EmptyState title={props.emptyTitle} description={props.emptyDescription} />;
  }

  return (
    <div className="space-y-3 animate-fadeInUp">
      {sorted.map((item, index) => (
        <div key={item.id} className="relative pl-10">
          <div className="absolute left-3 top-4 h-full w-px bg-border last:hidden" />
          <div className="absolute left-1.5 top-4 z-10 rounded-full border border-accent/20 bg-accent/10 p-1">
            <CalendarDays className="h-3 w-3 text-accent" />
          </div>
          <Card className="border-border">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-text">{item.title}</div>
                  {item.subtitle ? <div className="text-xs text-text-soft">{item.subtitle}</div> : null}
                </div>
                <Badge size="sm">{index + 1}</Badge>
              </div>
              {item.body ? <p className="text-sm text-text-soft">{item.body}</p> : null}
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-soft">
                {Object.entries(item.metadata || {}).slice(0, 4).map(([key, value]) => (
                  <span key={key}>
                    <span className="font-medium text-text">{key}:</span> {String(value)}
                  </span>
                ))}
                {renderEvidenceLink(item)}
              </div>
              <div>
                <Button size="sm" variant="secondary" disabled={props.isPatchingSnapshot} onClick={() => props.onReject(item.id)}>
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

export function AmendmentConflictTab(props: NativeModuleTabProps) {
  return (
    <GenericModuleTab
      moduleId="amendment_conflicts"
      moduleTitle="Amendment Conflicts"
      items={props.items}
      groupBy="groupKey"
      emptyTitle={props.emptyTitle}
      emptyDescription={props.emptyDescription}
      onReject={props.onReject}
      isPatchingSnapshot={props.isPatchingSnapshot}
      workspaceId={props.workspaceId}
      documentId={props.documentId}
      headerAction={
        <Badge size="sm" variant="warning">
          Change ledger
        </Badge>
      }
    />
  );
}

function StructuredFindingsTab({
  moduleId,
  moduleTitle,
  badgeLabel,
  subtitle,
  badgeVariant = 'default',
  ...props
}: StructuredFindingsTabProps) {
  const groupCount = new Set(props.items.map((item) => item.groupKey).filter(Boolean)).size;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Badge size="sm" variant={badgeVariant}>{badgeLabel}</Badge>
          <Badge size="sm">{props.items.length} findings</Badge>
          {groupCount > 0 ? <Badge size="sm">{groupCount} groups</Badge> : null}
          <div className="text-sm text-text-soft">{subtitle}</div>
        </CardContent>
      </Card>
      <GenericModuleTab
        moduleId={moduleId}
        moduleTitle={moduleTitle}
        items={props.items}
        groupBy="groupKey"
        emptyTitle={props.emptyTitle}
        emptyDescription={props.emptyDescription}
        onReject={props.onReject}
        isPatchingSnapshot={props.isPatchingSnapshot}
        workspaceId={props.workspaceId}
        documentId={props.documentId}
      />
    </div>
  );
}

export function ComplianceDeviationsTab(
  props: NativeModuleTabProps & { verdictCount: number; exceptionCount: number }
) {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Badge size="sm" variant={props.exceptionCount > 0 ? 'warning' : 'default'}>
            {props.exceptionCount} exceptions
          </Badge>
          <Badge size="sm">{props.verdictCount} verdicts</Badge>
          <div className="text-sm text-text-soft">Deviation board with linked rule and review signals.</div>
        </CardContent>
      </Card>
      <GenericModuleTab
        moduleId="compliance_deviations"
        moduleTitle="Compliance Deviations"
        items={props.items}
        groupBy="groupKey"
        emptyTitle={props.emptyTitle}
        emptyDescription={props.emptyDescription}
        onReject={props.onReject}
        isPatchingSnapshot={props.isPatchingSnapshot}
        workspaceId={props.workspaceId}
        documentId={props.documentId}
      />
    </div>
  );
}

export function InvoiceExceptionsTab(props: NativeModuleTabProps) {
  if (props.items.length === 0) {
    return <EmptyState title={props.emptyTitle} description={props.emptyDescription} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-accent" />
          Invoice Exception Ledger
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-text-soft">
              <th className="py-2 pr-4">Exception</th>
              <th className="py-2 pr-4">Severity</th>
              <th className="py-2 pr-4">Details</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {props.items.map((item) => (
              <tr key={item.id}>
                <td className="py-3 pr-4 font-medium text-text">{item.title}</td>
                <td className="py-3 pr-4">
                  <Badge size="sm" variant={item.severity === 'high' || item.severity === 'critical' ? 'error' : item.severity === 'warning' ? 'warning' : 'default'}>
                    {item.severity || 'review'}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-text-soft">{item.body || 'No extra detail recorded.'}</td>
                <td className="py-3 pr-4">{renderEvidenceLink(item) || <span className="text-xs text-text-soft">Unavailable</span>}</td>
                <td className="py-3">
                  <Button size="sm" variant="secondary" disabled={props.isPatchingSnapshot} onClick={() => props.onReject(item.id)}>
                    Reject
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function ObligationDependenciesTab(props: NativeModuleTabProps) {
  return (
    <StructuredFindingsTab
      {...props}
      moduleId="obligation_dependencies"
      moduleTitle="Obligation Dependencies"
      badgeLabel="Dependency map"
      subtitle="Prerequisites, recurring steps, and deadline-sensitive follow-up grouped for operational review."
      badgeVariant="warning"
    />
  );
}

export function VendorOnboardingChecksTab(props: NativeModuleTabProps) {
  return (
    <StructuredFindingsTab
      {...props}
      moduleId="vendor_onboarding_checks"
      moduleTitle="Vendor Onboarding Checks"
      badgeLabel="Checklist"
      subtitle="Missing documents, mismatches, expiries, and approval blockers organized into review groups."
      badgeVariant="warning"
    />
  );
}

export function LeaseConflictsTab(props: NativeModuleTabProps) {
  const groupCount = new Set(props.items.map((item) => item.groupKey).filter(Boolean)).size;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Badge size="sm" variant="warning">Conflict ledger</Badge>
          <Badge size="sm">{props.items.length} conflicts</Badge>
          {groupCount > 0 ? <Badge size="sm">{groupCount} sections</Badge> : null}
          <div className="text-sm text-text-soft">Lease economics, renewals, notices, and side-letter overrides split into separate conflict findings.</div>
        </CardContent>
      </Card>
      {props.items.length === 0 ? (
        <EmptyState title={props.emptyTitle} description={props.emptyDescription} icon={<Building2 className="h-5 w-5" />} />
      ) : (
        <div className="space-y-3">
          {props.items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-accent" />
                    {item.title}
                  </span>
                  {item.groupKey ? <Badge size="sm" variant="warning">{item.groupKey}</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.body ? <p className="text-sm text-text-soft">{item.body}</p> : null}
                {item.metadata && Object.keys(item.metadata).length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(item.metadata).map(([key, value]) => (
                      <div key={key} className="rounded-scholar border border-border bg-surface-alt p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">{key}</div>
                        <div className="mt-1 text-sm text-text whitespace-pre-wrap">{String(value ?? '—')}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div>{renderEvidenceLink(item)}</div>
                  <Button size="sm" variant="secondary" disabled={props.isPatchingSnapshot} onClick={() => props.onReject(item.id)}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function CoverageGapsTab(props: NativeModuleTabProps) {
  return (
    <StructuredFindingsTab
      {...props}
      moduleId="coverage_gaps"
      moduleTitle="Coverage Gaps"
      badgeLabel="Coverage review"
      subtitle="Coverage blockers, evidence gaps, and exclusion concerns organized for claim review."
      badgeVariant="warning"
    />
  );
}

export function PolicyConformanceTab(props: NativeModuleTabProps) {
  return (
    <StructuredFindingsTab
      {...props}
      moduleId="policy_conformance"
      moduleTitle="Policy Conformance"
      badgeLabel="Policy review"
      subtitle="Policy mismatches, missing acknowledgements, and follow-up items grouped into a cleaner review board."
      badgeVariant="warning"
    />
  );
}

export function NativeModuleEmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: 'actions' | 'conflicts' | 'deviations' | 'invoice';
}) {
  const Icon = icon === 'invoice'
    ? ReceiptText
    : icon === 'conflicts'
      ? Building2
      : icon === 'deviations'
        ? AlertTriangle
        : ListChecks;
  return <EmptyState title={title} description={description} icon={<Icon className="h-5 w-5" />} />;
}
