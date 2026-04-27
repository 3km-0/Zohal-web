import { describe, expect, it } from 'vitest';
import {
  cleanListingTitle,
  displayTitleForOpportunity,
  photoRefsForOpportunity,
  progressStepIndexForStage,
  seedScenarioFromOpportunity,
} from './acquisition-workspace-ui';

describe('acquisition-workspace-ui', () => {
  it('prefers structured display titles over noisy listing titles', () => {
    expect(displayTitleForOpportunity({
      title: 'للبيع فيلا فاخرة جدا جدا جدا مع تفاصيل طويلة https://example.com/listing',
      metadata_json: { property_type: 'Villa', district: 'Al Narjis', city: 'Riyadh' },
    })).toBe('Villa in Al Narjis, Riyadh');

    expect(cleanListingTitle('For sale | Aqar | North Riyadh villa with a very very very long broker headline that should not destroy the cockpit layout')).toMatch(/\.\.\.$/);
  });

  it('filters photo refs to safe http images only', () => {
    expect(photoRefsForOpportunity({
      metadata_json: {
        photo_refs: [
          'https://example.com/a.jpg',
          'https://example.com/a.jpg',
          'http://example.com/b.webp',
          'javascript:alert(1)',
          'https://example.com/icon.svg',
        ],
      },
    })).toEqual(['https://example.com/a.jpg', 'http://example.com/b.webp']);
  });

  it('maps stages to the acquisition progress tracker', () => {
    expect(progressStepIndexForStage('submitted')).toBe(1);
    expect(progressStepIndexForStage('workspace_created')).toBe(2);
    expect(progressStepIndexForStage('visit_requested')).toBe(3);
    expect(progressStepIndexForStage('formal_diligence')).toBe(4);
    expect(progressStepIndexForStage('offer_submitted')).toBe(5);
    expect(progressStepIndexForStage('closed')).toBe(6);
  });

  it('seeds assumptions from listing facts with usable defaults', () => {
    expect(seedScenarioFromOpportunity({
      metadata_json: { asking_price: 2_000_000, monthly_rent: 9000 },
    })).toMatchObject({ price: 2_000_000, rent: 9000, vacancy: 7, hold: 5 });
  });
});
