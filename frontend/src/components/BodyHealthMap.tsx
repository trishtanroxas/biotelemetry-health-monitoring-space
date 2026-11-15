import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Camera,
  MessageSquareHeart,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import {
  evaluateBodySystems,
  type BodyRegionAssessment,
  type BodySystemId,
  type OrganStatus,
} from '../services/bodyHealthModel';
import type { CameraPresetRequest } from './BodyAnatomy3D';
import type BodyAnatomy3DType from './BodyAnatomy3D';
import type { SelfExamType, VitalSigns } from '../types/telemetry';
import type { CheckIn, MissionCompletion } from '../types/wellness';

const STATUS_LABELS: Record<OrganStatus, string> = {
  nominal: 'Nominal',
  warning: 'Attention',
  critical: 'Critical',
};

const REGION_VIEW_ANGLES: Record<BodySystemId, { azimuthDeg: number; targetY: number }> = {
  neuro_ocular: { azimuthDeg: 14, targetY: 0.14 },
  cardiovascular: { azimuthDeg: 18, targetY: 0.06 },
  respiratory: { azimuthDeg: -18, targetY: 0.08 },
  metabolic: { azimuthDeg: 14, targetY: 0.02 },
  musculoskeletal: { azimuthDeg: 148, targetY: -0.06 },
  dermal_immune: { azimuthDeg: -42, targetY: 0.02 },
};

export function BodyHealthMap({
  vitals,
  latestCheckIn,
  completions,
  kpIndex,
  onOpenSelfExam,
  onAskAi,
}: {
  vitals: VitalSigns;
  latestCheckIn?: CheckIn | null;
  completions: MissionCompletion[];
  kpIndex: number;
  onOpenSelfExam: (examType: SelfExamType) => void;
  onAskAi: (system: BodyRegionAssessment) => void;
}) {
  const systems = useMemo(
    () => evaluateBodySystems({ vitals, latestCheckIn, completions, kpIndex }),
    [vitals, latestCheckIn, completions, kpIndex],
  );
  const [selectedId, setSelectedId] = useState<BodySystemId>('neuro_ocular');
  const [imgAvailable, setImgAvailable] = useState(true);
  const [webglReady, setWebglReady] = useState(false);
  const [presetRequest, setPresetRequest] = useState<CameraPresetRequest | null>(null);
  const [Anatomy3DComp, setAnatomy3DComp] = useState<ComponentType<React.ComponentProps<typeof BodyAnatomy3DType>> | null>(null);

  const pinRefs = useRef<Partial<Record<BodySystemId, HTMLButtonElement | null>>>({});
  const azimuthLabelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    // Dynamically load Three.js viewer only in the browser so SSR and Node tests stay decoupled from WebGL
    void import('./BodyAnatomy3D')
      .then(mod => {
        if (!cancelled) setAnatomy3DComp(() => mod.default);
      })
      .catch(() => {
        if (!cancelled) setWebglReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleWebglReady = useCallback((ready: boolean) => {
    setWebglReady(ready);
  }, []);

  const triggerPreset = useCallback((preset: Omit<CameraPresetRequest, 'seq'>) => {
    setPresetRequest({ ...preset, seq: Date.now() + Math.random() });
  }, []);

  const selectRegion = useCallback((id: BodySystemId, glideCamera = true) => {
    setSelectedId(id);
    if (glideCamera) {
      const target = REGION_VIEW_ANGLES[id];
      triggerPreset({ azimuthDeg: target.azimuthDeg, targetY: target.targetY });
    }
  }, [triggerPreset]);

  const active = systems.find(s => s.id === selectedId) ?? systems[0];
  const flaggedCount = systems.filter(s => s.status !== 'nominal').length;

  return (
    <section className="panel body-map-panel" aria-labelledby="body-map-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ANATOMICAL ASSESSMENT</span>
          <h2 id="body-map-heading">
            <Stethoscope size={18} aria-hidden="true" />
            Interactive Crew Body Map
          </h2>
        </div>
        <span className={`pill ${flaggedCount > 0 ? 'alert-pill-warning' : ''}`}>
          {flaggedCount > 0 ? `${flaggedCount} system${flaggedCount > 1 ? 's' : ''} flagged` : 'All 6 systems nominal'}
        </span>
      </div>

      <div className="body-map-layout">
        <div className="body-figure-column">
          <div
            className={`body-stage ${webglReady ? 'body-stage-3d-active' : ''}`}
            role="group"
            aria-label="Interactive 3D astronaut anatomical body map"
          >
            {!webglReady && (
              imgAvailable ? (
                <img
                  src="/branding/human-anatomy.jpg"
                  alt="Realistic translucent human anatomy diagram highlighting neurological, cardiac, respiratory, metabolic, musculoskeletal, and dermal regions"
                  className="body-anatomy-img"
                  loading="eager"
                  decoding="async"
                  onError={() => setImgAvailable(false)}
                />
              ) : (
                <div className="body-anatomy-fallback">Anatomical figure unavailable. Use region selectors below.</div>
              )
            )}

            {Anatomy3DComp && (
              <Anatomy3DComp
                systems={systems}
                selectedId={active.id}
                onSelect={id => selectRegion(id, false)}
                heartRate={vitals.heart_rate}
                respirationRate={vitals.respiration_rate ?? 15}
                presetRequest={presetRequest}
                pinRefs={pinRefs}
                azimuthLabelRef={azimuthLabelRef}
                onWebglReady={handleWebglReady}
              />
            )}

            <div className="body-3d-hud-top">
              <span ref={azimuthLabelRef} className="body-3d-angle" aria-live="off">13 deg</span>
            </div>

            <div className="body-hotspots-layer">
              {systems.map(region => {
                const isSelected = region.id === active.id;
                const tagSide = region.cx < 50 ? 'tag-left' : 'tag-right';
                return (
                  <button
                    key={region.id}
                    ref={el => {
                      pinRefs.current[region.id] = el;
                    }}
                    type="button"
                    data-side={region.cx >= 50 ? 'right' : 'left'}
                    style={webglReady ? undefined : { left: `${region.cx}%`, top: `${region.cy}%` }}
                    aria-label={`${region.label}: ${STATUS_LABELS[region.status]}`}
                    aria-pressed={isSelected}
                    className={`body-pin status-${region.status} ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectRegion(region.id, false)}
                  >
                    <span className="body-pin-ring" aria-hidden="true" />
                    <span className="body-pin-core" aria-hidden="true" />
                    {isSelected && (
                      <span className={`body-pin-tag ${tagSide}`}>
                        {region.shortLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="body-region-pills" role="group" aria-label="Body regions">
            {systems.map(region => (
              <button
                key={region.id}
                type="button"
                className={`body-region-btn status-${region.status}`}
                aria-pressed={region.id === active.id}
                onClick={() => selectRegion(region.id, true)}
              >
                <span className="status-dot" aria-hidden="true" />
                <span>{region.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="body-inspector" aria-live="polite">
          <div className="body-inspector-head">
            <div>
              <h3>{active.label}</h3>
              <p className="body-inspector-metric">{active.primaryMetric}</p>
            </div>
            <span className={`pill body-status-pill ${active.status}`}>
              {STATUS_LABELS[active.status]}
            </span>
          </div>

          <dl className="body-inspector-facts">
            <div>
              <dt>Function</dt>
              <dd>{active.functionSummary}</dd>
            </div>
            <div>
              <dt>Spaceflight Hazard</dt>
              <dd>{active.spaceHazardEffect}</dd>
            </div>
            <div>
              <dt>Self-Exam Check</dt>
              <dd>{active.selfExamStep}</dd>
            </div>
          </dl>

          <div className="body-countermeasures">
            <span className="eyebrow">COUNTERMEASURES &amp; ACTIONS</span>
            <ul>
              {active.countermeasures.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="body-inspector-actions">
            {active.linkedExam ? (
              <button
                type="button"
                className="button primary compact-btn"
                onClick={() => onOpenSelfExam(active.linkedExam!)}
              >
                <Camera size={15} aria-hidden="true" />
                Run Guided Self-Exam
              </button>
            ) : null}
            <button
              type="button"
              className="button secondary compact-btn"
              onClick={() => onAskAi(active)}
            >
              {active.status === 'nominal' ? (
                <MessageSquareHeart size={15} aria-hidden="true" />
              ) : (
                <ShieldAlert size={15} aria-hidden="true" />
              )}
              Ask Flight Surgeon AI
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
