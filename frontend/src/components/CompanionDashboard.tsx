import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Dumbbell, ExternalLink, Eye, Moon, Play, Radio, Save } from 'lucide-react';
import snapshot from '../data/researchSnapshot.json';
import { companionSummary, decodeWeather, loadVisionObservations, saveVisionObservation, visionLabels, weatherSummary, type VisionObservation, type VisionStatus, type WeatherDay } from '../services/companion';
import type { CheckIn } from '../types/wellness';
import { buildCompanionDemo, companionScenarios, type CompanionScenario } from '../services/companionDemo';
import { Modal } from './Modal';
import { CardTrend } from './CardTrend';

type Topic = 'radiation' | 'vision' | 'movement' | 'recovery';
const topics = [
  { id: 'radiation' as const, title: 'Radiation & Space Weather', icon: Radio, label: 'Historical NASA catalog', hint: 'Explore recorded solar activity. Personal dose is unavailable.' },
  { id: 'vision' as const, title: 'Vision Health', icon: Eye, label: 'Your observations', hint: 'Notice a change. Save it. See why vision matters in space.' },
  { id: 'movement' as const, title: 'Bone & Muscle Maintenance', icon: Dumbbell, label: 'Your last 7 calendar days', hint: 'Connect completed exercise and discomfort to the research.' },
  { id: 'recovery' as const, title: 'Recovery & Wellbeing', icon: Moon, label: 'Your last 7 calendar days', hint: 'Follow your sleep, fatigue, stress and mood over time.' },
];
const weatherDays = decodeWeather(snapshot.weather.days);
const strongestDay = weatherDays.reduce((best, day) => (day.maxKp ?? -1) > (best.maxKp ?? -1) ? day : best);
const utcDateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="text-link" href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={14} /><span className="sr-only"> (opens in a new tab; internet required)</span></a>;
}

export function StudyComparison({ study, title, species, unit, explanation }: {
  study: typeof snapshot.vision; title: string; species: string; unit: string; explanation: string;
}) {
  return <div className="research-comparison">
    <div className="research-tags"><span className="pill">{study.study}</span><span className="pill species-label">{species}</span><span className="pill">Study samples</span></div>
    <h4>{title}</h4><p>{explanation}</p>
    <div className="table-scroll"><table className="data-table"><caption>Descriptive group means from the local CSV export</caption><thead><tr><th scope="col">Group</th><th scope="col">Mean ({unit})</th><th scope="col">Sample IDs</th></tr></thead><tbody>{study.groups.map(group => <tr key={group.label}><th scope="row">{group.label}</th><td>{group.mean.toFixed(2)}</td><td>{group.n}</td></tr>)}</tbody></table></div>
    <SourceLink href={`https://osdr.nasa.gov/bio/repo/data/studies/${study.study}`}>Open NASA study</SourceLink>
    <details className="research-method"><summary>Calculation and source files</summary><p>Arithmetic mean of available numeric values for the selected metric, one value per source file and sample ID. Groups are descriptive; no significance test or individual prediction is made.</p><p>Metric: <code>{study.metric}</code></p>{study.sourceFiles.map(file => <p key={file}><code>{file}</code></p>)}</details>
  </div>;
}

export function WeatherReplay({ day, onSelect }: { day: WeatherDay; onSelect(date: string): void }) {
  const index = weatherDays.findIndex(item => item.date === day.date);
  const windowDays = weatherDays.slice(Math.max(0, index - 6), index + 1);
  const maxFlares = Math.max(1, ...windowDays.map(item => item.flares));
  return <>
    <div className="replay-controls"><label>Replay date (UTC)<input type="date" value={day.date} min={weatherDays[0].date} max={weatherDays[weatherDays.length - 1].date} onChange={e => { if (weatherDays.some(item => item.date === e.target.value)) onSelect(e.target.value); }} /></label><div className="replay-step"><button type="button" className="button secondary" aria-label="Previous replay day" disabled={index <= 0} onClick={() => onSelect(weatherDays[index - 1].date)}><ChevronLeft size={17} /></button><button type="button" className="button secondary" aria-label="Next replay day" disabled={index >= weatherDays.length - 1} onClick={() => onSelect(weatherDays[index + 1].date)}><ChevronRight size={17} /></button></div></div>
    <div className="replay-shortcuts"><button type="button" className="text-link" onClick={() => onSelect(strongestDay.date)}>Strongest recorded Kp day</button><button type="button" className="text-link" onClick={() => onSelect(weatherDays[weatherDays.length - 1].date)}>Last snapshot day</button></div>
    <dl className="replay-readings"><div><dt>Solar flares</dt><dd>{day.flares}<small>{day.mClass} M-class · {day.xClass} X-class</small></dd></div><div><dt>Particle event entries</dt><dd>{day.sep}<small>Catalog entries, not a dose</small></dd></div><div><dt>Maximum recorded Kp</dt><dd>{day.maxKp === null ? 'No entry' : day.maxKp}<small>Planetary geomagnetic index</small></dd></div></dl>
    <p className="helper">Counts describe catalog entries in this snapshot. Particle entries may refer to different instruments observing the same event. Missing entries do not establish quiet or safe conditions.</p>
    <div className="weather-history" aria-label="Flare counts leading up to the replay date">{windowDays.map(item => <button key={item.date} type="button" aria-pressed={item.date === day.date} aria-label={`${item.date}: ${item.flares} solar flares, ${item.sep} particle entries`} onClick={() => onSelect(item.date)}><span className="weather-column"><span style={{ height: `${Math.max(3, item.flares / maxFlares * 100)}%` }} /></span><strong>{item.flares}</strong><small>{item.date.slice(5)}</small>{item.sep > 0 && <span className="weather-particle">SEP</span>}</button>)}</div>
    <p className="helper">Flare counts by UTC day · SEP marks a day with particle entries.</p>
    <details><summary>Read the seven-day values</summary><div className="table-scroll"><table className="data-table"><caption>Historical activity ending {day.date} UTC</caption><thead><tr><th scope="col">UTC date</th><th scope="col">Flares</th><th scope="col">Particle entries</th><th scope="col">Max Kp</th></tr></thead><tbody>{windowDays.map(item => <tr key={item.date}><th scope="row">{item.date}</th><td>{item.flares}</td><td>{item.sep}</td><td>{item.maxKp ?? 'No entry'}</td></tr>)}</tbody></table></div></details>
  </>;
}

function VisionLog({ observations, onSave, loading, error, demo = false }: { observations: VisionObservation[]; onSave(status: VisionStatus): void; loading: boolean; error: string; demo?: boolean }) {
  const [status, setStatus] = useState<VisionStatus | ''>('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault(); setSaved(false); setSaveError('');
    if (!status) { setSaveError('Choose an observation before saving.'); return; }
    try { onSave(status); setSaved(true); setStatus(''); }
    catch { setSaveError('Could not save this observation. Existing observations were retained. Check device storage and retry.'); }
  }
  return <>{demo ? <div className="demo-vision-reading"><span className="pill">Synthetic demo observation</span><h4>{observations[0] ? visionLabels[observations[0].status] : 'No demo observations'}</h4><p>Use the demo day controls to see the fictional observation history change. Exit demo to save your own observations.</p></div> : <form onSubmit={submit} className="vision-form"><label className="form-field"><span>Since your previous observation, have you noticed a change in your vision?</span><select value={status} required disabled={loading || !!error} onChange={e => { setStatus(e.target.value as VisionStatus | ''); setSaved(false); setSaveError(''); }}><option value="">Choose an observation</option>{Object.entries(visionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>This records your experience. It is not a visual acuity test or SANS screening.</small></label><button type="submit" className="button primary" disabled={loading || !!error}><Save size={16} />Save vision observation</button>{saved && <p className="helper" role="status"><Check size={14} />Saved on this device for this astronaut. Not sent to a server.</p>}{(error || saveError) && <p role="alert" className="error-box">{error || saveError}</p>}</form>}
    <p className="helper">For new or concerning changes, follow your mission’s medical reporting procedures. A “no change” observation cannot rule out an eye condition.</p>
    <details><summary>{demo ? 'Demo' : 'Saved'} vision history ({observations.length})</summary>{loading ? <p role="status">Loading observations…</p> : observations.length ? <ol className="vision-history">{observations.map(item => <li key={item.id}><strong>{visionLabels[item.status]}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></li>)}</ol> : <p className="helper">No vision observations saved for this astronaut.</p>}</details>
  </>;
}

export function CompanionEvidence({ topic, summary, day, onSelectDate, observations, visionLoading, visionError, saveVision, recordsLoading, recordsError, demo = false }: {
  topic: Topic; summary: ReturnType<typeof companionSummary>; day: WeatherDay; onSelectDate(date: string): void;
  observations: VisionObservation[]; visionLoading: boolean; visionError: string; saveVision(status: VisionStatus): void;
  recordsLoading: boolean; recordsError: string; demo?: boolean;
}) {
  const latest = summary.latest;
  const unavailable = recordsLoading ? 'Loading saved check-ins…' : recordsError ? 'Saved check-ins are unavailable. Retry loading your records above.' : 'No check-ins saved yet. Record your day to begin your personal history.';
  return <div className="evidence-grid"><section className="evidence-personal"><p className="eyebrow">{topic === 'radiation' ? 'HISTORICAL REPLAY · NOT LIVE' : demo ? 'SYNTHETIC DEMO · NOT SAVED' : 'YOUR OBSERVATIONS · THIS DEVICE'}</p>
    {topic === 'radiation' ? <><h3>{utcDateLabel(day.date)}</h3><WeatherReplay day={day} onSelect={onSelectDate} /><div className="evidence-limit">This is environmental research context. Personal radiation dose, shielding, and EVA safety cannot be determined from these records.</div></> : topic === 'vision' ? <><h3>A small observation, kept over time</h3><VisionLog observations={observations} onSave={saveVision} loading={visionLoading} error={visionError} demo={demo} /></> : <>
      <h3>{topic === 'movement' ? `${demo ? 'Demo' : 'Your'} activity over seven days` : `${demo ? 'Demo' : 'Your'} recovery over seven days`}</h3>
      {!latest || recordsLoading || recordsError ? <p className="companion-empty">{unavailable}</p> : <>
        <dl className="personal-readings">{topic === 'movement' ? <><div><dt>Completed exercise</dt><dd>{summary.coverage ? `${summary.exerciseMinutes} min` : 'No entries this week'}</dd></div><div><dt>Days with exercise recorded</dt><dd>{summary.exerciseDays} of 7</dd></div><div><dt>Latest discomfort entry</dt><dd>{latest.spaceWellness?.pain?.intensity !== undefined ? `${latest.spaceWellness.pain.intensity}/10` : 'Not recorded'}</dd></div></> : <><div><dt>Average recorded sleep</dt><dd>{summary.sleepAverage === null ? 'No entries this week' : `${summary.sleepAverage.toFixed(1)} h`}</dd></div><div><dt>Latest fatigue / stress</dt><dd>{latest.fatigue}/5 · {latest.stress}/5</dd></div><div><dt>Latest mood</dt><dd>{latest.mood}</dd></div>{summary.sleepChange !== null && <div><dt>Sleep vs previous check-in</dt><dd>{signed(summary.sleepChange)} h</dd></div>}</>}</dl>
        <p className="helper">{summary.coverage} of the last 7 local calendar days have an entry. Only the latest check-in per day contributes to weekly totals. Unrecorded days are unknown.</p>
        <p className="helper">Latest check-in: <time dateTime={latest.createdAt}>{new Date(latest.createdAt).toLocaleString()}</time>{topic === 'recovery' && summary.previous && <> · Compared with {new Date(summary.previous.createdAt).toLocaleString()}</>}</p>
        {summary.week.length > 0 && <details><summary>Review the recorded days</summary><div className="table-scroll"><table className="data-table"><caption>Your latest check-in on each recorded day</caption><thead><tr><th scope="col">Date</th><th scope="col">{topic === 'movement' ? 'Exercise (min)' : 'Sleep (h)'}</th><th scope="col">{topic === 'movement' ? 'Pain /10' : 'Fatigue /5'}</th></tr></thead><tbody>{summary.week.map(record => <tr key={record.id}><th scope="row">{new Date(record.createdAt).toLocaleDateString()}</th><td>{topic === 'movement' ? record.exerciseMinutes : record.sleepHours}</td><td>{topic === 'movement' ? record.spaceWellness?.pain?.intensity ?? 'Not recorded' : record.fatigue}</td></tr>)}</tbody></table></div></details>}
      </>}
      {demo ? <p className="helper">These check-ins are fictional presentation samples. Exit demo to return to your saved history. The other app pages continue to use your saved records.</p> : <div className="companion-actions"><a className="button primary" href="#checkin">Record a daily check-in<ArrowRight size={16} /></a><a className="text-link" href={topic === 'movement' ? '#missions' : '#analytics'}>{topic === 'movement' ? 'Review daily activities' : 'Explore your trends'}<ArrowRight size={16} /></a></div>}
      <div className="evidence-limit">{topic === 'movement' ? 'Exercise records do not measure bone density, muscle strength, or treatment effectiveness. Keep to your approved routine.' : 'Self-reported sleep and mood cannot establish immune function or fitness for duty. No readiness score is calculated.'}</div>
    </>}
  </section><section className="evidence-research"><p className="eyebrow">WHY IT MATTERS · NASA RESEARCH</p>
    {topic === 'radiation' ? <><h3>The Sun is part of the mission environment</h3><p>NASA’s DONKI catalog connects solar flares, solar energetic particle events and geomagnetic storms for research and analysis.</p><div className="research-tags"><span className="pill">DONKI</span><span className="pill">Environmental events</span></div><dl className="personal-readings"><div><dt>Bundled history</dt><dd>{weatherDays.length.toLocaleString()} daily bins</dd></div><div><dt>Coverage (UTC)</dt><dd>{weatherDays[0].date} to {weatherDays[weatherDays.length - 1].date}</dd></div><div><dt>Snapshot captured</dt><dd>{snapshot.snapshotCapturedAt.slice(0, 10)}</dd></div></dl><p className="helper">The replay is independent of the selected astronaut and today’s check-ins. Kp describes geomagnetic activity; it is not a personal radiation measurement. DONKI is provided for research and prototyping.</p><SourceLink href="https://ccmc.gsfc.nasa.gov/tools/DONKI/">NASA DONKI catalog</SourceLink><details className="research-method"><summary>Source and missing-data handling</summary><p><code>{snapshot.weather.source}</code></p><p>Daily counts are retained from the repository export. Zero-filled Kp values are displayed as “No entry.” An absent entry is never used to mark a day safe. No live feed or forecast is connected.</p></details></> : topic === 'vision' ? <><h3>Vision changes have a spaceflight context</h3><p>NASA studies eye and optic-nerve changes associated with spaceflight. Keeping a dated observation can support a conversation with the crew medical team.</p><SourceLink href="https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/">NASA: understanding SANS</SourceLink><StudyComparison study={snapshot.vision} title="Left-eye pressure in a mouse study" species="Mice · Mus musculus" unit="mmHg" explanation="These are group means of the exported left-eye average pressure metric. Eye pressure alone does not establish SANS, and mouse findings cannot diagnose a human astronaut." /></> : topic === 'movement' ? <><h3>Reduced loading changes the research question</h3><p>NASA investigates bone and muscle changes in space and exercise countermeasures. Your activity log records completed routines; the studies provide context.</p><SourceLink href="https://www.nasa.gov/humans-in-space/counteracting-bone-and-muscle-loss-in-microgravity/">NASA: bone and muscle research</SourceLink><StudyComparison study={snapshot.bone} title="Four-week bone-density change under reduced loading" species="Rats · Rattus norvegicus" unit="% from baseline" explanation="This rat partial-weight-bearing experiment compares recorded changes in trabecular bone mineral density. Loading groups are experimental conditions, not exercise targets or forecasts of your bone loss." /></> : <><h3>Recovery observations deserve a history</h3><p>NASA studies sleep and fatigue because they affect crew alertness and performance. Track the pattern in your own entries before drawing conclusions.</p><SourceLink href="https://www.nasa.gov/human-systems-integration-division/human-performance/fatigue-countermeasures-laboratory/">NASA: sleep and fatigue research</SourceLink><StudyComparison study={snapshot.blood} title="Separate research context: human blood-cell measurements" species="Humans · Homo sapiens" unit="10³ cells/µL" explanation="The local clinical dataset contains white-blood-cell measurements before and after flight. These blood tests do not measure sleep or mood. This comparison cannot infer your immune status or explain a change in your check-ins." /></>}
  </section></div>;
}

export function CompanionDemoControls({ active, scenario, day, model, onStart, onExit, onScenario, onDay }: {
  active: boolean; scenario: CompanionScenario; day: number; model: ReturnType<typeof buildCompanionDemo>;
  onStart(): void; onExit(): void; onScenario(scenario: CompanionScenario): void; onDay(day: number): void;
}) {
  return <section data-tour="demo" className={`companion-demo ${active ? 'demo-active' : ''}`} aria-label="Presentation demo">
    <div className="demo-heading"><div><span className="eyebrow">{active ? 'SYNTHETIC SCENARIO · PRESENTATION ONLY' : 'PRESENTATION MODE'}</span><h3>{active ? 'Seven days, ready to demonstrate' : 'Demonstrate a week of observations'}</h3><p>{active ? 'Sample values are invented. NASA research stays historical. No demo entries are saved or merged with your records.' : 'Load fictional sleep, exercise, fatigue and vision entries without entering daily check-ins.'}</p></div><button type="button" className={`button ${active ? 'secondary' : 'primary'}`} onClick={active ? onExit : onStart}>{!active && <Play size={16} />}{active ? 'Exit demo' : 'Start demo'}</button></div>
    {active && <><div className="demo-controls"><label className="form-field"><span>Demo scenario</span><select value={scenario} onChange={e => onScenario(e.target.value as CompanionScenario)}>{companionScenarios.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="demo-day"><span>Demo day {day} of 7</span><input type="range" min="1" max="7" step="1" value={day} onChange={e => onDay(Number(e.target.value))} aria-label="Demo day" /><span className="demo-day-labels"><small>Day 1</small><small>Day 7</small></span></label><div className="replay-step"><button type="button" className="button secondary" aria-label="Previous demo day" disabled={day === 1} onClick={() => onDay(day - 1)}><ChevronLeft size={17} /></button><button type="button" className="button secondary" aria-label="Next demo day" disabled={day === 7} onClick={() => onDay(day + 1)}><ChevronRight size={17} /></button><button type="button" className="button secondary" onClick={() => onDay(1)}>Restart</button></div></div>
      <p className="helper">{companionScenarios.find(item => item.id === scenario)!.description}</p>
      <dl className="demo-comparison" aria-label="Synthetic scenario comparison"><div><dt>Sleep vs demo day 1</dt><dd>{signed(model.sleepChangeFromStart)} h</dd></div><div><dt>Fatigue vs demo day 1</dt><dd>{signed(model.fatigueChangeFromStart)} points <small>on the 1–5 scale</small></dd></div><div><dt>Sample days shown</dt><dd>{day} of 7</dd></div></dl><p className="helper">Select the three wellness cards below to explain the sample changes and their research context. These are descriptive differences, not medical estimates or forecasts.</p>
    </>}
  </section>;
}

export function CompanionDashboard({ astronautId, records, loading, error }: { astronautId: string; records: CheckIn[]; loading: boolean; error: string }) {
  const [topic, setTopic] = useState<Topic>('radiation');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(strongestDay.date);
  const [demoActive, setDemoActive] = useState(false);
  const [demoScenario, setDemoScenario] = useState<CompanionScenario>('demanding');
  const [demoDay, setDemoDay] = useState(7);
  const [demoAnchor, setDemoAnchor] = useState(() => new Date());
  const [vision, setVision] = useState<{ observations: VisionObservation[]; loading: boolean; error: string }>({ observations: [], loading: true, error: '' });
  const panelId = useId();
  useEffect(() => {
    const restore = () => {
      try { setVision({ observations: loadVisionObservations(astronautId, window.localStorage), loading: false, error: '' }); }
      catch { setVision({ observations: [], loading: false, error: 'Saved vision observations could not be restored. Existing data was retained. Saving is disabled.' }); }
    };
    restore(); window.addEventListener('storage', restore); return () => window.removeEventListener('storage', restore);
  }, [astronautId]);
  function saveVision(status: VisionStatus) {
    const observations = saveVisionObservation(astronautId, status, window.localStorage);
    setVision({ observations, loading: false, error: '' });
  }
  const demo = buildCompanionDemo(astronautId, demoScenario, demoDay, demoAnchor);
  const summary = companionSummary(astronautId, demoActive ? demo.records : error || loading ? [] : records);
  const day = weatherDays.find(item => item.date === selectedDate) ?? strongestDay;
  const displayedVision = demoActive ? demo.vision : vision.observations;
  const latestVision = displayedVision.find(item => new Date(item.createdAt) <= new Date());
  const recordState = demoActive ? null : loading ? 'Loading…' : error ? 'Records unavailable' : null;
  const values: Record<Topic, { value: string; detail: string }> = {
    radiation: { value: `${day.flares} cataloged flares`, detail: `${utcDateLabel(day.date)} · Historical replay` },
    vision: { value: !demoActive && vision.loading ? 'Loading…' : !demoActive && vision.error ? 'Records unavailable' : latestVision ? visionLabels[latestVision.status] : 'No observations yet', detail: demoActive ? `Demo day ${demoDay} · fictional observation` : latestVision ? `Last saved ${new Date(latestVision.createdAt).toLocaleDateString()}` : 'Self-reported · saved on this device' },
    movement: { value: recordState ?? (summary.coverage ? `${summary.exerciseMinutes} min recorded` : 'No activity entries'), detail: recordState ? 'Waiting for saved history' : `${summary.coverage}/7 days recorded · ${summary.exerciseDays} with exercise` },
    recovery: { value: recordState ?? (summary.sleepAverage === null ? 'No recovery entries' : `${summary.sleepAverage.toFixed(1)} h average sleep`), detail: recordState ? 'Waiting for saved history' : summary.latest ? `Latest fatigue ${summary.latest.fatigue}/5 · stress ${summary.latest.stress}/5` : 'Sleep · fatigue · stress · mood' },
  };
  const weatherIndex = weatherDays.findIndex(item => item.date === day.date);
  const trendValues: Record<Topic, number[]> = {
    radiation: weatherDays.slice(Math.max(0, weatherIndex - 6), weatherIndex + 1).map(item => item.flares),
    movement: [...summary.week].reverse().map(item => item.exerciseMinutes),
    recovery: [...summary.week].reverse().map(item => item.sleepHours),
    vision: [],
  };
  const selected = topics.find(item => item.id === topic)!;
  return <section className="companion" aria-label="Space-health companion">
    <div className="section-heading"><div><p className="eyebrow">FOUR AREAS OF FOCUS</p><h2>Your space-health companion</h2></div><span className="pill"><BookOpen size={13} />NASA research · bundled offline</span></div>
    <p className="section-description">A closer look at your day. Open a card for observations, context and the research behind it.</p>
    <CompanionDemoControls active={demoActive} scenario={demoScenario} day={demoDay} model={demo} onStart={() => { setDemoAnchor(new Date()); setDemoDay(7); setDemoActive(true); setTopic('recovery'); }} onExit={() => setDemoActive(false)} onScenario={setDemoScenario} onDay={setDemoDay} />
    <div className="companion-cards">{topics.map(({ id, title, icon: Icon, label, hint }, index) => <button type="button" key={id} className={`panel companion-card companion-${id}`} data-tour={id === 'recovery' ? 'focus' : undefined} aria-pressed={topic === id} aria-haspopup="dialog" aria-expanded={detailsOpen && topic === id} aria-controls={panelId} onClick={() => { setTopic(id); setDetailsOpen(true); }}><span className="companion-card-top"><span className="metric-icon"><Icon size={21} /></span><span className="companion-source">{demoActive && id !== 'radiation' ? 'Synthetic demo · not saved' : label}</span><span className="focus-number">0{index + 1}</span></span><h3>{title}</h3><strong className="companion-value">{values[id].value}</strong><span className="companion-detail">{values[id].detail}</span>{id === 'vision' ? <div className="vision-track" aria-hidden="true">{displayedVision.length ? displayedVision.slice(0, 7).reverse().map(item => <span key={item.id} data-observation={item.status} />) : <span className="vision-track-empty">Your observation history starts here</span>}</div> : <CardTrend values={trendValues[id]} />}<p>{hint}</p><span className="companion-explain">Explore observations<ArrowRight size={16} /></span></button>)}</div>
    <div className="research-fieldnote"><span className="fieldnote-icon"><BookOpen size={21} /></span><div><span className="eyebrow">RESEARCH FIELD NOTES</span><h3>{selected.title}</h3><p>{topic === 'radiation' ? `${weatherSummary(day)}. Explore the historical catalog and its limits.` : 'Your observations and the study evidence, with every source in view.'}</p></div><button type="button" className="button secondary" aria-haspopup="dialog" onClick={() => setDetailsOpen(true)}>View details<ArrowRight size={16} /></button></div>
    <Modal id={panelId} open={detailsOpen} onClose={() => setDetailsOpen(false)} title={selected.title} eyebrow={demoActive && topic !== 'radiation' ? 'SYNTHETIC DEMO + NASA RESEARCH' : topic === 'radiation' ? 'HISTORICAL ENVIRONMENT · RESEARCH CONTEXT' : 'YOUR OBSERVATIONS + NASA RESEARCH'} description={selected.hint}><div className="companion-evidence"><CompanionEvidence key={`${topic}:${demoActive}`} topic={topic} summary={summary} day={day} onSelectDate={setSelectedDate} observations={displayedVision} visionLoading={!demoActive && vision.loading} visionError={demoActive ? '' : vision.error} saveVision={saveVision} recordsLoading={!demoActive && loading} recordsError={demoActive ? '' : error} demo={demoActive} /></div></Modal>
    <details className="companion-provenance"><summary>Research provenance and limits</summary><p>{snapshot.provenance}</p><p>Local snapshot captured {snapshot.snapshotCapturedAt.slice(0, 10)}. Study observations belong to research samples, not the demo crew. Your check-ins and vision observations stay in this browser. They are never joined to research participants or used to calculate a clinical risk score. External source links require internet access.</p><div className="table-scroll"><table className="data-table"><caption>Available local OSDR exports · rows are measurements, not participant counts</caption><thead><tr><th scope="col">Export</th><th scope="col">Rows</th><th scope="col">Studies</th><th scope="col">Organisms recorded</th></tr></thead><tbody>{snapshot.sources.map(source => <tr key={source.path}><th scope="row"><code>{source.path.split('/').pop()}</code></th><td>{source.rows.toLocaleString()}</td><td>{source.studies.length}</td><td>{Object.keys(source.speciesRows).join(', ')}</td></tr>)}</tbody></table></div></details>
  </section>;
}
