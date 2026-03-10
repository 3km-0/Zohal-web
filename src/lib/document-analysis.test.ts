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
});
