import { describe, expect, it } from 'vitest';
import {
  recommendedSystemPlaybookNames,
  resolveRecommendedPlaybook,
  selectRecommendedPlaybook,
  supportsStructuredAnalysis,
} from '@/lib/document-analysis';

describe('document analysis template recommendations', () => {
  it('routes contracts into the PE diligence template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Vendor Agreement Renewal Notice',
      })[0]
    ).toBe('PE Diligence Data Room Workspace');
  });

  it('prefers PE diligence as the broad default contract template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Master Services Agreement',
      })[0]
    ).toBe('PE Diligence Data Room Workspace');
  });

  it('matches renamed templates via aliases when selecting a template', () => {
    const playbook = selectRecommendedPlaybook(
      [
        {
          id: 'pb-1',
          name: 'Public Company Intelligence Workspace',
          is_system_preset: true,
          current_version: {
            id: 'v1',
            version_number: 1,
            spec_json: {
              meta: {
                aliases: ['Investor Reporting Dashboard'],
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

    expect(playbook?.name).toBe('Public Company Intelligence Workspace');
  });

  it('routes invoices and onboarding documents into the SMB cash flow template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'invoice',
        title: 'March invoice',
      })[0]
    ).toBe('SMB Cash Flow Workspace');

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'onboarding_doc',
        title: 'Vendor onboarding packet',
      })[0]
    ).toBe('SMB Cash Flow Workspace');
  });

  it('routes financial reports and research corpora into finance templates', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'financial_report',
        title: 'FY2025 Annual Report',
      })[0]
    ).toBe('Public Company Intelligence Workspace');

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'paper',
        title: 'Meta-analysis of cardiovascular outcomes',
      })[0]
    ).toBe('Quant Research Workspace');
  });

  it('marks onboarding documents as structured-analysis capable', () => {
    expect(supportsStructuredAnalysis('onboarding_doc')).toBe(true);
    expect(supportsStructuredAnalysis('paper')).toBe(true);
    expect(supportsStructuredAnalysis('textbook')).toBe(true);
  });

  it('uses classifier-ranked template ids before heuristic fallback', () => {
    const playbooks = [
      {
        id: 'pb-pe',
        name: 'PE Diligence Data Room Workspace',
        is_system_preset: true,
        current_version: {
          id: 'v-pe',
          version_number: 1,
          spec_json: {
            template_id: 'pe_diligence_data_room_workspace',
            meta: {
              aliases: [],
            },
          },
        },
      },
      {
        id: 'pb-smb',
        name: 'SMB Cash Flow Workspace',
        is_system_preset: true,
        current_version: {
          id: 'v-smb',
          version_number: 1,
          spec_json: {
            template_id: 'smb_cash_flow_workspace',
          },
        },
      },
    ];

    const playbook = resolveRecommendedPlaybook(playbooks, {
      documentType: 'contract',
      title: 'Sample Commercial Lease Test Set',
      originalFilename: 'Sample Commercial Lease Test Set.pdf',
      recommendedTemplateIds: ['pe_diligence_data_room_workspace'],
    });

    expect(playbook?.name).toBe('PE Diligence Data Room Workspace');
  });

  it('prefers stored recommendation metadata before name heuristics', () => {
    const playbook = selectRecommendedPlaybook(
      [
        {
          id: 'pb-investor',
          name: 'Public Company Intelligence Workspace',
          is_system_preset: true,
          current_version: {
            id: 'v-investor',
            version_number: 1,
            spec_json: {
              template_id: 'investor_reporting_dashboard',
              meta: { name: 'Public Company Intelligence Workspace', kind: 'document' },
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
          name: 'PE Diligence Data Room Workspace',
          is_system_preset: true,
          current_version: {
            id: 'v-contract',
            version_number: 1,
            spec_json: {
              template_id: 'pe_diligence_data_room_workspace',
              meta: { name: 'PE Diligence Data Room Workspace', kind: 'document' },
            },
          },
        },
      ],
      {
        documentType: 'financial_report',
        title: 'FY2025 Annual Report',
      }
    );

    expect(playbook?.name).toBe('Public Company Intelligence Workspace');
  });
});
