import { describe, expect, it } from 'vitest';
import {
  recommendedSystemPlaybookNames,
  resolveRecommendedPlaybook,
  selectRecommendedPlaybook,
  supportsStructuredAnalysis,
} from '@/lib/document-analysis';

describe('document analysis template recommendations', () => {
  it('routes contracts into the compliance interface', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Vendor Agreement Renewal Notice',
      })[0]
    ).toBe('Policy & Regulatory Interface');
  });

  it('prefers the compliance interface as the broad default contract template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Master Services Agreement',
      })[0]
    ).toBe('Policy & Regulatory Interface');
  });

  it('matches renamed templates via aliases when selecting a template', () => {
    const playbook = selectRecommendedPlaybook(
      [
        {
          id: 'pb-1',
          name: 'Policy & Regulatory Interface',
          is_system_preset: true,
          current_version: {
            id: 'v1',
            version_number: 1,
            spec_json: {
              meta: {
                aliases: ['Policy & Regulatory Portal'],
              },
            },
          },
        },
      ],
      {
        documentType: 'contract',
        title: 'Master Services Agreement Renewal Letter',
      }
    );

    expect(playbook?.name).toBe('Policy & Regulatory Interface');
  });

  it('routes invoices and onboarding documents into the logistics interface', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'invoice',
        title: 'March invoice',
      })[0]
    ).toBe('Logistics Operations Interface');

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'onboarding_doc',
        title: 'Vendor onboarding packet',
      })[0]
    ).toBe('Logistics Operations Interface');
  });

  it('routes financial reports and research corpora into the new top-level templates', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'financial_report',
        title: 'FY2025 Annual Report',
      })[0]
    ).toBe('Investor Reporting Dashboard');

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'paper',
        title: 'Meta-analysis of cardiovascular outcomes',
      })[0]
    ).toBe('Research Synthesis Interface');
  });

  it('marks onboarding documents as structured-analysis capable', () => {
    expect(supportsStructuredAnalysis('onboarding_doc')).toBe(true);
    expect(supportsStructuredAnalysis('paper')).toBe(true);
    expect(supportsStructuredAnalysis('textbook')).toBe(true);
  });

  it('uses classifier-ranked template ids before heuristic fallback', () => {
    const playbooks = [
      {
        id: 'pb-compliance',
        name: 'Policy & Regulatory Interface',
        is_system_preset: true,
        current_version: {
          id: 'v-compliance',
          version_number: 1,
          spec_json: {
            template_id: 'compliance_docset_review',
            meta: {
              aliases: ['Policy & Regulatory Portal'],
            },
          },
        },
      },
      {
        id: 'pb-logistics',
        name: 'Logistics Operations Interface',
        is_system_preset: true,
        current_version: {
          id: 'v-logistics',
          version_number: 1,
          spec_json: {
            template_id: 'logistics_operations_portal',
          },
        },
      },
    ];

    const playbook = resolveRecommendedPlaybook(playbooks, {
      documentType: 'contract',
      title: 'Sample Commercial Lease Test Set',
      originalFilename: 'Sample Commercial Lease Test Set.pdf',
      recommendedTemplateIds: ['compliance_docset_review'],
    });

    expect(playbook?.name).toBe('Policy & Regulatory Interface');
  });

  it('prefers stored recommendation metadata before name heuristics', () => {
    const playbook = selectRecommendedPlaybook(
      [
        {
          id: 'pb-investor',
          name: 'Investor Reporting Dashboard',
          is_system_preset: true,
          current_version: {
            id: 'v-investor',
            version_number: 1,
            spec_json: {
              template_id: 'investor_reporting_dashboard',
              meta: { name: 'Investor Reporting Dashboard', kind: 'document' },
              canonical_profile: {
                positioning: {
                  recommended_document_types: ['financial_report'],
                },
              },
            },
          },
        },
        {
          id: 'pb-contract',
          name: 'Policy & Regulatory Interface',
          is_system_preset: true,
          current_version: {
            id: 'v-contract',
            version_number: 1,
            spec_json: {
              template_id: 'compliance_docset_review',
              meta: { name: 'Policy & Regulatory Interface', kind: 'document' },
            },
          },
        },
      ],
      {
        documentType: 'financial_report',
        title: 'FY2025 Annual Report',
      }
    );

    expect(playbook?.name).toBe('Investor Reporting Dashboard');
  });
});
