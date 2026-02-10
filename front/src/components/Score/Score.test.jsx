import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Score from './Score';

const buildProps = (overrides = {}) => ({
  homeTeam: 'GSW',
  awayTeam: 'PHI',
  score: { away: 87, home: 81 },
  date: '2026-02-03',
  changeDate: vi.fn(),
  isLoading: false,
  lastAction: { period: 2, clock: 'PT08M00.00S' },
  gameStatus: 'Q2 08:00',
  ...overrides,
});

describe('Score', () => {
  it('keeps stable score/date content while loading refreshes in the background', () => {
    const props = buildProps();
    const { rerender } = render(<Score {...props} />);

    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('81')).toBeInTheDocument();

    rerender(
      <Score
        {...buildProps({
          score: { away: 99, home: 101 },
          date: '2026-02-04',
          isLoading: true,
        })}
      />,
    );

    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('81')).toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('changes date using value-based API when clicking the score date', () => {
    const changeDate = vi.fn();
    const { container } = render(<Score {...buildProps({ changeDate })} />);
    const dateNode = container.querySelector('.gameDate');

    fireEvent.click(dateNode);

    expect(changeDate).toHaveBeenCalledWith('2026-02-03');
  });

  it('shows loading indicator when no prior display data is available', () => {
    render(
      <Score
        {...buildProps({
          homeTeam: '',
          awayTeam: '',
          score: null,
          date: '',
          gameStatus: '',
          isLoading: true,
        })}
      />,
    );

    expect(screen.getByText('Loading game...')).toBeInTheDocument();
  });
});
