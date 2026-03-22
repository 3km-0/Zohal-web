import { describe, expect, it } from 'vitest';

import {
  automationStatusVariant,
  normalizeAutomationActivity,
  summarizeAutomationRun,
} from './automations';

describe('automations helpers', () => {
  it('maps statuses to badge variants', () => {
    expect(automationStatusVariant('queued')).toBe('warning');
    expect(automationStatusVariant('running')).toBe('warning');
    expect(automationStatusVariant('succeeded')).toBe('success');
    expect(automationStatusVariant('failed')).toBe('error');
    expect(automationStatusVariant('skipped')).toBe('default');
  });

  it('summarizes skip reasons with localized labels', () => {
    expect(
      summarizeAutomationRun(
        { status: 'skipped', skip_reason: 'unchanged_sources' },
        { unchanged: 'Skipped unchanged' }
      )
    ).toBe('Skipped unchanged');

    expect(
      summarizeAutomationRun(
        { status: 'skipped', skip_reason: 'analysis_already_in_progress' },
        { inProgress: 'Skipped in progress' }
      )
    ).toBe('Skipped in progress');
  });

  it('prefers action output then activity lines', () => {
    const lines = normalizeAutomationActivity({
      status: 'running',
      updated_at: '2026-03-22T10:00:00.000Z',
      action: {
        updated_at: '2026-03-22T10:01:00.000Z',
        output_json: {
          message: 'Reducing batch results…',
        },
      },
      activity_json: [
        {
          at: '2026-03-22T10:02:00.000Z',
          message: 'Canonical snapshot completed.',
        },
      ],
    });

    expect(lines).toEqual([
      {
        at: '2026-03-22T10:01:00.000Z',
        message: 'Reducing batch results…',
      },
      {
        at: '2026-03-22T10:02:00.000Z',
        message: 'Canonical snapshot completed.',
      },
    ]);
  });
});
