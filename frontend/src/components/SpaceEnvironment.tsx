import type { CheckIn } from '../types/wellness';
import type { VitalSigns } from '../types/telemetry';
import type { EnvironmentDatum, SpaceEnvironment } from '../types/spaceWellness';
import type { IssLiveFeed, SpaceWeatherSnapshot } from '../types/spaceWeather';
import { durationLabel, sourceLabels } from '../services/environment';
import { SpaceWeatherVisualizer } from './SpaceWeatherVisualizer';

export function EnvironmentValue({ label, datum, unit = '', duration = false }: { label: string; datum: EnvironmentDatum<number | string>; unit?: string; duration?: boolean }) {
  return <div className="environment-reading"><dt>{label}</dt><dd>{datum.value === null ? 'Not available' : duration && typeof datum.value === 'number' ? durationLabel(datum.value) : `${datum.value}${unit ? ` ${unit}` : ''}`}<span className={`pill source-${datum.source}`}>{sourceLabels[datum.source]}</span></dd><p>{datum.detail}</p></div>;
}

export function EnvironmentReadings({ context }: { context: SpaceEnvironment }) {
  return <dl className="environment-readings"><EnvironmentValue label="Cabin oxygen" datum={context.cabinOxygen} unit="%" /><EnvironmentValue label="Environmental radiation rate" datum={context.radiationRate} unit="μSv/h" /><EnvironmentValue label="Mission duration" datum={context.missionDurationHours} duration /><EnvironmentValue label="Gravity / mission type" datum={context.gravity} /><EnvironmentValue label="Time in microgravity (scenario)" datum={context.microgravityHours} duration /><EnvironmentValue label="Space weather" datum={context.spaceWeather} /></dl>;
}

export function SpaceEnvironmentPanel({
  context,
  records = [],
  vitals,
  spaceWeatherSnapshot = null,
  issFeed = null,
  spaceWeatherLoading = false,
  realtimeConnected = false,
  offline = false,
  onRefreshSpaceWeather,
  onRefreshIss,
  hideScenarioControls = false,
}: {
  context?: SpaceEnvironment;
  records?: CheckIn[];
  vitals?: Pick<VitalSigns, 'iss_latitude' | 'iss_longitude' | 'iss_altitude_km' | 'orbital_phase' | 'iss_coord_source' | 'radiation_rate' | 'iss_velocity_kms'>;
  spaceWeatherSnapshot?: SpaceWeatherSnapshot | null;
  issFeed?: IssLiveFeed | null;
  spaceWeatherLoading?: boolean;
  realtimeConnected?: boolean;
  offline?: boolean;
  onRefreshSpaceWeather?: () => void;
  onRefreshIss?: () => void;
  hideScenarioControls?: boolean;
}) {
  const scoped = context ? records.filter(record => record.astronautId === context.astronautId) : [];
  const weatherVisualizer = (
    <SpaceWeatherVisualizer
      snapshot={spaceWeatherSnapshot}
      vitals={vitals}
      issFeed={issFeed}
      offline={offline}
      realtimeConnected={realtimeConnected}
      loading={spaceWeatherLoading}
      onRefresh={onRefreshSpaceWeather}
      onRefreshIss={onRefreshIss}
    />
  );

  return (
    <section className="panel space-environment-panel" aria-labelledby="space-env-heading">
      <div className="section-heading">
        <h2 id="space-env-heading">Space Environment, Live DONKI &amp; NOAA Feed</h2>
        <span className="pill">{offline ? 'Offline cache' : realtimeConnected ? 'Supabase Realtime' : 'Live sync'}</span>
      </div>
      <p className="helper">
        ISS orbital radiation zone, NASA CCMC DONKI space-weather feed, and live NOAA SWPC WSA-ENLIL telemetry.
      </p>

      {!hideScenarioControls && context && (
        <>
          <EnvironmentReadings context={context} />
          <p className="helper">An environmental radiation rate is not an astronaut’s personal accumulated dose. No safety level or personal exposure is inferred.</p>
        </>
      )}

      {hideScenarioControls ? weatherVisualizer : (
        <div className="open-subsection">
          <h3>Live DONKI &amp; NOAA Space-Weather Visualization</h3>
          {weatherVisualizer}
        </div>
      )}

      {!hideScenarioControls && (
        <div className="open-subsection">
          <h3>Why exercise and monitoring matter</h3>
          <p className="helper">In microgravity, muscles and bones experience different loading than on Earth. Exercise and health monitoring help mission teams support crew function over time. Follow your approved routine; this prototype does not estimate muscle or bone loss.</p>
          <p className="helper">{scoped.length ? `Your ${scoped.length} saved check-in(s) record ${scoped.reduce((sum, record) => sum + record.exerciseMinutes, 0)} total completed exercise minutes. These records do not establish a medical outcome.` : 'No exercise check-ins are saved for this astronaut yet.'}</p>
          <a className="text-link" href="#missions">Review Daily Activities</a>
          <a className="text-link source-link" href="https://www.nasa.gov/directorates/esdmd/hhp/exercise-physiology-and-countermeasures/" target="_blank" rel="noreferrer">NASA: exercise and monitoring</a>
        </div>
      )}
    </section>
  );
}
