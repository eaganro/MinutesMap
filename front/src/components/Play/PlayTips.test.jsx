import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayTips from './PlayTips';

const buildChart = () => {
  const chart = document.createElement('div');
  chart.innerHTML = `
    <div class="teamSection">
      <div class="player">
        <button class="playerNameButton">Deni Avdija</button>
        <svg><line class="playerTimeline"></line></svg>
      </div>
    </div>
  `;
  document.body.appendChild(chart);
  return { current: chart };
};

const renderTips = (props = {}) => {
  const onChartClick = vi.fn();
  const handlers = { onDismiss: vi.fn(), onSkip: vi.fn() };
  render(
    <div onClick={onChartClick}>
      <PlayTips
        playRef={buildChart()}
        layoutKey="1"
        isFinePointer={false}
        {...handlers}
        {...props}
      />
    </div>,
  );
  return { onChartClick, ...handlers };
};

describe('PlayTips', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('explains the chart lines with dismiss and skip buttons that stay off the chart', () => {
    const { onChartClick, onDismiss, onSkip } = renderTips({ activeTip: 'lines' });

    expect(screen.getByText(/Each line shows when a player was on the court/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledWith('lines');

    fireEvent.click(screen.getByRole('button', { name: 'Skip tips' }));
    expect(onSkip).toHaveBeenCalled();
    expect(onChartClick).not.toHaveBeenCalled();
  });

  it('mentions hovering in the first tip only when there is a mouse', () => {
    renderTips({ activeTip: 'lines' });
    expect(screen.queryByText(/Hover over the chart/)).not.toBeInTheDocument();

    cleanup();
    const onCalloutHover = vi.fn();
    renderTips({ activeTip: 'lines', isFinePointer: true, onCalloutHover });
    expect(screen.getByText(/Hover over the chart to see each play/)).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('note'));
    expect(onCalloutHover).toHaveBeenCalled();
  });

  it('explains the chart and asks touch users to drag across it, in one tip', () => {
    const { onChartClick, onDismiss, onSkip } = renderTips({ activeTip: 'explore' });

    expect(screen.getByText(/Each line shows when a player was on the court/)).toBeInTheDocument();
    expect(screen.getByText('Drag across the chart to see each one.')).toBeInTheDocument();
    // Drags that start on the tip's text go through to the chart; only its buttons take taps.
    expect(screen.getByRole('note')).toHaveClass('isPassThrough');

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledWith('explore');
    fireEvent.click(screen.getByRole('button', { name: 'Skip tips' }));
    expect(onSkip).toHaveBeenCalled();
    expect(onChartClick).not.toHaveBeenCalled();
  });

  it('sweeps the finger only as far as the player lines reach', () => {
    const playRef = buildChart();
    const chart = playRef.current;
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 600 });
    const lineRects = [
      { left: 100, top: 40, width: 60, height: 0 },
      { left: 120, top: 70, width: 130, height: 0 },
    ];
    const section = chart.querySelector('.teamSection');
    lineRects.slice(1).forEach(() => {
      section.insertAdjacentHTML('beforeend', '<svg><line class="playerTimeline"></line></svg>');
    });
    chart.querySelectorAll('.playerTimeline').forEach((line, index) => {
      line.getBoundingClientRect = () => lineRects[index];
    });

    render(
      <PlayTips
        activeTip="explore"
        playRef={playRef}
        layoutKey="1"
        isFinePointer={false}
        onDismiss={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    const finger = document.querySelector('.playTipFinger');
    // Starts on the first line (100 + 60 / 2) and stops where the furthest line ends (250).
    expect(finger).toHaveStyle({ left: '130px', top: '40px' });
    expect(finger).toHaveClass('isSweeping');
    expect(finger.style.getPropertyValue('--play-tip-sweep')).toBe('120px');
  });

  it('keeps the finger still when the lines are too short to sweep along', () => {
    const playRef = buildChart();
    const chart = playRef.current;
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 600 });
    chart.querySelector('.playerTimeline').getBoundingClientRect = () => ({
      left: 100,
      top: 40,
      width: 30,
      height: 0,
    });

    render(
      <PlayTips
        activeTip="explore"
        playRef={playRef}
        layoutKey="1"
        isFinePointer={false}
        onDismiss={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(document.querySelector('.playTipFinger')).not.toHaveClass('isSweeping');
  });

  it('points at player names and can be dismissed', () => {
    const { onDismiss } = renderTips({ activeTip: 'player' });

    expect(screen.getByText(/Tap a player's name/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tip' }));
    expect(onDismiss).toHaveBeenCalledWith('player');
  });

  it('points at a stat that is off in the legend below the chart', () => {
    const legend = document.createElement('div');
    legend.className = 'statButtons';
    legend.innerHTML = `
      <button class="buttonGroup">Points</button>
      <button class="buttonGroup off">Rebound</button>
    `;
    document.body.appendChild(legend);
    const offChip = legend.querySelector('.off');
    offChip.getBoundingClientRect = () => ({ left: 150, top: 700, width: 80, height: 24 });

    const { onDismiss } = renderTips({ activeTip: 'stats' });

    expect(screen.getByText(/Tap these to show or hide stats/)).toBeInTheDocument();
    expect(document.querySelector('.tipRing')).toHaveStyle({ left: '147px', top: '697px' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tip' }));
    expect(onDismiss).toHaveBeenCalledWith('stats');
  });

  it('shows the stats tip once the legend appears a render later', () => {
    const playRef = buildChart();
    const props = {
      activeTip: 'stats',
      playRef,
      layoutKey: '1',
      isFinePointer: false,
      onDismiss: vi.fn(),
      onSkip: vi.fn(),
    };
    const { rerender } = render(<PlayTips {...props} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    const legend = document.createElement('div');
    legend.className = 'statButtons';
    legend.innerHTML = '<button class="buttonGroup off">Rebound</button>';
    document.body.appendChild(legend);
    rerender(<PlayTips {...props} />);

    expect(screen.getByText(/these to show or hide stats/)).toBeInTheDocument();
  });

  it('moves from one tip to the next without reusing the previous tip position', () => {
    const playRef = buildChart();
    const legend = document.createElement('div');
    legend.className = 'statButtons';
    legend.innerHTML = '<button class="buttonGroup off">Rebound</button>';
    document.body.appendChild(legend);
    const props = {
      playRef,
      layoutKey: '1',
      isFinePointer: true,
      onDismiss: vi.fn(),
      onSkip: vi.fn(),
    };

    const { rerender } = render(<PlayTips {...props} activeTip="lines" />);
    expect(screen.getByText(/Each line shows/)).toBeInTheDocument();

    rerender(<PlayTips {...props} activeTip="stats" />);
    expect(screen.getByText(/Click these to show or hide stats/)).toBeInTheDocument();
  });

  it('renders nothing when the element it points at is missing', () => {
    render(
      <PlayTips
        activeTip="lines"
        playRef={{ current: document.createElement('div') }}
        layoutKey="1"
        isFinePointer={false}
        onDismiss={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
