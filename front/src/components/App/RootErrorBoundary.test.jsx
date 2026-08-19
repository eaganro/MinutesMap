import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RootErrorBoundary from './RootErrorBoundary';

const mocks = vi.hoisted(() => ({
  reportErrorMock: vi.fn(),
}));

vi.mock('../../errors/reportError', () => ({
  reportError: mocks.reportErrorMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('RootErrorBoundary', () => {
  it('shows a recovery screen, reports the render error, and retries its children', () => {
    let shouldThrow = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function FlakyChild() {
      if (shouldThrow) {
        throw new Error('render failed');
      }
      return <div>Application recovered</div>;
    }

    render(
      <RootErrorBoundary>
        <FlakyChild />
      </RootErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('MinutesMap hit an unexpected error');
    expect(mocks.reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render failed' }),
      expect.objectContaining({ boundary: 'root-render' }),
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Application recovered')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
  });
});
