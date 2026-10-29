import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLoadedImage } from './useLoadedImage';

function Logo({ src }) {
  const { isLoaded, imgProps } = useLoadedImage(src);
  return <img {...imgProps} alt="" data-testid="logo" data-loaded={String(isLoaded)} />;
}

describe('useLoadedImage', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is loaded once the image loads, and not again for a new URL until that one loads', () => {
    const { rerender } = render(<Logo src="/img/teams/SAS.svg" />);
    const img = screen.getByTestId('logo');
    expect(img).toHaveAttribute('data-loaded', 'false');

    fireEvent.load(img);
    expect(img).toHaveAttribute('data-loaded', 'true');

    rerender(<Logo src="/img/teams/SAS.svg" />);
    expect(img).toHaveAttribute('data-loaded', 'true');

    rerender(<Logo src="/img/teams/UTA.svg" />);
    expect(img).toHaveAttribute('data-loaded', 'false');
  });

  it('retries a failed image a couple of times, then gives up', () => {
    vi.useFakeTimers();
    render(<Logo src="/img/teams/SAS.svg" />);
    const img = screen.getByTestId('logo');

    fireEvent.error(img);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(img).toHaveAttribute('src', '/img/teams/SAS.svg?retry=1');

    fireEvent.error(img);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(img).toHaveAttribute('src', '/img/teams/SAS.svg?retry=2');

    fireEvent.error(img);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(img).toHaveAttribute('src', '/img/teams/SAS.svg?retry=2');

    fireEvent.load(img);
    expect(img).toHaveAttribute('data-loaded', 'true');
  });
});
