export default function TimelineGrid({ 
  width, 
  leftMargin, 
  qWidth, 
  numQs,
  maxLead,
  maxY, 
  showScoreDiff, 
  awayTeamName, 
  homeTeamName, 
  teamColors,
  isQuarterView,
  activePeriodLabel
}) {
  
  const timelineElements = [];

  // 1. Horizontal Baseline
  timelineElements.push(
    <line key="baseline" x1={0} y1={300} x2={leftMargin + width} y2={300} style={{ stroke: 'var(--line-color)', strokeWidth: 1 }} />
  );

  // 2. Vertical Quarter Lines
  if (!isQuarterView) {
    // Q1, Q2, Q3
    for (let i = 1; i <= 3; i++) {
      const x = leftMargin + qWidth * i;
      timelineElements.push(
        <line key={`q${i}`} x1={x} y1={10} x2={x} y2={590} style={{ stroke: 'var(--line-color)', strokeWidth: 1 }} />
      );
    }
    
    // Q4/OT Lines
    for (let q = 4; q < numQs; q += 1) {
      // OT periods are shorter (5 mins vs 12 mins), so they are 5/12th the width
      let x = leftMargin + qWidth * 4 + (5/12 * qWidth) * (q - 4);
      timelineElements.push(
        <line key={`q${q}`} x1={x} y1={10} x2={x} y2={590} style={{ stroke: 'var(--line-color)', strokeWidth: 1 }} />
      );
    }
  }

  // 3. Labels (Q1... Q4, O1...)
  const labelStyle = { fontSize: '10px', fill: 'var(--quarter-label-color)', fontWeight: 500 };
  const otWidth = (5/12) * qWidth;

  if (isQuarterView) {
    if (activePeriodLabel) {
      timelineElements.push(
        <text key="label-active" x={leftMargin + width / 2} y={8} textAnchor="middle" style={labelStyle}>{activePeriodLabel}</text>
      );
    }
  } else {
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((label, i) => {
      timelineElements.push(
        <text key={`label-${label}`} x={leftMargin + qWidth * (i + 0.5)} y={8} textAnchor="middle" style={labelStyle}>{label}</text>
      );
    });

    for (let ot = 1; ot <= numQs - 4; ot += 1) {
      const otCenterX = leftMargin + qWidth * 4 + otWidth * (ot - 0.5);
      timelineElements.push(
        <text key={`label-o${ot}`} x={otCenterX} y={8} textAnchor="middle" style={labelStyle}>O{ot}</text>
      );
    }
  }

  // 4. Score Differential Dashed Lines (Background Reference)
  if (showScoreDiff) {
    let numLines = 0;
    let lineJump = 0;

    // Determine density based on the Max Lead
    if ((maxLead / 5) < 5) {
      numLines = Math.floor(maxLead / 5);
      lineJump = 5;
    } else if ((maxLead / 10) < 5) {
      numLines = Math.floor(maxLead / 10);
      lineJump = 10;
    } else if ((maxLead / 15) < 5) {
      numLines = Math.floor(maxLead / 15);
      lineJump = 15;
    } else {
      // Fallback for very large leads
      numLines = Math.floor(maxLead / 20);
      lineJump = 20;
    }

    for (let i = 0; i < numLines; i += 1) {
        const value = (i + 1) * lineJump;

        const yOffset = value * (300 / maxY);
        
        // Positive (Away Lead)
        const posy = 300 - yOffset;
        timelineElements.push(
            <g key={`sp${i}`}>
                <line x1={leftMargin - 5} y1={posy} x2={leftMargin + width - 5} y2={posy} strokeDasharray="5,20" style={{ stroke: teamColors.away, strokeWidth: 0.5 }} />
                <text x={leftMargin + width + 10} y={posy + 4} textAnchor="end" style={{ ...labelStyle, fill: teamColors.away }}>{value}</text>
            </g>
        );

        // Negative (Home Lead)
        const negy = 300 + yOffset;
        timelineElements.push(
            <g key={`sn${i}`}>
                <line x1={leftMargin - 5} y1={negy} x2={leftMargin + width - 5} y2={negy} strokeDasharray="5,20" style={{ stroke: teamColors.home, strokeWidth: 0.5 }} />
                <text x={leftMargin + width + 10} y={negy + 4} textAnchor="end" style={{ ...labelStyle, fill: teamColors.home }}>{value}</text>
            </g>
        );
    }
  }

  return <>{timelineElements}</>;
}
