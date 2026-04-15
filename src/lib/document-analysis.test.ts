import { describe, expect, it } from 'vitest';
import {
  recommendedSystemPlaybookNames,
  resolveRecommendedPlaybook,
  selectRecommendedPlaybook,
  supportsStructuredAnalysis,
} from '@/lib/document-analysis';

const operationsWorkspacePlaybook = {
  id: 'pb-operations-workspace',
  name: 'Operations Workspace',
  is_system_preset: true,
  current_version: {
    id: 'v-operations-workspace',
    version_number: 1,
    spec_json: {
      template_id: 'property_operations_workspace',
      meta: {
        aliases: ['Operations Workspace'],
      },
    },
  },
};

describe('document analysis template recommendations', () => {
  it('always recommends Operations Workspace as the user-facing system template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Retail Asset lease amendment and rent roll review',
      }),
    ).toEqual(['Operations Workspace']);

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'invoice',
        title: 'April payment ledger export',
      }),
    ).toEqual(['Operations Workspace']);
  });

  it('selects the visible Operations Workspace playbook when present', () => {
    const playbook = selectRecommendedPlaybook(
      [
        operationsWorkspacePlaybook,
        {
          id: 'pb-custom',
          name: 'Custom user template',
          is_system_preset: false,
          current_version: {
            id: 'v-custom',
            version_number: 1,
            spec_json: {},
          },
        },
      ],
      {
        documentType: 'contract',
        title: 'Anchor tenant renewal notice',
      },
    );

    expect(playbook?.name).toBe('Operations Workspace');
  });

  it('resolves classifier-ranked real-estate template ids onto Operations Workspace', () => {
    const playbook = resolveRecommendedPlaybook(
      [operationsWorkspacePlaybook],
      {
        documentType: 'financial_report',
        title: 'Portfolio receivables ledger',
        recommendedTemplateIds: ['property_operations_workspace'],
      },
    );

    expect(playbook?.name).toBe('Operations Workspace');
  });

  it('falls back to Operations Workspace when a hidden legacy template id is suggested', () => {
    const playbook = resolveRecommendedPlaybook(
      [operationsWorkspacePlaybook],
      {
        documentType: 'research',
        title: 'Legacy template metadata should not leak into the product path',
        recommendedTemplateIds: ['research_synthesis_site'],
      },
    );

    expect(playbook?.name).toBe('Operations Workspace');
  });

  it('keeps structured analysis enabled for supported document classes', () => {
    expect(supportsStructuredAnalysis('contract')).toBe(true);
    expect(supportsStructuredAnalysis('financial_report')).toBe(true);
    expect(supportsStructuredAnalysis('invoice')).toBe(true);
    expect(supportsStructuredAnalysis('paper')).toBe(true);
  });
});
