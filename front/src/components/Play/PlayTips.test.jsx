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
        leftMargin={96}
        timelineWidth={240}
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

  it('asks touch users to drag across the chart', () => {
    renderTips({ activeTip: 'explore' });
    expect(screen.getByText('Drag across the chart to see every play')).toBeInTheDocument();
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
      leftMargin: 96,
      timelineWidth: 240,
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
      leftMargin: 96,
      timelineWidth: 240,
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
        leftMargin={96}
        timelineWidth={240}
        layoutKey="1"
        isFinePointer={false}
        onDismiss={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
