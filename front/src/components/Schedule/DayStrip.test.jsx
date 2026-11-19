import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DayStrip from './DayStrip';

afterEach(cleanup);

const dayLabels = () =>
  within(screen.getByRole('group', { name: 'Day' }))
    .getAllByRole('button')
    .map((day) => day.getAttribute('aria-label').replace(/, 20\d\d$/, ''));

describe('DayStrip', () => {
  it('re-centres on the new day, two days either side, across a month end', () => {
    const { rerender } = render(<DayStrip date="2026-11-29" onShift={vi.fn()} />);
    expect(dayLabels()).toEqual([
      'Fri, Nov 27',
      'Sat, Nov 28',
      'Sun, Nov 29',
      'Mon, Nov 30',
      'Tue, Dec 1',
    ]);

    rerender(<DayStrip date="2026-11-30" onShift={vi.fn()} />);
    expect(dayLabels()).toEqual([
      'Sat, Nov 28',
      'Sun, Nov 29',
      'Mon, Nov 30',
      'Tue, Dec 1',
      'Wed, Dec 2',
    ]);
    expect(screen.getByRole('button', { name: /^Mon, Nov 30/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shifts by how far the tapped day is from the picked one', () => {
    const onShift = vi.fn();
    render(<DayStrip date="2026-11-18" onShift={onShift} />);

    fireEvent.click(screen.getByRole('button', { name: /^Mon, Nov 16/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Thu, Nov 19/ }));

    expect(onShift.mock.calls).toEqual([[-2], [1]]);
  });
});
