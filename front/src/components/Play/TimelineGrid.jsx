import { getPeriodDurationSeconds, getPeriodStartSeconds } from '../../helpers/playTimeline';

// About half the width of a "Q1" label, plus a little air.
const PERIOD_LABEL_HALF_WIDTH = 11;
// A period with less room than this on screen, like a live one that has just
// started, goes unlabelled.
const MIN_LABELLED_PERIOD_WIDTH = 2 * PERIOD_LABEL_HALF_WIDTH;

const getPeriodLabel = (period) => (period <= 4 ? `Q${period}` : `O${period - 4}`);

export default function TimelineGrid({
  width,
  leftMargin,
  timelineWindow,
  numQs,
  isQuarterView,
  activePeriodLabel,
  // Without a name column the first period label can sit on the team name, so labels
  // stay to the right of this x.
  labelMinX = 0,
  // Off when the period buttons sit in the top band instead (phones); the separators
  // then start below them, at lineTop.
  showPeriodLabels = true,
  lineTop = 6,
}) {
  const clearLabelX = (x) => Math.max(x, labelMinX + PERIOD_LABEL_HALF_WIDTH);
  const totalPeriods = Number.isFinite(Number(numQs)) && Number(numQs) > 0 ? Number(numQs) : 4;
  const startSeconds = timelineWindow?.startSeconds ?? 0;
  const durationSeconds = timelineWindow?.durationSeconds ?? 0;
  const endSeconds = startSeconds + durationSeconds;
  const toX = (seconds) => leftMargin + ((seconds - startSeconds) / durationSeconds) * width;

  const timelineElements = [
    <line
      key="baseline"
      x1={0}
      y1={300}
      x2={leftMargin + width}
      y2={300}
      className="playGridBaseline"
    />,
  ];

  if (durationSeconds <= 0) return <>{timelineElements}</>;

  // Each period in the window gets a separator where it starts and a label centred
  // on the part of it that is on screen (a live game's window can end mid-period).
  for (let period = 1; period <= totalPeriods; period += 1) {
    const periodStart = getPeriodStartSeconds(period);
    const periodEnd = periodStart + getPeriodDurationSeconds(period);
    const visibleStart = Math.max(periodStart, startSeconds);
    const visibleEnd = Math.min(periodEnd, endSeconds);
    if (visibleEnd <= visibleStart) continue;

    if (periodStart > startSeconds) {
      const x = toX(periodStart);
      timelineElements.push(
        <line
          key={`q${period - 1}`}
          x1={x}
          y1={lineTop}
          x2={x}
          y2={594}
          className="playGridPeriodLine"
        />,
      );
    }

    if (!showPeriodLabels) continue;
    const labelStart = toX(visibleStart);
    const labelEnd = toX(visibleEnd);
    const label = isQuarterView ? activePeriodLabel : getPeriodLabel(period);
    if (!label || labelEnd - labelStart < MIN_LABELLED_PERIOD_WIDTH) continue;
    timelineElements.push(
      <text
        key={`label-${period}`}
        x={clearLabelX((labelStart + labelEnd) / 2)}
        y={16}
        textAnchor="middle"
        className="playGridPeriodLabel"
      >
        {label}
      </text>,
    );
  }

  return <>{timelineElements}</>;
}
