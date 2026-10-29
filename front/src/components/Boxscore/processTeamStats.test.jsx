import { useRef, useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import processTeamStats from './processTeamStats';

const TEAM = {
  abbr: 'PHI',
  name: 'Philadelphia 76ers',
  players: [
    {
      first: 'Joel',
      last: 'Embiid',
      stats: { min: '30:00', pts: 24, oreb: 2, dreb: 8, ast: 4 },
    },
    {
      first: 'Tyrese',
      last: 'Maxey',
      stats: { min: '28:00', pts: 30, oreb: 1, dreb: 3, ast: 6 },
    },
  ],
};

function BoxscoreTableHarness() {
  const tableRef = useRef(null);
  const [sortConfig, setSortConfig] = useState({ key: 'min', direction: 'desc' });
  const handleSort = (key) => {
    setSortConfig((previous) => ({
      key,
      direction: previous.key === key && previous.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  return processTeamStats(
    TEAM,
    false,
    true,
    () => {},
    tableRef,
    () => {},
    false,
    '#123456',
    sortConfig,
    handleSort,
  );
}

describe('processTeamStats accessibility', () => {
  it('associates table rows with headers and announces sorting', () => {
    render(<BoxscoreTableHarness />);

    const table = screen.getByRole('table', { name: 'Philadelphia 76ers box score' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(18);
    expect(headers[1]).toHaveAttribute('aria-sort', 'descending');
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Joel Embiid', 'Tyrese Maxey', 'TEAM']);

    fireEvent.click(within(table).getByRole('button', { name: /PTS.*Sort descending/i }));

    expect(headers[1]).toHaveAttribute('aria-sort', 'none');
    expect(headers[2]).toHaveAttribute('aria-sort', 'descending');
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Tyrese Maxey', 'Joel Embiid', 'TEAM']);
  });
});
