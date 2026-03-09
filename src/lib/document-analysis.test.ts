import { describe, expect, it } from 'vitest';
import { recommendedSystemPlaybookNames, selectRecommendedPlaybook, supportsStructuredAnalysis } from '@/lib/document-analysis';

describe('document analysis template recommendations', () => {
  it('prefers the renamed renewal template and still supports legacy aliases', () => {
    expect(
      recommendedSystemPlaybookNames({
        documentType: 'contract',
        title: 'Vendor Agreement Renewal Notice',
      })[0]
    ).toBe('Renewal Radar');
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

  it('marks onboarding documents as structured-analysis capable', () => {
    expect(supportsStructuredAnalysis('onboarding_doc')).toBe(true);
  });
});
