import { useLayoutEffect, useRef } from 'react';
import { shiftDateString } from '../../domain/game-selection/time';
import { formatPickerDate, formatWeekday } from '../../domain/game-selection/teamSchedule';

// The picked day in the middle, two days either side.
const DAY_OFFSETS = [-2, -1, 0, 1, 2];
const SLIDE_MS = 220;
const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days from one "YYYY-MM-DD" date to another.
const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * The date view's day picker. Picking another day re-centres the strip on it, and the
 * strip slides so the day you tapped glides into the middle rather than jumping there.
 */
export default function DayStrip({ date, onShift }) {
  const daysRef = useRef(null);
  const previousDateRef = useRef(date);

  useLayoutEffect(() => {
    const previousDate = previousDateRef.current;
    previousDateRef.current = date;
    const node = daysRef.current;
    if (!node || !previousDate || !date || previousDate === date) return;
    const shift = daysBetween(previousDate, date);
    // Only days that were on screen slide in; a jump from the calendar just appears.
    if (!shift || Math.abs(shift) >= DAY_OFFSETS.length) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const [first, second] = node.children;
    if (!first || !second) return;
    const pitch = second.offsetLeft - first.offsetLeft;
    // Start the new days where their dates sat a moment ago, then slide them home.
    node.style.transition = 'none';
    node.style.transform = `translateX(${shift * pitch}px)`;
    node.getBoundingClientRect();
    node.style.transition = `transform ${SLIDE_MS}ms ease`;
    node.style.transform = '';
  }, [date]);

  if (!date) return null;

  return (
    <div className="dayStrip" role="group" aria-label="Day">
      <div className="dayStripDays" ref={daysRef}>
        {DAY_OFFSETS.map((offset) => {
          const day = shiftDateString(date, offset);
          if (!day) return null;
          const isPicked = offset === 0;
          return (
            <button
              key={day}
              type="button"
              className={`dayStripDay${isPicked ? ' isPicked' : ''}`}
              onClick={() => {
                if (!isPicked) onShift(offset);
              }}
              aria-pressed={isPicked}
              aria-label={formatPickerDate(day)}
            >
              <span className="dayStripWeekday" aria-hidden="true">
                {formatWeekday(day)}
              </span>
              <span className="dayStripNumber" aria-hidden="true">
                {Number(day.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
