import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
      stats: { min: '28:00', pts: 30, oreb: 1, dreb: 3, ast: 6, pm: -4 },
    },
    {
      first: 'Kelly',
      last: 'Oubre',
      stats: { min: '00:20', pts: 0, pm: 2 },
    },
  ],
};

function BoxscoreTableHarness({ isCompact = false }) {
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
    isCompact,
    '#123456',
    sortConfig,
    handleSort,
  );
}

afterEach(cleanup);

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
    ).toEqual(['Joel Embiid', 'Tyrese Maxey', 'Kelly Oubre', 'TEAM']);

    fireEvent.click(within(table).getByRole('button', { name: /PTS.*Sort descending/i }));

    expect(headers[1]).toHaveAttribute('aria-sort', 'none');
    expect(headers[2]).toHaveAttribute('aria-sort', 'descending');
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Tyrese Maxey', 'Joel Embiid', 'Kelly Oubre', 'TEAM']);
  });
});

describe('processTeamStats on phones', () => {
  it('puts +/- with the main stats, drops the % columns and shortens the shooting headings', () => {
    render(<BoxscoreTableHarness isCompact />);

    const table = screen.getByRole('table', { name: 'Philadelphia 76ers box score' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'PLAYER',
      'MIN',
      'PTS',
      'REB',
      'AST',
      '+/-',
      'FG',
      '3P',
      'FT',
      'STL',
      'BLK',
      'TO',
      'PF',
      'OREB',
      'DREB',
    ]);
  });

  it('shows whole minutes and colours +/-', () => {
    render(<BoxscoreTableHarness isCompact />);

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const cells = (name) =>
      within(rows.find((row) => row.textContent.startsWith(name))).getAllByRole('cell');

    expect(cells('J. Embiid')[0]).toHaveTextContent(/^30$/);
    expect(cells('K. Oubre')[0]).toHaveTextContent(/^<1$/);
    expect(cells('T. Maxey')[4]).toHaveTextContent('-4');
    expect(cells('T. Maxey')[4]).toHaveClass('isNegative');
    expect(cells('K. Oubre')[4]).toHaveClass('isPositive');
    expect(cells('J. Embiid')[4]).not.toHaveClass('isPositive');
  });
});
