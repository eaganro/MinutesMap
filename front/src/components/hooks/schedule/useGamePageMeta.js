import { useEffect } from 'react';
import { parseGameSlug } from '../../../domain/game-selection/status';
import { NBA_TEAM_NAMES } from '../../../domain/game-selection/teamSchedule';

const SITE_URL = 'https://minutesmap.com';

const teamName = (abbr) => NBA_TEAM_NAMES[abbr.toUpperCase()] || abbr.toUpperCase();

const formatDate = (date, month) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month,
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * The title, description and canonical URL of a game's page, from its slug
 * (`2026-11-18-bos-phi` is BOS at PHI), so they are known before its data loads.
 */
export function describeGamePage(gameId) {
  const parsed = parseGameSlug(gameId);
  if (!parsed) return null;
  const [away, home] = parsed.gameId.slice(11).split('-');
  const matchup = `${teamName(away)} at ${teamName(home)}`;
  return {
    title: `${matchup}, ${formatDate(parsed.date, 'short')} | MinutesMap`,
    description: `Minute-by-minute map of ${matchup} on ${formatDate(parsed.date, 'long')}: play-by-play, rotations, lineups and the box score.`,
    url: `${SITE_URL}/${parsed.gameId}`,
  };
}

/**
 * Gives the selected game's page its own title, description and canonical link,
 * which search engines read after running the app. Without a game, the page keeps
 * the site's defaults from index.html.
 */
export function useGamePageMeta(gameId) {
  useEffect(() => {
    const page = describeGamePage(gameId);
    if (!page) return undefined;

    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousTitle = document.title;
    const previousDescription = descriptionTag?.getAttribute('content') ?? null;
    document.title = page.title;
    descriptionTag?.setAttribute('content', page.description);

    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = page.url;
    document.head.appendChild(canonical);

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription !== null) {
        descriptionTag.setAttribute('content', previousDescription);
      }
      canonical.remove();
    };
  }, [gameId]);
}
