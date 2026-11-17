export default function TimelineGrid({
  width,
  leftMargin,
  qWidth,
  numQs,
  isQuarterView,
  activePeriodLabel,
}) {
  const timelineElements = [];
  const totalPeriods = Number.isFinite(Number(numQs)) && Number(numQs) > 0 ? Number(numQs) : 4;
  const regulationPeriods = Math.min(4, totalPeriods);
  const overtimePeriods = Math.max(0, totalPeriods - 4);

  // 1. Horizontal Baseline
  timelineElements.push(
    <line
      key="baseline"
      x1={0}
      y1={300}
      x2={leftMargin + width}
      y2={300}
      className="playGridBaseline"
    />,
  );

  // 2. Vertical Quarter Lines
  if (!isQuarterView) {
    // Regulation period separators.
    for (let i = 1; i < regulationPeriods; i += 1) {
      const x = leftMargin + qWidth * i;
      timelineElements.push(
        <line key={`q${i}`} x1={x} y1={6} x2={x} y2={594} className="playGridPeriodLine" />,
      );
    }

    // OT separators (shorter than regulation periods).
    for (let q = 4; q < totalPeriods; q += 1) {
      // OT periods are shorter (5 mins vs 12 mins), so they are 5/12th the width
      let x = leftMargin + qWidth * 4 + (5 / 12) * qWidth * (q - 4);
      timelineElements.push(
        <line key={`q${q}`} x1={x} y1={6} x2={x} y2={594} className="playGridPeriodLine" />,
      );
    }
  }

  // 3. Labels (Q1... Q4, O1...)
  const labelY = 16;
  const otWidth = (5 / 12) * qWidth;

  if (isQuarterView) {
    if (activePeriodLabel) {
      timelineElements.push(
        <text
          key="label-active"
          x={leftMargin + width / 2}
          y={labelY}
          textAnchor="middle"
          className="playGridPeriodLabel"
        >
          {activePeriodLabel}
        </text>,
      );
    }
  } else {
    Array.from({ length: regulationPeriods }, (_, idx) => `Q${idx + 1}`).forEach((label, i) => {
      timelineElements.push(
        <text
          key={`label-${label}`}
          x={leftMargin + qWidth * (i + 0.5)}
          y={labelY}
          textAnchor="middle"
          className="playGridPeriodLabel"
        >
          {label}
        </text>,
      );
    });

    for (let ot = 1; ot <= overtimePeriods; ot += 1) {
      const otCenterX = leftMargin + qWidth * 4 + otWidth * (ot - 0.5);
      timelineElements.push(
        <text
          key={`label-o${ot}`}
          x={otCenterX}
          y={labelY}
          textAnchor="middle"
          className="playGridPeriodLabel"
        >
          O{ot}
        </text>,
      );
    }
  }

  return <>{timelineElements}</>;
}
