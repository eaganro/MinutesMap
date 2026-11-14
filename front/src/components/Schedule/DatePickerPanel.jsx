import { useEffect, useRef, useState } from 'react';
import NavigateNext from '@mui/icons-material/esm/NavigateNext';
import NavigateBefore from '@mui/icons-material/esm/NavigateBefore';
import IconButton from '@mui/material/IconButton';
import { formatPickerDate } from '../../domain/game-selection/teamSchedule';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

// Months are "YYYY-MM"; dates "YYYY-MM-DD".
function shiftMonth(month, offset) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1 + offset, 1)).toISOString().slice(0, 7);
}

function formatMonth(month) {
  return MONTH_FORMAT.format(new Date(`${month}-01T12:00:00Z`));
}

// The month's days laid out by week, with nulls before the 1st.
function getMonthCells(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const leading = new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: dayCount },
      (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
    ),
  ];
}

/**
 * The calendar opened from the schedule's date field. Moving between months only
 * moves the calendar; the date changes when a day is picked. Closes on a pick,
 * Escape, or a press outside it (and outside the field that opened it).
 */
export default function DatePickerPanel({ id, date, onSelect, onClose, triggerRef }) {
  const panelRef = useRef(null);
  const [month, setMonth] = useState(() => (date || '').slice(0, 7));

  useEffect(() => {
    const panel = panelRef.current;
    const target =
      panel?.querySelector('.datePickerDay[aria-current="date"]') ||
      panel?.querySelector('.datePickerDay');
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

  if (!month) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      id={id}
      className="datePickerPanel"
      role="dialog"
      aria-label="Choose a date"
    >
      <div className="datePickerHeader">
        <IconButton
          size="small"
          className="datePickerNav"
          onClick={() => setMonth((current) => shiftMonth(current, -1))}
          aria-label="Previous month"
        >
          <NavigateBefore fontSize="small" />
        </IconButton>
        <span className="datePickerMonth" aria-live="polite">
          {formatMonth(month)}
        </span>
        <IconButton
          size="small"
          className="datePickerNav"
          onClick={() => setMonth((current) => shiftMonth(current, 1))}
          aria-label="Next month"
        >
          <NavigateNext fontSize="small" />
        </IconButton>
      </div>
      <div className="datePickerGrid">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="datePickerWeekday" aria-hidden="true">
            {weekday}
          </span>
        ))}
        {getMonthCells(month).map((cell, index) =>
          cell ? (
            <button
              key={cell}
              type="button"
              className={`datePickerDay${cell === date ? ' isSelected' : ''}`}
              onClick={() => onSelect(cell)}
              aria-label={formatPickerDate(cell)}
              aria-current={cell === date ? 'date' : undefined}
            >
              {Number(cell.slice(8))}
            </button>
          ) : (
            <span key={`blank-${index}`} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}
