import { describe, expect, it } from 'vitest';
import {
  recommendedSystemPlaybookNames,
  resolveRecommendedPlaybook,
  selectRecommendedPlaybook,
  supportsStructuredAnalysis,
} from '@/lib/document-analysis';

const acquisitionWorkspacePlaybook = {
  id: 'pb-acquisition-workspace',
  name: 'Acquisition Workspace',
  is_system_preset: true,
  current_version: {
    id: 'v-acquisition-workspace',
    version_number: 1,
    spec_json: {
      template_id: 'acquisition_workspace',
      meta: {
        aliases: ['Acquisition Workspace'],
      },
    },
  },
};

describe('document analysis template recommendations', () => {
  it('always recommends Acquisition Workspace as the user-facing system template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Retail Asset lease amendment and rent roll review',
      }),
    ).toEqual(['Acquisition Workspace']);

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'invoice',
        title: 'April payment ledger export',
      }),
    ).toEqual(['Acquisition Workspace']);
  });

  it('selects the visible Acquisition Workspace playbook when present', () => {
    const playbook = selectRecommendedPlaybook(
      [
        acquisitionWorkspacePlaybook,
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

    expect(playbook?.name).toBe('Acquisition Workspace');
  });

  it('resolves classifier-ranked real-estate template ids onto Acquisition Workspace', () => {
    const playbook = resolveRecommendedPlaybook(
      [acquisitionWorkspacePlaybook],
      {
        documentType: 'financial_report',
        title: 'Portfolio receivables ledger',
        recommendedTemplateIds: ['acquisition_workspace'],
      },
    );

    expect(playbook?.name).toBe('Acquisition Workspace');
  });

  it('falls back to Acquisition Workspace when a hidden legacy template id is suggested', () => {
    const playbook = resolveRecommendedPlaybook(
      [acquisitionWorkspacePlaybook],
      {
        documentType: 'research',
        title: 'Legacy template metadata should not leak into the product path',
        recommendedTemplateIds: ['research_synthesis_site'],
      },
    );

    expect(playbook?.name).toBe('Acquisition Workspace');
  });

  it('keeps structured analysis enabled for supported document classes', () => {
    expect(supportsStructuredAnalysis('contract')).toBe(true);
    expect(supportsStructuredAnalysis('financial_report')).toBe(true);
    expect(supportsStructuredAnalysis('invoice')).toBe(true);
    expect(supportsStructuredAnalysis('paper')).toBe(true);
  });
});
