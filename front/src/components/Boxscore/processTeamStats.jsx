import { UnfoldMore, UnfoldLess } from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
const COMPACT_LAST_NAME_MAX = 12;
const COMPACT_LAST_NAME_KEEP = 10;
const DEFAULT_COLUMN_ORDER = [
  'player',
  'min',
  'pts',
  'fgm-a',
  'fg%',
  '3pm-a',
  '3p%',
  'ftm-a',
  'ft%',
  'reb',
  'oreb',
  'dreb',
  'ast',
  'stl',
  'blk',
  'to',
  'pf',
  'pm',
];
const COMPACT_COLUMN_ORDER = [
  'player',
  'min',
  'pts',
  'reb',
  'ast',
  'fgm-a',
  'fg%',
  '3pm-a',
  '3p%',
  'ftm-a',
  'ft%',
  'oreb',
  'dreb',
  'stl',
  'blk',
  'to',
  'pf',
  'pm',
];
const COLUMN_LABELS = {
  player: 'PLAYER',
  min: 'MIN',
  pts: 'PTS',
  'fgm-a': 'FGM-A',
  'fg%': 'FG%',
  '3pm-a': '3PM-A',
  '3p%': '3P%',
  'ftm-a': 'FTM-A',
  'ft%': 'FT%',
  reb: 'REB',
  oreb: 'OREB',
  dreb: 'DREB',
  ast: 'AST',
  stl: 'STL',
  blk: 'BLK',
  to: 'TO',
  pf: 'PF',
  pm: '+/-',
};
const HIGHLIGHT_COLUMNS = new Set(['pts', 'reb', 'ast']);

export default function(team, showButton, showMore, setShowMore, tableWrapperRef, onScroll, isCompact, teamColor) {
  const getDisplayName = (player) => {
    const firstName = (player.firstName || '').trim();
    const familyName = (player.familyName || '').trim();
    if (!isCompact) {
      return [firstName, familyName].filter(Boolean).join(' ');
    }
    const firstInitial = firstName ? `${firstName.charAt(0)}.` : '';
    let compactLast = familyName;
    if (familyName.length > COMPACT_LAST_NAME_MAX) {
      compactLast = `${familyName.slice(0, COMPACT_LAST_NAME_KEEP)}.`;
    }
    return [firstInitial, compactLast].filter(Boolean).join(' ');
  };
  
  const getCellClassName = (key) => {
    const classes = [];
    if (key === 'player') {
      classes.push('playerNameCol');
    }
    if (HIGHLIGHT_COLUMNS.has(key)) {
      classes.push('highlight-col');
    }
    return classes.join(' ');
  };

  const formatPercentage = (value) => {
    if (value === 1) {
      return 100;
    }
    return (Math.round(value * 100 * 10) / 10).toFixed(1);
  };

  if (!team) return ''
  const teamTotals = { fieldGoalsMade: 0, fieldGoalsAttempted: 0, threePointersMade: 0, threePointersAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0, reboundsOffensive: 0, reboundsDefensive: 0, reboundsTotal: 0,
    assists: 0, steals: 0, blocks: 0, turnovers: 0, foulsPersonal: 0, points: 0, plusMinusPoints:0 };

  const columnOrder = isCompact ? COMPACT_COLUMN_ORDER : DEFAULT_COLUMN_ORDER;

  let playerRows = team.players.filter(p => {
    let minutes = p.statistics.minutes;
    if (!minutes) return false;
    if (minutes.includes('PT')) {
      minutes = minutes.slice(2, -4).replace('M', ':');
    }
    return minutes !== '00:00';
  }).sort((a,b) => {
    let minutesA = a.statistics.minutes;
    if (minutesA.includes('PT')) {
      minutesA = minutesA.slice(2, -4).replace('M', ':');
    }
    let minutesB = b.statistics.minutes;
    if (minutesB.includes('PT')) {
      minutesB = minutesB.slice(2, -4).replace('M', ':');
    }
    let [amin, asec] = minutesA.split(':');
    let [bmin, bsec] = minutesB.split(':');
    return (bmin * 100 + bsec) - (amin * 100 + asec);
  }).map((p, i) => {
    Object.keys(teamTotals).forEach(k => {
      teamTotals[k] += p.statistics[k];
    });
    let minutes = p.statistics.minutes;
    if (minutes.includes('PT')) {
      minutes = minutes.slice(2, -4).replace('M', ':');
    }
    const getPlayerValue = (key) => {
      switch (key) {
      case 'player':
        return getDisplayName(p);
      case 'min':
        return minutes;
      case 'pts':
        return p.statistics.points;
      case 'fgm-a':
        return `${p.statistics.fieldGoalsMade}-${p.statistics.fieldGoalsAttempted}`;
      case 'fg%':
        return formatPercentage(p.statistics.fieldGoalsPercentage);
      case '3pm-a':
        return `${p.statistics.threePointersMade}-${p.statistics.threePointersAttempted}`;
      case '3p%':
        return formatPercentage(p.statistics.threePointersPercentage);
      case 'ftm-a':
        return `${p.statistics.freeThrowsMade}-${p.statistics.freeThrowsAttempted}`;
      case 'ft%':
        return formatPercentage(p.statistics.freeThrowsPercentage);
      case 'reb':
        return p.statistics.reboundsTotal;
      case 'oreb':
        return p.statistics.reboundsOffensive;
      case 'dreb':
        return p.statistics.reboundsDefensive;
      case 'ast':
        return p.statistics.assists;
      case 'stl':
        return p.statistics.steals;
      case 'blk':
        return p.statistics.blocks;
      case 'to':
        return p.statistics.turnovers;
      case 'pf':
        return p.statistics.foulsPersonal;
      case 'pm':
        return `${p.statistics.plusMinusPoints > 0 ? '+' : ''}${p.statistics.plusMinusPoints}`;
      default:
        return '';
      }
    };
    return (
      <div key={p.personId} className={ "rowGrid stat " + (i % 2 === 0 ? "even" : "odd") }>
        {columnOrder.map((key) => (
          <span key={`${p.personId}-${key}`} className={getCellClassName(key)}>
            {getPlayerValue(key)}
          </span>
        ))}
      </div>
    )
  });
  if (!showMore) {
    playerRows = playerRows.slice(0, 5);
  }

  let fg;
  if ((teamTotals.fieldGoalsMade / teamTotals.fieldGoalsAttempted) === 1) {
    fg = 100;
  } else {
    fg = (Math.round((teamTotals.fieldGoalsMade / teamTotals.fieldGoalsAttempted) * 100 * 10) / 10).toFixed(1)
  }
  if (fg === 'NaN') {
    fg = 0;
  }
  let pt3;
  if ((teamTotals.threePointersMade / teamTotals.threePointersAttempted) === 1) {
    pt3 = 100;
  } else {
    pt3 = (Math.round((teamTotals.threePointersMade / teamTotals.threePointersAttempted) * 100 * 10) / 10).toFixed(1)
  }
  if (pt3 === 'NaN') {
    pt3 = 0;
  }
  let ft;
  if ((teamTotals.freeThrowsMade / teamTotals.freeThrowsAttempted) === 1) {
    ft = 100;
  } else {
    ft = (Math.round((teamTotals.freeThrowsMade / teamTotals.freeThrowsAttempted) * 100 * 10) / 10).toFixed(1)
  }
  if (ft === 'NaN') {
    ft = 0;
  }
  const totalRow = playerRows && (
    <div key="team-total-row" className={ "rowGrid stat " + (playerRows.length % 2 === 0 ? 'even' : 'odd')}>
      {columnOrder.map((key) => {
        let value = '';
        switch (key) {
        case 'player':
          value = 'TEAM';
          break;
        case 'pts':
          value = teamTotals.points;
          break;
        case 'fgm-a':
          value = `${teamTotals.fieldGoalsMade}-${teamTotals.fieldGoalsAttempted}`;
          break;
        case 'fg%':
          value = fg;
          break;
        case '3pm-a':
          value = `${teamTotals.threePointersMade}-${teamTotals.threePointersAttempted}`;
          break;
        case '3p%':
          value = pt3;
          break;
        case 'ftm-a':
          value = `${teamTotals.freeThrowsMade}-${teamTotals.freeThrowsAttempted}`;
          break;
        case 'ft%':
          value = ft;
          break;
        case 'reb':
          value = teamTotals.reboundsTotal;
          break;
        case 'oreb':
          value = teamTotals.reboundsOffensive;
          break;
        case 'dreb':
          value = teamTotals.reboundsDefensive;
          break;
        case 'ast':
          value = teamTotals.assists;
          break;
        case 'stl':
          value = teamTotals.steals;
          break;
        case 'blk':
          value = teamTotals.blocks;
          break;
        case 'to':
          value = teamTotals.turnovers;
          break;
        case 'pf':
          value = teamTotals.foulsPersonal;
          break;
        default:
          value = '';
          break;
        }
        return (
          <span key={`team-${key}`} className={getCellClassName(key)}>
            {value}
          </span>
        );
      })}
    </div>
  );

  const statHeadings = (
    <div key="stat-headings" className="rowGrid statHeadings">
      {columnOrder.map((key) => (
        <span key={`heading-${key}`} className={getCellClassName(key)}>
          {COLUMN_LABELS[key]}
        </span>
      ))}
    </div>
  );
  const teamBox = playerRows;
  teamBox && teamBox.unshift(statHeadings);
  teamBox && teamBox.push(totalRow);

  return (
    <div>
      <div className="teamRow">
        <div className="team">
          <span style={teamColor ? { color: teamColor } : undefined}>{team?.teamName}</span>
          {showButton && (
            <div className='showMore'>
              <IconButton
                aria-label={showMore ? 'Show fewer stats' : 'Show more stats'}
                onClick={() => setShowMore(!showMore)}
              >
                {showMore ? <UnfoldLess /> : <UnfoldMore />}
              </IconButton>
            </div>
          )}
        </div>
      </div>
      <div ref={tableWrapperRef} className="tableWrapper" onScroll={onScroll}>
        {teamBox}
      </div>
    </div>
  );
}
