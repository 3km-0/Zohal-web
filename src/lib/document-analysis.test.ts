import { describe, expect, it } from 'vitest';
import {
  recommendedSystemPlaybookNames,
  resolveRecommendedPlaybook,
  selectRecommendedPlaybook,
  supportsStructuredAnalysis,
} from '@/lib/document-analysis';

describe('document analysis template recommendations', () => {
  it('prefers the renamed renewal template and still supports legacy aliases', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Vendor Agreement Renewal Notice',
      })[0]
    ).toBe('Renewal Radar');
  });

  it('prefers contract compliance workspace as the broad default contract template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Master Services Agreement',
      })[0]
    ).toBe('Contract Compliance Workspace');
  });

  it('matches renamed templates via aliases when selecting a playbook', () => {
    const playbook = selectRecommendedPlaybook(
      [
        {
          id: 'pb-1',
          name: 'Renewal Radar',
          is_system_preset: true,
          current_version: {
            id: 'v1',
            version_number: 1,
            spec_json: {
              meta: {
                aliases: ['Renewal Pack', 'Default (Renewal Pack)'],
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

    expect(playbook?.name).toBe('Renewal Radar');
  });

  it('routes invoices and onboarding documents into the expanded library', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'invoice',
        title: 'March invoice',
      })[0]
    ).toBe('Vendor Invoice Exceptions');

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'onboarding_doc',
        title: 'Vendor onboarding packet',
      })[0]
    ).toBe('Vendor Onboarding Review');
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
    ).toBe('Research Synthesis Site');
  });

  it('marks onboarding documents as structured-analysis capable', () => {
    expect(supportsStructuredAnalysis('onboarding_doc')).toBe(true);
    expect(supportsStructuredAnalysis('paper')).toBe(true);
    expect(supportsStructuredAnalysis('textbook')).toBe(true);
  });

  it('uses classifier-ranked template ids before heuristic fallback', () => {
    const playbooks = [
      {
        id: 'pb-renewal',
        name: 'Renewal Radar',
        is_system_preset: true,
        current_version: {
          id: 'v-renewal',
          version_number: 1,
          spec_json: {
            template_id: 'renewal_pack',
            meta: {
              aliases: ['Renewal Pack'],
            },
          },
        },
      },
      {
        id: 'pb-lease',
        name: 'Commercial Lease Review',
        is_system_preset: true,
        current_version: {
          id: 'v-lease',
          version_number: 1,
          spec_json: {
            template_id: 'lease_pack',
          },
        },
      },
    ];

    const playbook = resolveRecommendedPlaybook(playbooks, {
      documentType: 'contract',
      title: 'Sample Commercial Lease Test Set',
      originalFilename: 'Sample Commercial Lease Test Set.pdf',
      recommendedTemplateIds: ['renewal_pack'],
    });

    expect(playbook?.name).toBe('Renewal Radar');
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
          name: 'Contract Compliance Workspace',
          is_system_preset: true,
          current_version: {
            id: 'v-contract',
            version_number: 1,
            spec_json: {
              template_id: 'contract_analysis',
              meta: { name: 'Contract Compliance Workspace', kind: 'document' },
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
