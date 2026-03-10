import { describe, expect, it } from 'vitest';
import {
  deriveModuleDescriptors,
  deriveTabDescriptors,
  getSnapshotTemplateId,
  isContractOverviewTemplate,
  moduleResultToFindingCards,
  recordsToFindingCards,
  selectModuleRenderer,
  selectSummaryRenderer,
} from '@/lib/analysis/pane';
import type { EvidenceGradeSnapshot } from '@/types/evidence-grade';

function snapshot(partial: Partial<EvidenceGradeSnapshot>): EvidenceGradeSnapshot {
  return {
    schema_version: '2.0',
    template: 'contract_analysis',
    variables: [],
    clauses: [],
    obligations: [],
    risks: [],
    analyzed_at: '2026-03-10T00:00:00.000Z',
    chunks_analyzed: 0,
    document_id: 'doc-1',
    ...partial,
  };
}

describe('analysis pane helpers', () => {
  it('selects generic summary for unknown and adjacent templates', () => {
    expect(selectSummaryRenderer('employment_document_review')).toBe('generic');
    expect(selectSummaryRenderer('unknown_template')).toBe('generic');
  });

  it('keeps contract overview allowlist and native overrides', () => {
    expect(isContractOverviewTemplate('contract_analysis')).toBe(true);
    expect(selectSummaryRenderer('contract_analysis')).toBe('contract');
    expect(selectSummaryRenderer('renewal_pack')).toBe('renewal');
    expect(selectSummaryRenderer('vendor_invoice_exceptions')).toBe('invoice');
  });

  it('resolves native module renderers before generic fallback', () => {
    expect(selectModuleRenderer('renewal_pack', 'renewal_actions')).toBe('renewal_actions');
    expect(selectModuleRenderer('playbook_compliance_review', 'compliance_deviations')).toBe('compliance_deviations');
    expect(selectModuleRenderer('lease_pack', 'lease_conflicts')).toBe('lease_conflicts');
    expect(selectModuleRenderer('vendor_onboarding_review', 'vendor_onboarding_checks')).toBe('vendor_onboarding_checks');
    expect(selectModuleRenderer('custom_template', 'research_findings')).toBe('generic');
  });

  it('derives enabled non-core modules even when output is missing', () => {
    const result = deriveModuleDescriptors(snapshot({
      template: 'unknown_template',
      pack: {
        playbook: {
          modules_enabled: ['research_findings'],
          modules_v2: [
            { id: 'research_findings', title: 'Research Findings', enabled: true },
          ],
        },
      },
    }));

    expect(result).toEqual([
      expect.objectContaining({
        id: 'research_findings',
        title: 'Research Findings',
        hasOutput: false,
      }),
    ]);
  });

  it('keeps module outputs as first-class tabs for unknown templates', () => {
    const moduleDescriptors = deriveModuleDescriptors(snapshot({
      template: 'unknown_template',
      pack: {
        playbook: {
          modules_enabled: ['research_findings'],
          modules_v2: [
            { id: 'research_findings', title: 'Research Findings', enabled: true },
          ],
        },
        modules: {
          research_findings: {
            id: 'research_findings',
            title: 'Research Findings',
            status: 'ok',
            result: [{ title: 'Claim', description: 'Backed by source' }],
          },
        },
      },
    }));

    const tabs = deriveTabDescriptors({
      enabledCoreModules: new Set<string>(),
      moduleDescriptors,
      counts: { research_findings: 1 },
      attentionCounts: {},
      hasRecords: false,
      recordCount: 0,
      hasVerdicts: false,
      verdictCount: 0,
      verdictAttentionCount: 0,
      hasExceptions: false,
      exceptionCount: 0,
      exceptionAttentionCount: 0,
    });

    expect(tabs.map((tab) => tab.id)).toEqual(['overview', 'module:research_findings']);
  });

  it('adds records tab when only variables and records exist', () => {
    const tabs = deriveTabDescriptors({
      enabledCoreModules: new Set<string>(['variables']),
      moduleDescriptors: [],
      counts: { variables: 2 },
      attentionCounts: { variables: 1, records: 1 },
      hasRecords: true,
      recordCount: 3,
      hasVerdicts: false,
      verdictCount: 0,
      verdictAttentionCount: 0,
      hasExceptions: false,
      exceptionCount: 0,
      exceptionAttentionCount: 0,
    });

    expect(tabs.map((tab) => tab.id)).toEqual(['overview', 'variables', 'records']);
  });

  it('derives template id from pack metadata before snapshot template', () => {
    const value = getSnapshotTemplateId(snapshot({
      template: 'contract_analysis',
      pack: { template_id: 'vendor_invoice_exceptions' },
    }));

    expect(value).toBe('vendor_invoice_exceptions');
  });

  it('normalizes module outputs into finding cards', () => {
    const findings = moduleResultToFindingCards({
      moduleId: 'invoice_exceptions',
      moduleTitle: 'Invoice Exceptions',
      result: {
        exceptions: [
          {
            title: 'VAT mismatch',
            severity: 'high',
            description: 'Total does not match subtotal + VAT.',
            evidence: [{ page_number: 2, source_quote: 'VAT 15%' }],
            status: 'open',
          },
        ],
      },
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: 'invoice_exceptions::exceptions:0',
        title: 'VAT mismatch',
        severity: 'high',
        needsAttention: true,
        evidence: expect.objectContaining({ page_number: 2 }),
      }),
    ]);
  });

  it('splits grouped object-shaped custom modules into multiple findings', () => {
    const findings = moduleResultToFindingCards({
      moduleId: 'lease_conflicts',
      moduleTitle: 'Lease Conflicts',
      result: {
        proportionate_share_inconsistency: {
          original_lease: 'Tenant share is 7.8%.',
          first_amendment: 'Tenant share changes to 9.58%.',
        },
        renewal_conflicts: {
          original_lease: 'One 5-year renewal at 95% FMV.',
          first_amendment: 'Two 3-year renewals at 100% FMV.',
        },
        rent_economics_conflicts: {
          original_lease: 'Three months free rent.',
          side_letter: 'Two additional months free rent.',
        },
        termination_conflicts: {
          original_lease: 'Termination right after month 36.',
          first_amendment: 'Deletes that right.',
        },
      },
    });

    expect(findings).toHaveLength(4);
    expect(findings.map((item) => item.title)).toEqual([
      'Proportionate Share Inconsistency',
      'Renewal Conflicts',
      'Rent Economics Conflicts',
      'Termination Conflicts',
    ]);
  });

  it('normalizes v3 records into finding cards', () => {
    const findings = recordsToFindingCards([
      {
        id: 'rec-1',
        record_type: 'finding',
        title: 'Policy gap',
        summary: 'Insurance certificate missing.',
        status: 'open',
        severity: 'warning',
        fields: { owner: 'Procurement' },
      },
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        id: 'rec-1',
        title: 'Policy gap',
        attentionLabel: 'Open',
        metadata: { Owner: 'Procurement' },
      }),
    ]);
  });
});
