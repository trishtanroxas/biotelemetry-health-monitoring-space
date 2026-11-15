import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FileImage,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  SELF_EXAM_GUIDES,
  buildObservationSpeechText,
  computeObservationSpeechWeights,
  generateReferenceScanDataUrl,
  resizeImageFileToDataUrl,
  runAndSaveSelfExam,
  sliceObservationStream,
} from '../services/selfExams';
import {
  isSpeechSynthesisSupported,
  isTtsPlaybackSupported,
  preloadSpeechVoices,
  primeAudioPlayback,
  speakAssistantReply,
  stopSpeaking,
} from '../services/voiceAssistant';
import { charCountForStreamRatio } from '../pages/AIPage';
import type { ImageAssessmentRecord, SelfExamType, VitalSigns } from '../types/telemetry';

const OBSERVATION_PLACEHOLDERS: Record<SelfExamType, string> = {
  ocular_ultrasound: 'e.g., Right eye ONSD check on Day 45, mild brow pressure',
  dermal_radiation: 'e.g., Left forearm cuff check post-EVA, mild warmth',
  glucometer_nutrition: 'e.g., Fasting capillary glucose check prior to shift',
};

export function SelfExamCapture({
  astronautId,
  vitals,
  kpIndex,
  offline,
  examType,
  onExamTypeChange,
  assessments,
  onAssessmentSaved,
  onClose,
}: {
  astronautId: string;
  vitals: VitalSigns;
  kpIndex: number;
  offline: boolean;
  examType: SelfExamType;
  onExamTypeChange: (next: SelfExamType) => void;
  assessments: ImageAssessmentRecord[];
  onAssessmentSaved: (record: ImageAssessmentRecord) => void;
  onClose?: () => void;
}) {
  const guide = SELF_EXAM_GUIDES[examType];
  const [dataUrl, setDataUrl] = useState('');
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [notes, setNotes] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [latestResult, setLatestResult] = useState<ImageAssessmentRecord | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [autoRead, setAutoRead] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [streamedChars, setStreamedChars] = useState<number | undefined>(undefined);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRequestRef = useRef(0);
  const analyzeSessionRef = useRef(0);
  const mountedRef = useRef(true);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamTargetRef = useRef<{
    recordId: string;
    weights: number[];
    totalChars: number;
    initialRevealed: number;
    targetChars: number;
    revealedChars: number;
    waitingForTts: boolean;
    audioDriven: boolean;
    startedAtMs: number;
    fallbackDurationMs: number;
  } | null>(null);

  function stopStreamTimer() {
    if (streamTimerRef.current !== null) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  }

  function finishStreaming() {
    stopStreamTimer();
    const cur = streamTargetRef.current;
    if (cur && mountedRef.current) {
      setStreamedChars(cur.totalChars);
    }
    streamTargetRef.current = null;
  }

  function startStreamTimer() {
    stopStreamTimer();
    streamTimerRef.current = setInterval(() => {
      const cur = streamTargetRef.current;
      if (!cur) {
        stopStreamTimer();
        return;
      }
      if (cur.waitingForTts) return;

      if (!cur.audioDriven) {
        const elapsed = Math.max(0, performance.now() - cur.startedAtMs);
        const progressRatio = Math.min(1, elapsed / cur.fallbackDurationMs);
        const startWeight = cur.initialRevealed > 0 ? (cur.weights[cur.initialRevealed - 1] ?? 0) : 0;
        const totalWeight = cur.weights[cur.totalChars - 1] ?? cur.totalChars;
        const targetRatio =
          totalWeight > 0
            ? (startWeight + (totalWeight - startWeight) * progressRatio) / totalWeight
            : progressRatio;
        cur.targetChars = Math.max(cur.targetChars, charCountForStreamRatio(cur.weights, targetRatio));
      }

      if (cur.revealedChars < cur.targetChars) {
        const deficit = cur.targetChars - cur.revealedChars;
        const step = deficit > 8 ? Math.ceil(deficit / 4) : 1;
        cur.revealedChars = Math.min(cur.totalChars, cur.revealedChars + step);
        setStreamedChars(cur.revealedChars);
      }

      if (cur.revealedChars >= cur.totalChars && cur.targetChars >= cur.totalChars) {
        finishStreaming();
      }
    }, 24);
  }

  function startObservationStream(record: ImageAssessmentRecord, syncWithTts: boolean) {
    const { weights, introEndIdx } = computeObservationSpeechWeights(record);
    const totalChars = weights.length;
    if (totalChars === 0) {
      setStreamedChars(0);
      return;
    }

    const totalWeight = weights[totalChars - 1] || totalChars;
    const initialRevealed = syncWithTts ? 0 : introEndIdx;
    streamTargetRef.current = {
      recordId: record.id,
      weights,
      totalChars,
      initialRevealed,
      targetChars: initialRevealed,
      revealedChars: initialRevealed,
      waitingForTts: syncWithTts,
      audioDriven: false,
      startedAtMs: syncWithTts ? 0 : performance.now(),
      fallbackDurationMs: Math.max(500, Math.round(totalWeight * (syncWithTts ? 50 : 18))),
    };
    setStreamedChars(initialRevealed);
    startStreamTimer();
  }

  function stopCamera() {
    cameraRequestRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStarting(false);
    setVideoReady(false);
    setCameraOpen(false);
  }

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  useEffect(() => {
    mountedRef.current = true;
    setTtsSupported(isTtsPlaybackSupported());
    if (isSpeechSynthesisSupported()) preloadSpeechVoices();
    return () => {
      mountedRef.current = false;
      analyzeSessionRef.current++;
      stopCamera();
      stopSpeaking();
      finishStreaming();
    };
  }, []);

  useEffect(() => {
    analyzeSessionRef.current++;
    stopCamera();
    stopSpeaking();
    finishStreaming();
    setStreamedChars(undefined);
    setDataUrl('');
    setNotes('');
    setError('');
    setTtsError('');
    setSpeaking(false);
    setTtsLoading(false);
    setLatestResult(null);
  }, [astronautId]);

  async function openCamera() {
    if (cameraOpen) {
      stopCamera();
      return;
    }
    if (cameraStarting) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera capture is unavailable in this browser. Upload an image file or load a sample frame instead.');
      return;
    }
    const token = ++cameraRequestRef.current;
    setCameraStarting(true);
    setVideoReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (token !== cameraRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      if (token === cameraRequestRef.current) {
        setError('Camera permission was denied or no camera was detected. You can upload an image or load a reference scan.');
      }
    } finally {
      if (token === cameraRequestRef.current) {
        setCameraStarting(false);
      }
    }
  }

  function captureVideoFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('Wait a moment for the live camera stream to load a frame before capturing.');
      return;
    }
    const width = Math.min(640, video.videoWidth);
    const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    setDataUrl(canvas.toDataURL('image/jpeg', 0.85));
    setMimeType('image/jpeg');
    stopCamera();
  }

  function triggerImageUpload() {
    setError('');
    stopCamera();
    fileRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    stopCamera();
    const inputEl = event.target;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setError('Image exceeds 6 MB limit. Please select a smaller image.');
      return;
    }
    try {
      const resized = await resizeImageFileToDataUrl(file);
      stopCamera();
      setDataUrl(resized.dataUrl);
      setMimeType(resized.mimeType);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to process image file.');
    }
  }

  function clearAttachedImage() {
    stopSpeaking();
    setSpeaking(false);
    setTtsLoading(false);
    setTtsError('');
    finishStreaming();
    setStreamedChars(undefined);
    setDataUrl('');
    setLatestResult(null);
    setError('');
  }

  function speakObservation(record: ImageAssessmentRecord, streamFromBeginning = true) {
    const speechText = buildObservationSpeechText(record);
    if (!speechText) return;
    setTtsError('');
    setSpeaking(false);
    if (streamFromBeginning) {
      startObservationStream(record, true);
    }
    const started = speakAssistantReply(speechText, {
      preferServerAudio: true,
      onStart: meta => {
        if (!mountedRef.current) return;
        setTtsLoading(false);
        setSpeaking(true);
        const cur = streamTargetRef.current;
        if (cur && cur.recordId === record.id) {
          cur.waitingForTts = false;
          cur.startedAtMs = performance.now();
          if (meta?.durationSec && meta.durationSec > 0) {
            cur.audioDriven = true;
          }
        }
      },
      onProgress: progress => {
        const cur = streamTargetRef.current;
        if (!cur || cur.recordId !== record.id) return;
        if (progress.durationSec > 0 || progress.ratio > 0) {
          cur.waitingForTts = false;
          cur.audioDriven = true;
          cur.targetChars = Math.max(cur.targetChars, charCountForStreamRatio(cur.weights, progress.ratio));
        }
      },
      onEnd: () => {
        if (!mountedRef.current) return;
        setTtsLoading(false);
        setSpeaking(false);
        const cur = streamTargetRef.current;
        if (cur && cur.recordId === record.id) {
          cur.waitingForTts = false;
          cur.audioDriven = true;
          cur.targetChars = cur.totalChars;
        }
        finishStreaming();
      },
      onError: message => {
        if (!mountedRef.current) return;
        setTtsLoading(false);
        setSpeaking(false);
        if (message) setTtsError(message);
        const cur = streamTargetRef.current;
        if (cur && cur.recordId === record.id) {
          cur.waitingForTts = false;
          cur.audioDriven = false;
          cur.startedAtMs = performance.now();
        }
      },
    });
    setTtsLoading(started);
    if (!started) {
      const cur = streamTargetRef.current;
      if (cur && cur.recordId === record.id) {
        cur.waitingForTts = false;
        cur.audioDriven = false;
        cur.startedAtMs = performance.now();
      }
    }
  }

  function toggleSpeakLatest() {
    if (speaking || ttsLoading) {
      stopSpeaking();
      setTtsLoading(false);
      setSpeaking(false);
      finishStreaming();
      return;
    }
    if (!latestResult) return;
    speakObservation(latestResult, true);
  }

  function loadReferenceFrame() {
    setError('');
    setTtsError('');
    stopCamera();
    const refUrl = generateReferenceScanDataUrl(examType);
    setDataUrl(refUrl);
    setMimeType('image/png');
  }

  async function handleAnalyze() {
    if (cameraOpen) {
      setError('Live camera preview is active. Click Capture Frame to snapshot a photo first.');
      return;
    }
    if (!dataUrl || !dataUrl.trim()) {
      setError('Please upload an image, capture a live camera frame, or load a sample scan before analyzing.');
      return;
    }
    const token = ++analyzeSessionRef.current;
    stopSpeaking();
    setTtsLoading(false);
    setSpeaking(false);
    finishStreaming();
    setStreamedChars(undefined);
    setError('');
    setTtsError('');
    const shouldAutoSpeak = autoRead && isTtsPlaybackSupported();
    if (shouldAutoSpeak) {
      // Unlock audio element inside the Analyze button click before awaiting backend vision.
      primeAudioPlayback();
    }
    setSubmitting(true);
    try {
      const record = await runAndSaveSelfExam({
        astronautId,
        examType,
        dataUrl,
        mimeType,
        notes: notes.trim(),
        vitals,
        kpIndex,
        offline,
      });
      if (!mountedRef.current || token !== analyzeSessionRef.current) return;
      setLatestResult(record);
      onAssessmentSaved(record);
      if (shouldAutoSpeak) {
        speakObservation(record, true);
      } else {
        startObservationStream(record, false);
      }
    } catch (cause) {
      if (!mountedRef.current || token !== analyzeSessionRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Assessment could not be completed.');
    } finally {
      if (mountedRef.current && token === analyzeSessionRef.current) {
        setSubmitting(false);
      }
    }
  }

  return (
    <section className="panel self-exam-panel" aria-labelledby="self-exam-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MULTIMODAL CLINICAL CAPTURE</span>
          <h2 id="self-exam-heading">
            <Camera size={18} aria-hidden="true" />
            Camera, Ultrasound &amp; Exam Capture
          </h2>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {ttsSupported ? (
            <button
              type="button"
              className="button secondary compact-btn"
              aria-pressed={autoRead}
              onClick={() => {
                const next = !autoRead;
                setAutoRead(next);
                setTtsError('');
                if (next) {
                  preloadSpeechVoices();
                  primeAudioPlayback();
                } else {
                  stopSpeaking();
                  setTtsLoading(false);
                  setSpeaking(false);
                }
              }}
            >
              {autoRead ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
              Auto-read {autoRead ? 'on' : 'off'}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="button secondary compact-btn"
              onClick={() => {
                analyzeSessionRef.current++;
                stopCamera();
                stopSpeaking();
                onClose();
              }}
            >
              <X size={14} aria-hidden="true" />
              Hide Capture
            </button>
          ) : null}
        </div>
      </div>

      <div className="segmented exam-type-tabs" role="tablist" aria-label="Self-exam protocol">
        {(Object.keys(SELF_EXAM_GUIDES) as SelfExamType[]).map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={examType === key}
            aria-pressed={examType === key}
            onClick={() => {
              onExamTypeChange(key);
              stopSpeaking();
              setSpeaking(false);
              setTtsError('');
              finishStreaming();
              setStreamedChars(undefined);
              setLatestResult(null);
            }}
          >
            {SELF_EXAM_GUIDES[key].label}
          </button>
        ))}
      </div>

      <div className="self-exam-grid">
        <div className="self-exam-left-column">
          <div className="self-exam-guide">
            <h3>{guide.label}</h3>
            <p className="muted">{guide.subtitle}</p>
            <ol className="self-exam-steps">
              {guide.steps.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="self-exam-ref">
              <small><strong>Expected baseline:</strong> {guide.normalReference}</small>
              <small><strong>Escalate if:</strong> {guide.escalateTrigger}</small>
            </div>
          </div>

          {latestResult ? (
            <div className={`observation-alert ${latestResult.severity === 'critical' ? 'critical' : latestResult.severity === 'nominal' ? 'info' : ''}`} role="status">
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <strong>Assessment Result ({latestResult.analysisSource})</strong>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="pill">{latestResult.severity.toUpperCase()} · {latestResult.imageQuality}</span>
                  {ttsSupported ? (
                    <button
                      type="button"
                      className="button secondary compact-btn"
                      onClick={toggleSpeakLatest}
                      aria-label={speaking ? 'Stop observation readout' : ttsLoading ? 'Cancel voice synthesis' : 'Read observation aloud'}
                    >
                      {speaking || ttsLoading ? <Square size={12} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
                      {speaking ? 'Stop' : ttsLoading ? 'Synthesizing...' : 'Read Aloud'}
                    </button>
                  ) : null}
                </div>
              </div>
              {(() => {
                const stream = sliceObservationStream(latestResult, streamedChars);
                return (
                  <>
                    <p>
                      {stream.findingsText}
                      {!stream.findingsComplete && <span className="typing-cursor" aria-hidden="true" />}
                    </p>
                    {stream.showActions && (
                      <ul className="self-exam-actions-list">
                        {latestResult.recommendedActions.map(action => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    )}
                    {ttsError ? <small className="warning-text">{ttsError}</small> : null}
                    {stream.showConsult && (
                      latestResult.groundConsultRequired ? (
                        <small className="warning-text">Ground Flight Surgeon review recommended at next comms pass.</small>
                      ) : (
                        <small className="success-text"><CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true" /> Recorded cleanly on device history.</small>
                      )
                    )}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>

        <div className="self-exam-capture-box">
          <div className="self-exam-controls">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
            />
            <button type="button" className="button secondary compact-btn" onClick={triggerImageUpload}>
              <Upload size={14} aria-hidden="true" />
              Upload Image / Scan
            </button>
            <button
              type="button"
              className={`button ${cameraOpen ? 'primary' : 'secondary'} compact-btn`}
              onClick={openCamera}
              disabled={cameraStarting}
              aria-pressed={cameraOpen}
            >
              <Camera size={14} aria-hidden="true" />
              {cameraStarting ? 'Opening Camera...' : cameraOpen ? 'Stop Camera' : 'Live Camera'}
            </button>
            <button type="button" className="button secondary compact-btn" onClick={loadReferenceFrame}>
              <FileImage size={14} aria-hidden="true" />
              Load Sample Scan
            </button>
          </div>

          {cameraOpen ? (
            <>
              <div className="self-exam-preview">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => setVideoReady(true)}
                  onPlaying={() => setVideoReady(true)}
                />
              </div>
              <div className="self-exam-camera-actions">
                <button
                  type="button"
                  className="button primary compact-btn"
                  disabled={!videoReady}
                  onClick={captureVideoFrame}
                >
                  Capture Frame
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  {videoReady ? 'Live viewfinder active — capture when ready, or upload an image.' : 'Starting camera stream...'}
                </span>
              </div>
            </>
          ) : dataUrl ? (
            <>
              <div className="self-exam-preview">
                <img src={dataUrl} alt={`${guide.label} captured frame`} />
              </div>
              <div className="self-exam-camera-actions">
                <span className="muted" style={{ fontSize: 12 }}>
                  Image attached and ready for analysis.
                </span>
                <button type="button" className="button secondary compact-btn" onClick={clearAttachedImage}>
                  Clear Image
                </button>
              </div>
            </>
          ) : (
            <p className="helper">Attach a B-mode ultrasound image, cabin skin photograph, or glucometer snapshot (optional: can also log checklist observation directly).</p>
          )}

          <label className="form-field self-exam-notes">
            <span>Observation notes (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={OBSERVATION_PLACEHOLDERS[examType]}
            />
          </label>

          {error ? <div className="error-box" role="alert">{error}</div> : null}

          {(() => {
            const hasImage = Boolean(dataUrl && dataUrl.trim().length > 0);
            return (
              <button
                type="button"
                className="button primary"
                disabled={submitting || !hasImage}
                title={!hasImage ? 'Upload an image, load a sample scan, or capture a live camera frame to enable analysis' : undefined}
                onClick={handleAnalyze}
              >
                <Sparkles size={15} aria-hidden="true" />
                {submitting ? 'Analyzing frame & saving...' : 'Analyze & Save Exam'}
              </button>
            );
          })()}
        </div>
      </div>


      {assessments.length > 0 ? (
        <details className="disclosure">
          <summary>Recent Self-Exam History ({assessments.length})</summary>
          <div className="disclosure-content">
            <ul className="observation-list">
              {assessments.slice(0, 4).map(item => (
                <li key={item.id}>
                  <div className="row">
                    <strong>{SELF_EXAM_GUIDES[item.examType]?.label ?? item.examType}</strong>
                    <span className="pill">{item.severity}</span>
                  </div>
                  <p>{item.findings}</p>
                  <small>{new Date(item.recordedAt).toLocaleString()} · {item.analysisSource}</small>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </section>
  );
}
