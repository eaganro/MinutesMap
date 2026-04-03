import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlayTooltip from './PlayTooltip';

const buildContainerRef = () => {
  const chart = document.createElement('div');
  chart.getBoundingClientRect = () => ({
    left: 96,
    top: 10,
    right: 596,
    bottom: 610,
    width: 500,
    height: 600,
  });

  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 640,
    bottom: 760,
    width: 640,
    height: 760,
  });
  container.querySelector = (selector) => (selector === '.playGrid' ? chart : null);

  return { current: container };
};

describe('PlayTooltip', () => {
  it('shows win odds in the header when they are available', () => {
    render(
      <PlayTooltip
        descriptionArray={[
          {
            actionNumber: 11,
            period: 1,
            clock: 'PT11M00.00S',
            actionType: '2pt',
            description: 'Away Guard makes driving layup',
            result: 'm',
            scoreAway: 2,
            scoreHome: 0,
            side: 'away',
          },
        ]}
        focusActionMeta={{ actionNumber: 11, awayWinProb: 0.585 }}
        mousePosition={{ x: 220, y: 120 }}
        infoLocked={false}
        isHoveringIcon={false}
        nbaGameId="0022500001"
        allActions={[]}
        hasPrevAction={false}
        hasNextAction={false}
        onNavigate={undefined}
        containerRef={buildContainerRef()}
        awayTeamNames={{ name: 'Philadelphia 76ers', abr: 'PHI' }}
        homeTeamNames={{ name: 'Golden State Warriors', abr: 'GSW' }}
        teamColors={{ away: '#1d428a', home: '#ffc72c' }}
        leftMargin={96}
      />,
    );

    const oddsLabel = screen.getByText('Win Odds');

    expect(oddsLabel).toBeInTheDocument();
    expect(oddsLabel.closest('.tooltipOddsRow')).toHaveTextContent(/PHI\s*58\.5%\s*GSW\s*41\.5%/);
  });
});
