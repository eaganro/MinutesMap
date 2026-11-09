import { useId, useState } from 'react';
import ExpandMore from '@mui/icons-material/esm/ExpandMore';
import HelpOutline from '@mui/icons-material/esm/HelpOutline';
import { useMediaQuery } from '../hooks/ui/useMediaQuery';
import { useTrackFeatureUseOnce } from '../hooks/analytics/useTrackFeatureUseOnce';
import { MOBILE_TOOLTIP_BREAKPOINT } from './model/layoutModel';
import './ChartHelp.scss';

/**
 * "How to read this chart", under the stat legend: closed until asked for, and still there
 * after the first-visit tips are done or skipped.
 */
export default function ChartHelp({ sectionWidth }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const isFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const trackChartHelp = useTrackFeatureUseOnce('chart-help');
  // Narrower charts show one quarter at a time, and their player names open the player's game.
  const isCompact = sectionWidth > 0 && sectionWidth < MOBILE_TOOLTIP_BREAKPOINT;
  const tap = isFinePointer ? 'click' : 'tap';

  const toggle = () => {
    if (!isOpen) trackChartHelp();
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="chartHelp">
      <button
        type="button"
        className={`chartHelpToggle${isOpen ? ' isOpen' : ''}`}
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <HelpOutline className="chartHelpIcon" aria-hidden="true" />
        How to read this chart
        <ExpandMore className="chartHelpChevron" aria-hidden="true" />
      </button>
      <div id={panelId} className="chartHelpPanel" hidden={!isOpen}>
        <ul>
          <li>
            Each row is a player. <strong>Lines</strong> show when they were on the court.
          </li>
          <li>
            <strong>Shapes</strong> are their plays, placed when they happened. The key above says
            which is which.
          </li>
          {isFinePointer ? (
            <li>
              <strong>Hover</strong> over the chart to see each play, and click to pin one.
            </li>
          ) : (
            <li>
              <strong>Drag</strong> across the chart to see each play.
            </li>
          )}
          {isCompact && (
            <li>
              <strong>{isFinePointer ? 'Click' : 'Tap'} a name</strong> to see that player&apos;s
              whole game.
            </li>
          )}
          {isCompact && (
            <li>
              <strong>Game, Q1, Q2…</strong> above the chart switch between the whole game and one
              quarter.
            </li>
          )}
          <li>
            <strong>Score Lead</strong> shading sits on the side of the team that&apos;s ahead and
            grows with the lead.
          </li>
          <li>
            The <strong>Win Odds</strong> line moves toward the team more likely to win.
          </li>
          <li>
            In the key, {tap} a stat to show or hide it, or <strong>hold</strong> it to show only
            that stat.
          </li>
        </ul>
      </div>
    </div>
  );
}
