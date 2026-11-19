import { createContext, useContext, useState } from 'react';
import './TeamTabs.scss';

const TeamChoiceContext = createContext(null);

// Shares the picked team between the sections inside it (box score and lineups), so
// switching team in one switches the other.
export function TeamChoiceProvider({ children }) {
  const choice = useState(null);
  return <TeamChoiceContext.Provider value={choice}>{children}</TeamChoiceContext.Provider>;
}

// Which team's tab is open. The choice is remembered by team, so it carries over to
// another game with that team; otherwise the followed team (team view) or the away
// team opens first. Outside a TeamChoiceProvider each section keeps its own choice.
export function useTeamTab({ awayAbbr, homeAbbr, preferredTeam = null }) {
  const sharedChoice = useContext(TeamChoiceContext);
  const ownChoice = useState(null);
  const [chosenTeam, setChosenTeam] = sharedChoice ?? ownChoice;
  const sideOf = (abbr) => {
    if (!abbr) return null;
    if (abbr === awayAbbr) return 'away';
    if (abbr === homeAbbr) return 'home';
    return null;
  };
  const activeSide = sideOf(chosenTeam) ?? sideOf(preferredTeam) ?? 'away';
  const selectSide = (side) => setChosenTeam(side === 'home' ? homeAbbr : awayAbbr);
  return [activeSide, selectSide];
}

// The two-team switch the box score and lineups use on phones.
export default function TeamTabs({ teams, activeKey, onChange, label }) {
  return (
    <div className="teamTabs" role="group" aria-label={label}>
      {teams.map((team) => {
        const isActive = team.key === activeKey;
        return (
          <button
            key={team.key}
            type="button"
            className={`teamTab${isActive ? ' isActive' : ''}`}
            onClick={() => onChange(team.key)}
            aria-pressed={isActive}
            style={isActive && team.color ? { color: team.color } : undefined}
          >
            {team.label}
          </button>
        );
      })}
    </div>
  );
}
