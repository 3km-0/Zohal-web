export type MarketingEventName =
  | 'cta_start_free_click'
  | 'cta_watch_demo_click'
  | 'pricing_toggle_change'
  | 'pricing_plan_click'
  | 'tab_change'
  | 'application_card_click'
  | 'faq_open'
  | 'contact_click';

type EventProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Lightweight client-side event helper.
 *
 * - Uses `posthog.capture` if available
 * - Else uses `gtag('event', ...)` if available
 * - Else pushes into `dataLayer` if available
 * - Else logs in dev only
 */
export function trackMarketingEvent(name: MarketingEventName, props?: EventProps) {
  if (typeof window === 'undefined') return;

  try {
    const anyWindow = window as unknown as {
      posthog?: { capture: (event: string, properties?: EventProps) => void };
      gtag?: (command: string, event: string, params?: Record<string, unknown>) => void;
      dataLayer?: Array<Record<string, unknown>>;
    };

    if (anyWindow.posthog?.capture) {
      anyWindow.posthog.capture(name, props);
      return;
    }

    if (anyWindow.gtag) {
      anyWindow.gtag('event', name, props ?? {});
      return;
    }

    if (Array.isArray(anyWindow.dataLayer)) {
      anyWindow.dataLayer.push({ event: name, ...(props ?? {}) });
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[marketing event]', name, props ?? {});
    }
  } catch {
    // Never break UI due to analytics.
  }
}

