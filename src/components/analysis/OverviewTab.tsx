'use client';

import Link from 'next/link';
import { Scale, FileSearch, Globe, CalendarDays, RotateCw, Building2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';
import { RenewalTimeline } from './RenewalTimeline';
import type { EvidenceGradeSnapshot } from '@/types/evidence-grade';
import type { LegalContract } from '@/types/database';

export interface OverviewTabProps {
  contract: LegalContract;
  snapshot: EvidenceGradeSnapshot | null;
  workspaceId: string;
  documentId: string;
  bundleDocuments: Array<{ id: string; title: string; role?: string }>;
  verificationObjectState: string | null;
  // Actions
  onCreatePinnedContext: () => void;
  onGenerateKnowledgePack: () => void;
  onRunCompliance: () => void;
  isGeneratingKnowledgePack: boolean;
  isRunningCompliance: boolean;
  // Discrepancy / proof helpers
  proofHref: (evidence: any) => string | null;
}

export function OverviewTab({
  contract,
  snapshot,
  workspaceId,
  documentId,
  bundleDocuments,
  verificationObjectState,
  onCreatePinnedContext,
  onGenerateKnowledgePack,
  onRunCompliance,
  isGeneratingKnowledgePack,
  isRunningCompliance,
  proofHref,
}: OverviewTabProps) {
  const noticeDeadline = computeNoticeDeadline(contract.end_date, contract.notice_period_days);

  return (
    <div className="space-y-4 animate-fadeInUp">
      {/* Contract Identity Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-text leading-tight">
                {contract.counterparty_name || 'Unknown Counterparty'}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {contract.contract_type && (
                  <Badge size="sm">
                    <Scale className="w-3 h-3 mr-1" />
                    {contract.contract_type}
                  </Badge>
                )}
                {contract.governing_law && (
                  <Badge size="sm">
                    <Globe className="w-3 h-3 mr-1" />
                    {contract.governing_law}
                  </Badge>
                )}
                {contract.auto_renewal && (
                  <Badge size="sm" variant="warning">
                    <RotateCw className="w-3 h-3 mr-1" />
                    Auto-Renewal
                  </Badge>
                )}
                {verificationObjectState && (
                  <Badge size="sm" variant={verificationObjectState === 'finalized' ? 'success' : 'default'}>
                    {verificationObjectState === 'finalized' ? 'Finalized' : 'Provisional'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Dates & Timeline Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-accent" />
            Key Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Renewal Timeline */}
          <RenewalTimeline
            effectiveDate={contract.effective_date}
            noticeDeadline={noticeDeadline?.toISOString()}
            endDate={contract.end_date}
          />

          {/* Date details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DateDetail label="Effective" value={contract.effective_date} />
            <DateDetail label="End Date" value={contract.end_date} />
            <DateDetail
              label="Notice Deadline"
              value={noticeDeadline ? noticeDeadline.toLocaleDateString() : null}
              highlight
            />
            <DateDetail
              label="Notice Period"
              value={contract.notice_period_days != null ? `${contract.notice_period_days} days` : null}
            />
          </div>

          {/* End date evidence link */}
          {(() => {
            const endEvidence = snapshot?.variables.find((v) => v.name === 'end_date')?.evidence;
            const href = proofHref(endEvidence);
            if (!href) return null;
            return (
              <Link href={href} className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline">
                <FileSearch className="w-3.5 h-3.5" />
                View end-date evidence in PDF
              </Link>
            );
          })()}
        </CardContent>
      </Card>

      {/* Bundle Sources */}
      {snapshot?.pack?.bundle?.document_ids?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Sources Used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(bundleDocuments.length ? bundleDocuments : snapshot.pack.bundle.document_ids).map((d: any) => {
                const id = String(d?.id || d);
                const title = String(d?.title || id);
                const role = d?.role ? String(d.role) : '';
                return (
                  <Link
                    key={id}
                    href={`/workspaces/${workspaceId}/documents/${id}`}
                    className="inline-flex"
                    title={role ? `${title} (${role})` : title}
                  >
                    <Badge variant="default" className="max-w-[260px] truncate">
                      {role ? `${title} · ${role}` : title}
                    </Badge>
                  </Link>
                );
              })}
            </div>

            {/* Discrepancies */}
            {Array.isArray(snapshot.pack.discrepancies) && snapshot.pack.discrepancies.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-sm font-semibold text-text">Conflicts</div>
                {snapshot.pack.discrepancies.slice(0, 20).map((d: any) => {
                  const kind = String(d?.kind || '');
                  if (kind === 'variable_conflict') {
                    return (
                      <div key={String(d.id || `${d.variable_name}`)} className="rounded-scholar border border-border bg-surface-alt p-3">
                        <div className="text-sm font-semibold text-text">{String(d.variable_name || 'Variable')}</div>
                        <div className="mt-2 space-y-1">
                          {Array.isArray(d.values)
                            ? d.values.slice(0, 6).map((v: any, idx: number) => {
                                const ev = v?.evidence;
                                const href = proofHref(ev);
                                const label = `${String(v?.value ?? '—')} ${v?.ai_confidence ? `(${String(v.ai_confidence)})` : ''}`.trim();
                                return (
                                  <div key={`${idx}-${String(v?.document_id || '')}`} className="text-xs text-text">
                                    <span className="text-text-soft">{String(v?.document_id || '').slice(0, 8)}: </span>
                                    {href ? (
                                      <Link href={href} className="font-semibold text-accent hover:underline">{label}</Link>
                                    ) : (
                                      <span>{label}</span>
                                    )}
                                  </div>
                                );
                              })
                            : null}
                        </div>
                      </div>
                    );
                  }
                  if (kind === 'policy_conflict' || kind === 'regulatory_conflict') {
                    const contractHref = proofHref(d?.contract?.evidence);
                    const ruleHref = proofHref(d?.rule?.evidence);
                    return (
                      <div key={String(d.id || `${kind}-${d?.rule?.rule_id}`)} className="rounded-scholar border border-border bg-surface-alt p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-text">{String(d?.rule?.title || 'Compliance finding')}</div>
                          <Badge size="sm">{String(d?.severity || '').toLowerCase() || 'medium'}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs">
                          {contractHref ? (
                            <Link href={contractHref} className="font-semibold text-accent hover:underline">View contract evidence</Link>
                          ) : (
                            <span className="text-text-soft">Contract evidence unavailable</span>
                          )}
                          {ruleHref ? (
                            <Link href={ruleHref} className="font-semibold text-accent hover:underline">View policy/regulation evidence</Link>
                          ) : (
                            <span className="text-text-soft">Rule evidence unavailable</span>
                          )}
                        </div>
                        {d?.explanation ? (
                          <div className="mt-2 text-xs text-text-soft">{String(d.explanation).slice(0, 220)}</div>
                        ) : null}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Pinned Context & Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Pinned Context Sets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={onCreatePinnedContext}>
              Pin this document
            </Button>
            <Button size="sm" variant="secondary" onClick={onGenerateKnowledgePack} disabled={isGeneratingKnowledgePack}>
              {isGeneratingKnowledgePack ? 'Generating...' : 'Generate pack'}
            </Button>
            <Button size="sm" onClick={onRunCompliance} disabled={isRunningCompliance}>
              {isRunningCompliance ? 'Checking...' : 'Run compliance'}
            </Button>
          </div>
          {snapshot?.pack?.context ? (
            <div className="text-xs text-text-soft">
              {(() => {
                const ctx = snapshot.pack?.context as any;
                const sets = Array.isArray(ctx?.sets) ? (ctx.sets as any[]) : [];
                if (!sets.length) return 'Context sets are pinned, but no set metadata was recorded.';
                return `Included: ${sets.map((s) => `${s.name || s.id}${s.kind ? ` (${s.kind})` : ''}`).join(', ')}`;
              })()}
            </div>
          ) : (
            <div className="text-xs text-text-soft">
              No context sets recorded on this run. Create one, then re-run analysis to attach it.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Trail (collapsible) */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-text-soft hover:text-text transition-colors flex items-center gap-2 py-2">
          <span className="transition-transform group-open:rotate-90">▶</span>
          Audit Metadata
        </summary>
        <Card className="mt-2">
          <CardContent className="space-y-2 pt-4">
            {snapshot ? (
              <>
                <MetaRow label="Schema" value={snapshot.schema_version} />
                <MetaRow label="Template" value={snapshot.template} />
                {snapshot.pack?.modules_activated?.length ? (
                  <MetaRow label="Modules" value={snapshot.pack.modules_activated.join(', ')} />
                ) : null}
                <MetaRow label="Analyzed" value={snapshot.analyzed_at} />
                <MetaRow label="Chunks" value={String(snapshot.chunks_analyzed)} />
              </>
            ) : (
              <div className="text-sm text-text-soft">Snapshot unavailable (re-run analysis to generate it).</div>
            )}
            <div className="text-xs text-text-soft pt-2 border-t border-border">
              System: Zohal Evidence-Grade Analysis Platform
            </div>
          </CardContent>
        </Card>
      </details>
    </div>
  );
}

function DateDetail({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className={cn(
      'p-3 rounded-scholar-sm border',
      highlight ? 'border-accent/20 bg-accent/5' : 'border-border bg-surface-alt',
    )}>
      <div className="text-[10px] uppercase tracking-wider text-text-soft mb-1">{label}</div>
      <div className={cn('text-sm font-semibold', highlight ? 'text-accent' : 'text-text')}>
        {value || '—'}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="text-sm text-text">
      <span className="text-text-soft">{label}: </span>
      {value || '—'}
    </div>
  );
}

function computeNoticeDeadline(endDateIso: string | null | undefined, noticeDays: number | null | undefined): Date | null {
  if (!endDateIso || noticeDays == null) return null;
  const end = new Date(endDateIso);
  if (Number.isNaN(end.getTime())) return null;
  const d = new Date(end.getTime());
  d.setDate(d.getDate() - noticeDays);
  return d;
}
