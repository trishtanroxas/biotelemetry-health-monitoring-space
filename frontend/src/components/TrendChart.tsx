import { useState } from 'react';
import { EmptyState } from './AppShell';
import { HelpTip } from './WellnessUI';
import { average } from '../services/analytics';
interface ChartPoint { time: string; value: number }
export function TrendChart({ title, unit, points, help, domain, color = 'var(--accent)', baseline }: { title: string; unit: string; points: ChartPoint[]; help?: string; domain?: [number, number]; color?: string; baseline?: number }) {
  const [showTable, setShowTable] = useState(false);
  if (!points.length) return <section className="panel chart-panel"><h2>{title}</h2><EmptyState title="No recorded data yet">Saved check-ins with this metric will appear here.</EmptyState></section>;
  const values = points.map(p => p.value).concat(baseline === undefined ? [] : [baseline]);
  const min = domain?.[0] ?? Math.floor(Math.min(...values) - 1), max = domain?.[1] ?? Math.ceil(Math.max(...values) + 1);
  const x = (index: number) => points.length === 1 ? 265 : 48 + index / (points.length - 1) * 434;
  const y = (value: number) => 156 - (value - min) / (max - min) * 122;
  const coordinates = points.map((p, index) => `${x(index)},${y(p.value)}`).join(' ');
  return <section className="panel chart-panel"><div className="section-heading"><h2>{title}</h2><span className="chart-controls"><span className="pill">{unit}</span>{help && <HelpTip term={title}>{help}</HelpTip>}</span></div><p className="chart-summary">{points.length} saved reading{points.length === 1 ? '' : 's'} · Average <strong>{average(points.map(p => p.value))?.toFixed(1)} {unit}</strong></p><svg className="trend-chart" viewBox="0 0 520 210" role="img" aria-label={`${title}: ${points.map(p => `${new Date(p.time).toLocaleString()}: ${p.value} ${unit}`).join('; ')}`}>
    {[min, (min + max) / 2, max].map(value => <g key={value}><line x1="48" x2="482" y1={y(value)} y2={y(value)} className="chart-grid" /><text x="36" y={y(value) + 4} textAnchor="end">{Number(value.toFixed(1))}</text></g>)}
    {baseline !== undefined && <g><line x1="48" x2="482" y1={y(baseline)} y2={y(baseline)} stroke="var(--muted)" strokeDasharray="5 5" /><text x="480" y={y(baseline) - 7} textAnchor="end">Personal reference {baseline}</text></g>}
    <polyline points={coordinates} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />{points.map((point, index) => <circle className="trend-point" key={index} cx={x(index)} cy={y(point.value)} r="4" fill={color} tabIndex={0} aria-label={`${new Date(point.time).toLocaleString()}: ${point.value} ${unit}`}><title>{`${new Date(point.time).toLocaleString()} · ${point.value} ${unit}`}</title></circle>)}
    <text x="48" y="190">{new Date(points[0].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text><text x="482" y="190" textAnchor="end">{new Date(points[points.length - 1].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>
  </svg>
  <div className="trend-table-bar">
    <button type="button" className="button secondary compact-btn" onClick={() => setShowTable(prev => !prev)} aria-expanded={showTable}>
      {showTable ? 'Hide recorded values' : `Show recorded values (${points.length})`}
    </button>
  </div>
  {showTable && <div className="table-scroll"><table><thead><tr><th scope="col">Recorded</th><th scope="col">{title} ({unit})</th></tr></thead><tbody>{points.map((point, index) => <tr key={index}><td>{new Date(point.time).toLocaleString()}</td><td>{point.value}</td></tr>)}</tbody></table></div>}
  </section>;
}




