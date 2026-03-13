import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  ScholarActionMenu: () => <div data-testid="action-menu" />,
  ScholarTabs: () => <div data-testid="tabs" />,
}));

vi.mock('@/components/ai/AIPanel', () => ({
  AIPanel: () => <div data-testid="ai-panel" />,
}));

vi.mock('@/components/analysis/ContractAnalysisPane', () => ({
  ContractAnalysisPane: () => <div data-testid="analysis-pane" />,
}));

import { DocumentRightPane } from './DocumentRightPane';

describe('DocumentRightPane sizing behavior', () => {
  it('stores desktop pane width in a CSS variable instead of inline width', () => {
    const { container } = render(
      <DocumentRightPane
        documentId="doc-1"
        workspaceId="ws-1"
        selectedText=""
        currentPage={1}
        mode="chat"
        onModeChange={() => {}}
        onClose={() => {}}
        width={512}
      />
    );

    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside).toHaveStyle('--zohal-pane-width: 512px');
    expect((aside as HTMLElement).style.width).toBe('');
    expect((aside as HTMLElement).className).toContain('md:w-[var(--zohal-pane-width)]');
  });
});
