import { describe, expect, it } from 'vitest';
import {
  acquisitionMissingItems,
  cleanListingTitle,
  displayTitleForOpportunity,
  photoRefsForOpportunity,
  progressStepIndexForStage,
  resolvePrimaryAcquisitionAction,
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

  it('normalizes missing item payloads for action resolution', () => {
    expect(acquisitionMissingItems(['title deed', 'broker docs'])).toEqual(['title deed', 'broker docs']);
    expect(acquisitionMissingItems({ title_deed: true, broker_docs: 'Broker docs' })).toEqual(['title_deed', 'Broker docs']);
  });

  it('resolves exactly one primary concrete action for the current stage', () => {
    expect(resolvePrimaryAcquisitionAction({ opportunity: null }).action_id).toBe('add_listing_evidence');

    const readiness = resolvePrimaryAcquisitionAction({
      opportunity: { id: 'opp_1', stage: 'pursue', missing_info_json: [] },
      hasReadinessProfile: false,
    });
    expect(readiness.action_id).toBe('upload_financing_document');

    const docs = resolvePrimaryAcquisitionAction({
      opportunity: { id: 'opp_1', stage: 'needs_info', missing_info_json: ['title deed'] },
      hasReadinessProfile: true,
    });
    expect(docs.action_id).toBe('request_missing_documents');

    const visit = resolvePrimaryAcquisitionAction({
      opportunity: { id: 'opp_1', stage: 'watch', missing_info_json: [] },
      hasReadinessProfile: true,
      brokerageActive: true,
      activeFinancingConsentCount: 1,
    });
    expect(visit.action_id).toBe('schedule_visit');
  });
});
