/** A decorative trace of values shown with units and dates in the detail view. */
export function CardTrend({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="card-trend-empty" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>;
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low || 1;
  const points = values.map((value, index) => [4 + index / (values.length - 1) * 212, high === low ? 24 : 40 - (value - low) / span * 32]);
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const last = points[points.length - 1];
  return <svg className="card-trend" viewBox="0 0 220 48" aria-hidden="true"><path className="card-trend-base" d="M4,44H216" /><path className="card-trend-line" d={line} /><circle cx={last[0]} cy={last[1]} r="3" /></svg>;
}
