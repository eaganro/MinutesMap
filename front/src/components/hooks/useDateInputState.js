import { useCallback } from 'react';
import { shiftDateString } from '../../domain/game-selection/time';

const DATE_INPUT_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

export function toDateInputValue(dateLike) {
  if (!dateLike) {
    return '';
  }
  if (typeof dateLike === 'string') {
    const matched = dateLike.match(DATE_INPUT_PREFIX_PATTERN);
    if (matched) {
      return matched[1];
    }
  }
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export function useDateInputState({ date, onDateChange, onDateInteract }) {
  const handleDateChange = useCallback(
    (nextDate) => {
      if (!nextDate) {
        return;
      }
      onDateInteract?.();
      onDateChange(nextDate);
    },
    [onDateChange, onDateInteract],
  );

  const shiftDate = useCallback(
    (dayOffset) => {
      const currentDate = toDateInputValue(date);
      if (!currentDate) {
        return;
      }
      const nextDate = shiftDateString(currentDate, dayOffset);
      if (!nextDate) {
        return;
      }
      onDateInteract?.();
      onDateChange(nextDate);
    },
    [date, onDateChange, onDateInteract],
  );

  return {
    handleDateChange,
    shiftDate,
  };
}
