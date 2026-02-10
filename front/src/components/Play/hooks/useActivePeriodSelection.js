import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPeriodLabel } from '../PlayExport/playExportRange';

const QUARTER_VIEW_BREAKPOINT = 700;

export function useActivePeriodSelection({
  gameId,
  gameStatus,
  displayLastAction,
  numPeriods,
  sectionWidth,
  isShowingStableData,
}) {
  const appliedGameIdRef = useRef(gameId);
  const pendingGameChangeRef = useRef(false);
  const userSelectedPeriodRef = useRef(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  const isQuarterView = sectionWidth > 0 && sectionWidth < QUARTER_VIEW_BREAKPOINT;

  const periodOptions = useMemo(() => {
    if (numPeriods <= 0) return [];
    const options = [{ period: 0, label: 'Game' }];
    for (let i = 0; i < numPeriods; i += 1) {
      const period = i + 1;
      options.push({
        period,
        label: formatPeriodLabel(period),
      });
    }
    return options;
  }, [numPeriods]);

  const isFinal = useMemo(() => {
    if (typeof gameStatus === 'string' && gameStatus.trim().startsWith('Final')) {
      return true;
    }
    const status = displayLastAction?.status;
    return typeof status === 'string' && status.trim().startsWith('Final');
  }, [displayLastAction?.status, gameStatus]);

  const defaultPeriod = useMemo(() => {
    if (isFinal) return 1;
    const fallback = Number(displayLastAction?.period || numPeriods || 4);
    if (!Number.isFinite(fallback) || fallback <= 0) return 1;
    return numPeriods > 0 ? Math.min(fallback, numPeriods) : fallback;
  }, [displayLastAction?.period, numPeriods, isFinal]);

  const hasPeriodData = useMemo(() => {
    const period = Number(displayLastAction?.period);
    return Number.isFinite(period) && period > 0;
  }, [displayLastAction?.period]);

  useEffect(() => {
    if (gameId === appliedGameIdRef.current) return;
    appliedGameIdRef.current = gameId;
    pendingGameChangeRef.current = true;
    userSelectedPeriodRef.current = false;
  }, [gameId]);

  useEffect(() => {
    if (!pendingGameChangeRef.current) return;
    if (isShowingStableData) return;
    pendingGameChangeRef.current = false;
    setSelectedPeriod(defaultPeriod);
  }, [isShowingStableData, defaultPeriod]);

  useEffect(() => {
    if (!isQuarterView || numPeriods <= 0) return;
    if (pendingGameChangeRef.current) return;
    if (!hasPeriodData && !isFinal) return;
    setSelectedPeriod((prev) => {
      if (prev === 0) return 0;
      const prevValid = Number.isFinite(prev) && prev > 0 && prev <= numPeriods;
      if (userSelectedPeriodRef.current && prevValid) return prev;
      return defaultPeriod;
    });
  }, [isQuarterView, numPeriods, defaultPeriod, hasPeriodData, isFinal]);

  const resolvedSelectedPeriod =
    pendingGameChangeRef.current && !isShowingStableData ? defaultPeriod : selectedPeriod;

  const activePeriod = isQuarterView
    ? resolvedSelectedPeriod !== null
      ? resolvedSelectedPeriod
      : defaultPeriod
    : null;

  const isQuarterFocus = isQuarterView && activePeriod !== 0;
  const activePeriodLabel = isQuarterFocus ? formatPeriodLabel(activePeriod) : '';
  const latestStartedPeriod = Number(displayLastAction?.period || 0);

  const selectPeriod = useCallback((period) => {
    userSelectedPeriodRef.current = true;
    setSelectedPeriod(period);
  }, []);

  return {
    isQuarterView,
    periodOptions,
    isFinal,
    activePeriod,
    isQuarterFocus,
    activePeriodLabel,
    latestStartedPeriod,
    selectPeriod,
  };
}
