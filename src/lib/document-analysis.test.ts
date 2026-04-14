import { describe, expect, it } from 'vitest';
import {
  recommendedSystemPlaybookNames,
  resolveRecommendedPlaybook,
  selectRecommendedPlaybook,
  supportsStructuredAnalysis,
} from '@/lib/document-analysis';

const assetRadarPlaybook = {
  id: 'pb-asset-radar',
  name: 'Real Estate Portfolio Tracker',
  is_system_preset: true,
  current_version: {
    id: 'v-asset-radar',
    version_number: 1,
    spec_json: {
      template_id: 'real_estate_portfolio_tracker',
      meta: {
        aliases: ['Asset Radar'],
      },
    },
  },
};

describe('document analysis template recommendations', () => {
  it('always recommends Asset Radar as the user-facing system template', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Retail Asset lease amendment and rent roll review',
      }),
    ).toEqual(['Real Estate Portfolio Tracker']);

    expect(
      recommendedSystemPlaybookNames({
        documentType: 'invoice',
        title: 'April payment ledger export',
      }),
    ).toEqual(['Real Estate Portfolio Tracker']);
  });

  it('selects the visible Asset Radar playbook when present', () => {
    const playbook = selectRecommendedPlaybook(
      [
        assetRadarPlaybook,
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

    expect(playbook?.name).toBe('Real Estate Portfolio Tracker');
  });

  it('resolves classifier-ranked real-estate template ids onto Asset Radar', () => {
    const playbook = resolveRecommendedPlaybook(
      [assetRadarPlaybook],
      {
        documentType: 'financial_report',
        title: 'Portfolio receivables ledger',
        recommendedTemplateIds: ['real_estate_portfolio_tracker'],
      },
    );

    expect(playbook?.name).toBe('Real Estate Portfolio Tracker');
  });

  it('falls back to Asset Radar when a hidden legacy template id is suggested', () => {
    const playbook = resolveRecommendedPlaybook(
      [assetRadarPlaybook],
      {
        documentType: 'research',
        title: 'Legacy template metadata should not leak into the product path',
        recommendedTemplateIds: ['research_synthesis_site'],
      },
    );

    expect(playbook?.name).toBe('Real Estate Portfolio Tracker');
  });

  it('keeps structured analysis enabled for supported document classes', () => {
    expect(supportsStructuredAnalysis('contract')).toBe(true);
    expect(supportsStructuredAnalysis('financial_report')).toBe(true);
    expect(supportsStructuredAnalysis('invoice')).toBe(true);
    expect(supportsStructuredAnalysis('paper')).toBe(true);
  });
});
