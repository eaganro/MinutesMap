import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeExportRange } from './playExportRange';

export const useExportRange = ({ gameId, numPeriods }) => {
  const [exportRange, setExportRange] = useState({ start: 1, end: 1 });

  useEffect(() => {
    if (numPeriods <= 0) return;
    setExportRange({ start: 1, end: numPeriods });
  }, [gameId, numPeriods]);

  const resolvedExportRange = useMemo(
    () => normalizeExportRange(exportRange, numPeriods),
    [exportRange, numPeriods]
  );

  const handleExportRangeStartChange = useCallback((event) => {
    const start = Number(event.target.value);
    setExportRange((prev) => {
      const prevEnd = Number(prev?.end);
      const end = Number.isFinite(prevEnd) ? Math.max(prevEnd, start) : start;
      return { start, end };
    });
  }, []);

  const handleExportRangeEndChange = useCallback((event) => {
    const end = Number(event.target.value);
    setExportRange((prev) => {
      const prevStart = Number(prev?.start);
      const start = Number.isFinite(prevStart) ? Math.min(prevStart, end) : end;
      return { start, end };
    });
  }, []);

  return {
    exportRange,
    resolvedExportRange,
    handleExportRangeStartChange,
    handleExportRangeEndChange,
  };
};
