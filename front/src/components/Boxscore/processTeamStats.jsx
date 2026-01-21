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
    const firstName = (player.first || '').trim();
    const familyName = (player.last || '').trim();
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

  const normalizeMinutes = (value) => {
    if (!value) {
      return '00:00';
    }
    const raw = String(value).trim();
    if (raw.startsWith('PT') && raw.endsWith('S')) {
      const stripped = raw.slice(2, -1);
      if (stripped.includes('M')) {
        const [mins, secs] = stripped.split('M');
        const seconds = secs ? Math.floor(Number.parseFloat(secs)) : 0;
        return `${String(mins).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      const seconds = Math.floor(Number.parseFloat(stripped));
      return `00:${String(seconds).padStart(2, '0')}`;
    }
    return raw;
  };

  const minutesToSeconds = (value) => {
    const [mins, secs] = normalizeMinutes(value).split(':');
    return (Number(mins) || 0) * 60 + (Number(secs) || 0);
  };

  const formatPercentage = (made, attempted) => {
    if (!attempted) {
      return 0;
    }
    if (made === attempted) {
      return 100;
    }
    return (Math.round((made / attempted) * 100 * 10) / 10).toFixed(1);
  };

  if (!team) return '';
  const teamTotals = {
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    to: 0,
    pf: 0,
    pts: 0,
    pm: 0,
  };

  const columnOrder = isCompact ? COMPACT_COLUMN_ORDER : DEFAULT_COLUMN_ORDER;

  const playersWithMinutes = (team.players || []).map((player) => {
    const stats = player?.stats || {};
    const minutes = normalizeMinutes(stats.min);
    return {
      player,
      stats,
      minutes,
      seconds: minutesToSeconds(minutes),
    };
  }).filter((item) => item.seconds > 0).sort((a, b) => b.seconds - a.seconds);

  let playerRows = playersWithMinutes.map((item, i) => {
    const p = item.player;
    const stats = item.stats;
    const getStat = (key) => Number(stats[key] ?? 0);
    teamTotals.fgm += getStat('fgm');
    teamTotals.fga += getStat('fga');
    teamTotals.tpm += getStat('tpm');
    teamTotals.tpa += getStat('tpa');
    teamTotals.ftm += getStat('ftm');
    teamTotals.fta += getStat('fta');
    teamTotals.oreb += getStat('oreb');
    teamTotals.dreb += getStat('dreb');
    teamTotals.ast += getStat('ast');
    teamTotals.stl += getStat('stl');
    teamTotals.blk += getStat('blk');
    teamTotals.to += getStat('to');
    teamTotals.pf += getStat('pf');
    teamTotals.pts += getStat('pts');
    teamTotals.pm += getStat('pm');
    const minutes = item.minutes;
    const getPlayerValue = (key) => {
      switch (key) {
      case 'player':
        return getDisplayName(p);
      case 'min':
        return minutes;
      case 'pts':
        return getStat('pts');
      case 'fgm-a':
        return `${getStat('fgm')}-${getStat('fga')}`;
      case 'fg%':
        return formatPercentage(getStat('fgm'), getStat('fga'));
      case '3pm-a':
        return `${getStat('tpm')}-${getStat('tpa')}`;
      case '3p%':
        return formatPercentage(getStat('tpm'), getStat('tpa'));
      case 'ftm-a':
        return `${getStat('ftm')}-${getStat('fta')}`;
      case 'ft%':
        return formatPercentage(getStat('ftm'), getStat('fta'));
      case 'reb':
        return getStat('oreb') + getStat('dreb');
      case 'oreb':
        return getStat('oreb');
      case 'dreb':
        return getStat('dreb');
      case 'ast':
        return getStat('ast');
      case 'stl':
        return getStat('stl');
      case 'blk':
        return getStat('blk');
      case 'to':
        return getStat('to');
      case 'pf':
        return getStat('pf');
      case 'pm':
        return `${getStat('pm') > 0 ? '+' : ''}${getStat('pm')}`;
      default:
        return '';
      }
    };
    return (
      <div key={p.id} className={ "rowGrid stat " + (i % 2 === 0 ? "even" : "odd") }>
        {columnOrder.map((key) => (
          <span key={`${p.id}-${key}`} className={getCellClassName(key)}>
            {getPlayerValue(key)}
          </span>
        ))}
      </div>
    );
  });
  if (!showMore) {
    playerRows = playerRows.slice(0, 5);
  }

  const fg = formatPercentage(teamTotals.fgm, teamTotals.fga);
  const pt3 = formatPercentage(teamTotals.tpm, teamTotals.tpa);
  const ft = formatPercentage(teamTotals.ftm, teamTotals.fta);
  const totalRow = playerRows && (
    <div key="team-total-row" className={ "rowGrid stat " + (playerRows.length % 2 === 0 ? 'even' : 'odd')}>
      {columnOrder.map((key) => {
        let value = '';
        switch (key) {
        case 'player':
          value = 'TEAM';
          break;
        case 'pts':
          value = teamTotals.pts;
          break;
        case 'fgm-a':
          value = `${teamTotals.fgm}-${teamTotals.fga}`;
          break;
        case 'fg%':
          value = fg;
          break;
        case '3pm-a':
          value = `${teamTotals.tpm}-${teamTotals.tpa}`;
          break;
        case '3p%':
          value = pt3;
          break;
        case 'ftm-a':
          value = `${teamTotals.ftm}-${teamTotals.fta}`;
          break;
        case 'ft%':
          value = ft;
          break;
        case 'reb':
          value = teamTotals.oreb + teamTotals.dreb;
          break;
        case 'oreb':
          value = teamTotals.oreb;
          break;
        case 'dreb':
          value = teamTotals.dreb;
          break;
        case 'ast':
          value = teamTotals.ast;
          break;
        case 'stl':
          value = teamTotals.stl;
          break;
        case 'blk':
          value = teamTotals.blk;
          break;
        case 'to':
          value = teamTotals.to;
          break;
        case 'pf':
          value = teamTotals.pf;
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
          <span style={teamColor ? { color: teamColor } : undefined}>{team?.name}</span>
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
