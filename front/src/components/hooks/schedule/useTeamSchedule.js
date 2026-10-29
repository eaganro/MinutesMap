import { useCallback, useEffect, useState } from 'react';
import { PREFIX } from '../../../environment';
import { classifyFetchResult, fetchJson, isAbortError } from '../../../data/apiClient';
import { reportError } from '../../../errors/reportError';

const IDLE_STATE = { key: null, status: 'idle', payload: null, error: null };

export const buildTeamSeasonUrl = (team, season) =>
  `${PREFIX}/data/pages/teams/${team}/${season}.json.gz`;

/**
 * Loads a team's season page artifact (games with results) for team mode.
 */
export function useTeamSchedule({ team, season }) {
  const key = team && season ? `${team}/${season}` : null;
  const [state, setState] = useState(IDLE_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) {
      return undefined;
    }
    const controller = new AbortController();
    setState((prev) =>
      prev.key === key && prev.status === 'success'
        ? prev
        : { key, status: 'loading', payload: null, error: null },
    );

    fetchJson(buildTeamSeasonUrl(team, season), { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      const outcome = classifyFetchResult(result);
      if (outcome === 'success') {
        setState({ key, status: 'success', payload: result.data, error: null });
        return;
      }
      if (outcome === 'not-available') {
        setState({ key, status: 'not-available', payload: null, error: null });
        return;
      }
      if (isAbortError(result.error)) {
        return;
      }
      const isNetworkError = outcome === 'network-error';
      setState({
        key,
        status: 'error',
        payload: null,
        error: {
          message: isNetworkError
            ? 'Check your connection and try again.'
            : `The team schedule request failed${result.status ? ` (${result.status})` : ''}.`,
        },
      });
      reportError(result.error || new Error(`Team schedule fetch failed: ${result.status}`), {
        boundary: 'data-fetch',
        resource: 'team schedule',
        status: result.status ?? null,
      });
    });

    return () => controller.abort();
  }, [key, team, season, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (!key) {
    return { ...IDLE_STATE, retry };
  }
  if (state.key !== key) {
    return { key, status: 'loading', payload: null, error: null, retry };
  }
  return { ...state, retry };
}
