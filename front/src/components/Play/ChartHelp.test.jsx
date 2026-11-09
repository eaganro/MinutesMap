import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChartHelp from './ChartHelp';

const mockPointer = (isFinePointer) => {
  window.matchMedia = vi.fn((query) => ({
    matches: query.includes('pointer: fine') ? isFinePointer : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

describe('ChartHelp', () => {
  let capture;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    capture = vi.fn();
    window.posthog = { capture };
    mockPointer(false);
  });

  afterEach(() => {
    cleanup();
    delete window.posthog;
    window.matchMedia = originalMatchMedia;
  });

  it('stays closed until asked for, then explains the chart for touch screens', () => {
    render(<ChartHelp sectionWidth={360} />);
    const toggle = screen.getByRole('button', { name: 'How to read this chart' });
    const panel = document.getElementById(toggle.getAttribute('aria-controls'));

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toBeVisible();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();
    expect(screen.getByText('Drag')).toBeInTheDocument();
    expect(screen.getByText('Tap a name')).toBeInTheDocument();
    expect(screen.getByText('Game, Q1, Q2…')).toBeInTheDocument();
    expect(screen.queryByText('Hover')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(panel).not.toBeVisible();
  });

  it('talks about hovering, and leaves out quarters and names, on a wide chart with a mouse', () => {
    mockPointer(true);
    render(<ChartHelp sectionWidth={1000} />);
    fireEvent.click(screen.getByRole('button', { name: 'How to read this chart' }));

    expect(screen.getByText('Hover')).toBeInTheDocument();
    expect(screen.queryByText('Drag')).not.toBeInTheDocument();
    expect(screen.queryByText(/a name/)).not.toBeInTheDocument();
    expect(screen.queryByText('Game, Q1, Q2…')).not.toBeInTheDocument();
  });

  it('records the first opening only', () => {
    render(<ChartHelp sectionWidth={360} />);
    const toggle = screen.getByRole('button', { name: 'How to read this chart' });

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('feature-use', { feature: 'chart-help' });
  });
});
