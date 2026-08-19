import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    cleanup();
  });

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

  it('exposes score-date navigation as a named native button', () => {
    const changeDate = vi.fn();
    render(<Score {...buildProps({ changeDate })} />);
    const dateButton = screen.getByRole('button', { name: /Show schedule for/ });

    expect(dateButton.tagName).toBe('BUTTON');
    dateButton.focus();
    fireEvent.click(dateButton, { detail: 0 });

    expect(dateButton).toHaveFocus();
    expect(changeDate).toHaveBeenCalledWith('2026-02-03');
  });

  it('disables score-date navigation while score data is loading', () => {
    const { rerender } = render(<Score {...buildProps()} />);

    rerender(<Score {...buildProps({ isLoading: true })} />);

    expect(screen.getByRole('button', { name: /Show schedule for/ })).toBeDisabled();
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

  it('does not show the live indicator for TBD games', () => {
    render(<Score {...buildProps({ gameStatus: 'TBD' })} />);

    expect(screen.queryByLabelText('Live game')).not.toBeInTheDocument();
  });
});
