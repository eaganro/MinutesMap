import { useEffect, useRef } from 'react';
import { Close } from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import { NBA_CONFERENCES, NBA_TEAM_NAMES } from '../../domain/game-selection/teamSchedule';
import TeamLogo from './TeamLogo';

/**
 * The team list opened from the schedule bar. Closes on a pick, Escape, or a press
 * outside it (and outside the button that opened it).
 */
export default function TeamPickerPanel({ id, selectedTeam, onSelect, onClose, triggerRef }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    const target =
      panel?.querySelector('.teamPickerTeam[aria-pressed="true"]') ||
      panel?.querySelector('.teamPickerTeam');
    target?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose({ restoreFocus: true });
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, triggerRef]);

  return (
    <div
      ref={panelRef}
      id={id}
      className="teamPickerPanel"
      role="dialog"
      aria-label="Choose a team"
    >
      <div className="teamPickerHeader">
        <span>Pick a team to browse its season</span>
        <IconButton
          size="small"
          className="teamPickerClose"
          onClick={() => onClose({ restoreFocus: true })}
          aria-label="Close team list"
        >
          <Close fontSize="small" />
        </IconButton>
      </div>
      <div className="teamPickerConferences">
        {NBA_CONFERENCES.map((conference) => (
          <section
            key={conference.name}
            className="teamPickerConference"
            aria-label={`${conference.name} teams`}
          >
            <h3 className="teamPickerConferenceName">{conference.name}</h3>
            <div className="teamPickerGrid">
              {conference.teams.map((abbr) => {
                const isSelected = abbr === selectedTeam;
                return (
                  <button
                    key={abbr}
                    type="button"
                    className={`teamPickerTeam${isSelected ? ' isSelected' : ''}`}
                    onClick={() => onSelect(abbr)}
                    aria-label={NBA_TEAM_NAMES[abbr]}
                    aria-pressed={isSelected}
                    title={NBA_TEAM_NAMES[abbr]}
                  >
                    <TeamLogo team={abbr} size={28} />
                    <span className="teamPickerAbbr">{abbr}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
