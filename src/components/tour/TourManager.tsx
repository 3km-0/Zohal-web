'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getTourSteps, getTourVersion, type TourId, type TourStep } from './tours';

type StartTourDetail = { tourId: TourId; force?: boolean };

function seenKey(tourId: TourId) {
  return `zohal.tour.${tourId}.${getTourVersion(tourId)}.seen`;
}

function hasSeen(tourId: TourId) {
  try {
    return window.localStorage.getItem(seenKey(tourId)) === '1';
  } catch {
    return false;
  }
}

function markSeen(tourId: TourId) {
  try {
    window.localStorage.setItem(seenKey(tourId), '1');
  } catch {
    // ignore
  }
}

function filterExistingSteps(steps: TourStep[]) {
  return steps.filter((s) => {
    try {
      return !!document.querySelector(s.element);
    } catch {
      return false;
    }
  });
}

export function TourManager() {
  const activeRef = useRef<any>(null);
  const startLockRef = useRef(false);

  const startTour = useCallback(async (tourId: TourId, opts?: { force?: boolean }) => {
    if (startLockRef.current) return;
    startLockRef.current = true;

    try {
      if (!opts?.force && hasSeen(tourId)) return;

      // Ensure any existing tour is closed first.
      try {
        activeRef.current?.destroy?.();
      } catch {
        // ignore
      } finally {
        activeRef.current = null;
      }

      // Allow the UI to settle (elements mount after route transitions).
      await new Promise((r) => window.setTimeout(r, 350));

      const steps = filterExistingSteps(getTourSteps(tourId));
      if (steps.length === 0) return;

      const { driver } = await import('driver.js');

      const d = driver({
        showProgress: true,
        allowClose: true,
        animate: true,
        stagePadding: 8,
        stageRadius: 12,
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        steps: steps.map((s) => ({
          element: s.element,
          popover: {
            title: s.popover.title,
            description: s.popover.description,
            side: s.popover.side,
            align: s.popover.align,
          },
        })),
        onDestroyed: () => {
          markSeen(tourId);
          activeRef.current = null;
        },
      });

      activeRef.current = d;
      d.drive();
    } finally {
      startLockRef.current = false;
    }
  }, []);

  // Manual starts from buttons (no wiring/callback props needed).
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<StartTourDetail>;
      const tourId = ce?.detail?.tourId;
      if (!tourId) return;
      void startTour(tourId, { force: ce.detail.force });
    };
    window.addEventListener('zohal:start-tour', handler);
    return () => window.removeEventListener('zohal:start-tour', handler);
  }, [startTour]);

  // Auto-run: first time user opens a workspace, show the core tour.
  useEffect(() => {
    const pathname = window.location.pathname;
    const isWorkspaceDetail = /^\/workspaces\/[^/]+$/.test(pathname);
    if (!isWorkspaceDetail) return;
    if (hasSeen('workspace')) return;
    void startTour('workspace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

