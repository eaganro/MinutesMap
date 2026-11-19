import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TeamTabs, { TeamChoiceProvider, useTeamTab } from './TeamTabs';

function Section({ label, awayAbbr = 'PHI', homeAbbr = 'ORL' }) {
  const [activeSide, setActiveSide] = useTeamTab({ awayAbbr, homeAbbr });
  return (
    <TeamTabs
      label={label}
      teams={[
        { key: 'away', label: `${label} ${awayAbbr}` },
        { key: 'home', label: `${label} ${homeAbbr}` },
      ]}
      activeKey={activeSide}
      onChange={setActiveSide}
    />
  );
}

const isPicked = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('TeamTabs', () => {
  afterEach(cleanup);

  it('switches every section inside a TeamChoiceProvider together', () => {
    render(
      <TeamChoiceProvider>
        <Section label="Box" />
        <Section label="Lineups" />
      </TeamChoiceProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Box ORL' }));

    expect(isPicked('Box ORL')).toBe('true');
    expect(isPicked('Lineups ORL')).toBe('true');
  });

  it('keeps the shared pick by team when the sides differ', () => {
    render(
      <TeamChoiceProvider>
        <Section label="Box" />
        <Section label="Lineups" awayAbbr="ORL" homeAbbr="BKN" />
      </TeamChoiceProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Box ORL' }));

    expect(isPicked('Lineups ORL')).toBe('true');
  });

  it('keeps each section to itself without a provider', () => {
    render(
      <>
        <Section label="Box" />
        <Section label="Lineups" />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Box ORL' }));

    expect(isPicked('Box ORL')).toBe('true');
    expect(isPicked('Lineups PHI')).toBe('true');
  });
});
