import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { canManageWorkspace, getWorkspaceFilterChips } from './workspace-logic';

function WorkspaceSummary({
  names,
  accessRole,
}: {
  names: string[];
  accessRole?: string;
}) {
  const chips = getWorkspaceFilterChips(
    names.map((name, idx) => ({ id: `${idx}`, name } as any)),
    3
  );
  const canManage = canManageWorkspace(accessRole);

  return (
    <div>
      <p data-testid="chips">{chips.map((c: any) => c.name).join(',')}</p>
      <p data-testid="manage">{canManage ? 'manage' : 'readonly'}</p>
    </div>
  );
}

describe('workspace logic RTL integration', () => {
  it('renders filtered workspace chips and permission state', () => {
    render(
      <WorkspaceSummary
        names={['Alpha', 'Beta', 'Gamma', 'Delta']}
        accessRole="editor"
      />
    );

    expect(screen.getByTestId('chips')).toHaveTextContent('Alpha,Beta,Gamma');
    expect(screen.getByTestId('manage')).toHaveTextContent('readonly');
  });
});
