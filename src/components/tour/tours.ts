export type TourId = 'workspace' | 'viewer' | 'contract-analysis';

export type TourStep = {
  element: string;
  popover: {
    title: string;
    description: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
  };
};

export function getTourVersion(tourId: TourId) {
  // Bump per-tour if we change step meaning or selectors.
  switch (tourId) {
    case 'workspace':
      return 'v1';
    case 'viewer':
      return 'v1';
    case 'contract-analysis':
      return 'v1';
  }
}

export function getTourSteps(tourId: TourId): TourStep[] {
  switch (tourId) {
    case 'workspace':
      return [
        {
          element: '[data-tour="workspace-upload"]',
          popover: {
            title: 'Upload a document',
            description:
              'Start by uploading a PDF (or importing from Drive/OneDrive). Zohal indexes it in the background so search, evidence links, and analysis can work.',
            side: 'bottom',
            align: 'end',
          },
        },
        {
          element: '[data-tour="workspace-document-card"]',
          popover: {
            title: 'Open a document',
            description:
              'Click any document card to open the PDF viewer. From there you can select text, ask questions, and (for contracts) run evidence-grade analysis.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="global-search"]',
          popover: {
            title: 'Search across your workspace',
            description:
              'Use Search to find what you need across documents and analysis outputs without hunting through folders.',
            side: 'bottom',
            align: 'end',
          },
        },
      ];

    case 'viewer':
      return [
        {
          element: '[data-tour="viewer-pdf"]',
          popover: {
            title: 'Select text in the PDF',
            description:
              'Highlight any passage to bring it into the AI panel. This is the fastest “circle → explain” equivalent on web.',
            side: 'right',
            align: 'center',
          },
        },
        {
          element: '[data-tour="viewer-ai-tools"]',
          popover: {
            title: 'Use AI Tools (Chat + Notes)',
            description:
              'Open AI Tools to ask questions, get explanations, and star helpful answers to save them into Notes.',
            side: 'bottom',
            align: 'end',
          },
        },
        {
          element: '[data-tour="viewer-contract-analysis"]',
          popover: {
            title: 'Run Contract Analysis (Tap-to-Proof)',
            description:
              'For contracts, Contract Analysis extracts variables, obligations, and risks with evidence links you can jump back to in the PDF.',
            side: 'bottom',
            align: 'end',
          },
        },
      ];

    case 'contract-analysis':
      return [
        {
          element: '[data-tour="contract-analyze"]',
          popover: {
            title: 'Analyze the contract',
            description:
              'Run evidence-grade analysis to produce a snapshot (variables, clauses, obligations, risks) with proof links back to the source.',
            side: 'bottom',
            align: 'end',
          },
        },
        {
          element: '[data-tour="contract-tabs"]',
          popover: {
            title: 'Navigate the results',
            description:
              'Use tabs to review Variables, Obligations/Deadlines, Clauses, and Risks. “Source” links jump to the exact page (and bbox when available).',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="contract-actions"]',
          popover: {
            title: 'Ship outputs',
            description:
              'Use Actions to export an obligations calendar (.ics) and generate a Decision Pack report you can share.',
            side: 'bottom',
            align: 'end',
          },
        },
      ];
  }
}

