import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayPointerHandlers } from './usePlayPointerHandlers';

const mocks = vi.hoisted(() => ({
  buildNbaEventUrlMock: vi.fn(),
  resolveVideoActionMock: vi.fn(),
  trackFeatureUseOnceMock: vi.fn(),
}));

vi.mock('../../../helpers/nbaEvents', () => ({
  buildNbaEventUrl: mocks.buildNbaEventUrlMock,
  resolveVideoAction: mocks.resolveVideoActionMock,
}));

vi.mock('../../hooks/useTrackFeatureUseOnce', () => ({
  useTrackFeatureUseOnce: () => mocks.trackFeatureUseOnceMock,
}));

const buildMatchMedia = (matches = true) => ({
  matches,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
});

const createHookProps = (overrides = {}) => ({
  playRef: { current: document.createElement('div') },
  nbaGameId: '0022500001',
  displayAllActions: [
    {
      actionNumber: 55,
      description: 'Makes 3PT Jump Shot',
    },
  ],
  isDataLoading: false,
  infoLocked: false,
  descriptionArray: [],
  setInfoLocked: vi.fn(),
  setMousePosition: vi.fn(),
  updateHoverAt: vi.fn(),
  resetInteraction: vi.fn(),
  ...overrides,
});

describe('usePlayPointerHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(buildMatchMedia(true)),
    });
    window.open = vi.fn();
    mocks.buildNbaEventUrlMock.mockReturnValue('https://www.nba.com/game/0022500001');
    mocks.resolveVideoActionMock.mockImplementation((action) => action);
  });

  it('opens NBA event video when clicking an action marker on pointer devices', () => {
    const props = createHookProps();
    const marker = document.createElement('div');
    marker.dataset.actionNumber = '55';
    props.playRef.current.appendChild(marker);

    const { result } = renderHook(() => usePlayPointerHandlers(props));

    act(() => {
      result.current.handleClick({
        target: marker,
        clientX: 200,
        clientY: 120,
      });
    });

    expect(window.open).toHaveBeenCalledWith(
      'https://www.nba.com/game/0022500001',
      '_blank',
      'noopener',
    );
    expect(props.setInfoLocked).not.toHaveBeenCalled();
  });

  it('locks and unlocks tooltip info on non-action clicks', () => {
    const container = document.createElement('div');
    const setInfoLocked = vi.fn();
    const setMousePosition = vi.fn();
    const resetInteraction = vi.fn();

    const { result, rerender } = renderHook((hookProps) => usePlayPointerHandlers(hookProps), {
      initialProps: createHookProps({
        playRef: { current: container },
        infoLocked: false,
        setInfoLocked,
        setMousePosition,
        resetInteraction,
      }),
    });

    act(() => {
      result.current.handleClick({
        target: container,
        clientX: 40,
        clientY: 60,
      });
    });

    expect(setInfoLocked).toHaveBeenCalledWith(true);
    expect(setMousePosition).toHaveBeenCalledWith({ x: 40, y: 60 });

    rerender(
      createHookProps({
        playRef: { current: container },
        infoLocked: true,
        setInfoLocked,
        setMousePosition,
        resetInteraction,
      }),
    );

    act(() => {
      result.current.handleClick({
        target: container,
        clientX: 42,
        clientY: 62,
      });
    });

    expect(setInfoLocked).toHaveBeenCalledWith(false);
    expect(resetInteraction).toHaveBeenCalled();
  });

  it('unlocks and forces hover update while horizontally dragging on touch', () => {
    const container = document.createElement('div');
    const setInfoLocked = vi.fn();
    const updateHoverAt = vi.fn();
    const resetInteraction = vi.fn();

    const { result } = renderHook(() =>
      usePlayPointerHandlers(
        createHookProps({
          playRef: { current: container },
          infoLocked: true,
          setInfoLocked,
          updateHoverAt,
          resetInteraction,
        }),
      ),
    );

    act(() => {
      result.current.handleTouchStart({
        touches: [{ clientX: 10, clientY: 10 }],
      });
    });

    const preventDefault = vi.fn();
    act(() => {
      result.current.handleTouchMove({
        touches: [{ clientX: 40, clientY: 12 }],
        target: container,
        preventDefault,
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(setInfoLocked).toHaveBeenCalledWith(false);
    expect(updateHoverAt).toHaveBeenCalledWith(40, 12, container, true);
  });
});
