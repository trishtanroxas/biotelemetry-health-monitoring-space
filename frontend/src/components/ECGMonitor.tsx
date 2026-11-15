import { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';

interface ECGMonitorProps {
  ecgSamples?: number[];
  heartRate: number;
  telemetrySource?: 'simulated' | 'measured' | 'manual';
  sampleRateHz?: number;
  orbitalPhase?: string;
  compact?: boolean;
}

const synthesizeSample = (phase: number) =>
  0.07 * Math.exp(-((phase - 0.19) ** 2) / 0.001) -
  0.12 * Math.exp(-((phase - 0.37) ** 2) / 0.0002) +
  1.15 * Math.exp(-((phase - 0.4) ** 2) / 0.00012) -
  0.26 * Math.exp(-((phase - 0.43) ** 2) / 0.0002) +
  0.17 * Math.exp(-((phase - 0.65) ** 2) / 0.003);

export function ECGMonitor({
  ecgSamples,
  heartRate,
  telemetrySource = 'simulated',
  sampleRateHz = 100,
  orbitalPhase,
  compact = false,
}: ECGMonitorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buffer = useRef<number[]>([]);
  const pulse = useRef(heartRate);
  const sourceRef = useRef(telemetrySource);
  const rateRef = useRef(sampleRateHz);
  const phaseRef = useRef(0);

  useEffect(() => { pulse.current = heartRate; }, [heartRate]);
  useEffect(() => { sourceRef.current = telemetrySource; }, [telemetrySource]);
  useEffect(() => { rateRef.current = Math.max(50, sampleRateHz); }, [sampleRateHz]);
  useEffect(() => {
    if (sourceRef.current === 'measured') {
      // BLE provides BPM/RR intervals, not raw ECG voltage; clear buffered sim trace so synthesis tracks live BPM
      buffer.current = [];
      return;
    }
    if (ecgSamples?.length) {
      buffer.current = [...buffer.current, ...ecgSamples].slice(-360);
    }
  }, [ecgSamples]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = performance.now();
    let sampleAccumulator = 0;
    const history = Array.from({ length: 800 }, (_, i) => synthesizeSample((i / 150) % 1));

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        last = performance.now();
        buffer.current = buffer.current.slice(-120);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    function draw(time: number) {
      if (!canvas || !ctx) return;
      const dtSec = Math.min(0.1, Math.max(0, (time - last) / 1000));
      last = time;

      if (!reduced.matches && document.visibilityState === 'visible') {
        sampleAccumulator += dtSec * rateRef.current;
        const steps = Math.min(8, Math.floor(sampleAccumulator));
        sampleAccumulator -= steps;
        const stepDt = 1 / rateRef.current;
        for (let i = 0; i < steps; i++) {
          history.shift();
          const useApiBuffer = sourceRef.current !== 'measured' && buffer.current.length > 0;
          if (useApiBuffer) {
            history.push(buffer.current.shift()!);
          } else {
            phaseRef.current = (phaseRef.current + (pulse.current / 60) * stepDt) % 1;
            history.push(synthesizeSample(phaseRef.current));
          }
        }
      }

      // Match canvas bitmap size to rendered CSS box so grid cells and QRS slopes stay 1:1 on narrow viewports.
      const targetW = Math.max(240, Math.min(800, Math.round(canvas.clientWidth || 800)));
      const targetH = Math.max(96, Math.min(220, Math.round(canvas.clientHeight || 164)));
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;

      const styles = getComputedStyle(canvas);
      ctx.fillStyle = styles.getPropertyValue('--canvas-bg');
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.strokeStyle = styles.getPropertyValue('--chart-grid');
      ctx.lineWidth = 1;
      for (let x = 0; x < targetW; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, targetH); ctx.stroke(); }
      for (let y = 0; y < targetH; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(targetW, y); ctx.stroke(); }
      ctx.strokeStyle = styles.getPropertyValue('--accent');
      ctx.lineWidth = 2;
      const visibleSamples = history.slice(-targetW);
      const baselineY = targetH * 0.61;
      const ampScale = targetH * 0.36;
      ctx.beginPath();
      visibleSamples.forEach((value, i) => {
        const y = baselineY - value * ampScale;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      });
      ctx.stroke();

      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const badgeLabel =
    telemetrySource === 'measured'
      ? 'MEASURED · BLE R-R'
      : ecgSamples?.length
        ? 'NASA-CALIBRATED SIM'
        : 'OFFLINE SIM';

  return (
    <section className={compact ? 'ecg-panel compact' : 'panel ecg-panel'}>
      {compact ? (
        <div className="ecg-compact-head">
          <span className="eyebrow"><Activity size={13} /> Lead-II ECG Waveform</span>
          <span className="pill"><span className="status-dot" />{badgeLabel}</span>
        </div>
      ) : (
        <div className="section-heading">
          <h2><Activity size={19} />ECG waveform</h2>
          <span className="pill"><span className="status-dot" />{badgeLabel}</span>
        </div>
      )}
      <div className="ecg-canvas">
        <canvas
          ref={canvasRef}
          width={800}
          height={180}
          role="img"
          aria-label={`Illustrative ECG waveform. Heart rate ${heartRate} beats per minute (${badgeLabel}). Not a diagnostic trace.`}
        />
        <div className="ecg-label">
          {telemetrySource === 'measured' ? 'SYNTHESIZED FROM LIVE BLE R-R' : 'NASA OSDR / ORBITAL LEAD-II TRACE'}
          {orbitalPhase ? ` · ${orbitalPhase.replace('_', ' ').toUpperCase()}` : ''}
        </div>
      </div>
      <div className="ecg-footer">
        <span>{telemetrySource === 'measured' ? 'Live Bluetooth HR · illustrative trace' : 'NASA-calibrated simulation · not a diagnostic trace'}</span>
        <span><Activity size={14} />{heartRate} bpm</span>
      </div>
    </section>
  );
}
