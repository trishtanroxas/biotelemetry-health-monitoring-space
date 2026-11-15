import { synthesizeAssistantSpeechApi, transcribeSpeechAudioApi } from './api';

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex?: number;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onsoundend?: (() => void) | null;
  onaudioend?: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

export interface VoiceDictationCallbacks {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  onProcessing?: (busy: boolean) => void;
  transcribeAudio?: (audioBase64: string, mimeType: string) => Promise<string>;
  silenceTimeoutMs?: number;
}

export const VOICE_SILENCE_DELAY_MS = 3000;

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const MAX_RECORD_MS = 20000;
const MAX_RECORD_BYTES = 4_000_000;
const PREFERRED_RECORDER_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

let speechApiBlocked = false;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function getMediaRecorderCtor(): typeof MediaRecorder | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as { MediaRecorder?: typeof MediaRecorder };
  if (typeof win.MediaRecorder === 'function') return win.MediaRecorder;
  if (typeof globalThis.MediaRecorder === 'function') return globalThis.MediaRecorder;
  return null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    getMediaRecorderCtor() !== null
  );
}

export function isVoiceDictationSupported(): boolean {
  return isSpeechRecognitionSupported() || isMediaRecorderSupported();
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function supportsAudioPlayback(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.Audio !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

export function isTtsPlaybackSupported(): boolean {
  return isSpeechSynthesisSupported() || supportsAudioPlayback();
}

export function pickRecorderMimeType(
  isTypeSupported?: (mime: string) => boolean,
): string {
  if (typeof isTypeSupported !== 'function') return '';
  for (const mime of PREFERRED_RECORDER_MIMES) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      // Ignore broken browser isTypeSupported checks.
    }
  }
  return '';
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Failed to encode recorded audio.'));
      reader.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatRecorderAccessError(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone permission denied. Allow microphone access or type your question.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone device was found on this system.';
  }
  if (name === 'NotReadableError') {
    return 'Microphone is busy or unavailable in another application.';
  }
  return 'Could not access microphone. Allow microphone access or type your question.';
}

function startRecorderDictation(callbacks: VoiceDictationCallbacks): { stop: () => void } | null {
  const RecorderCtor = getMediaRecorderCtor();
  if (!isMediaRecorderSupported() || !RecorderCtor) {
    callbacks.onError?.('Voice dictation is not supported in this browser.');
    return null;
  }
  if (!callbacks.transcribeAudio && typeof navigator !== 'undefined' && navigator.onLine === false) {
    callbacks.onError?.('Voice dictation is unavailable while offline. Type your question instead.');
    return null;
  }

  const silenceTimeoutMs = callbacks.silenceTimeoutMs ?? VOICE_SILENCE_DELAY_MS;
  let stopped = false;
  let cancelledBeforeStart = false;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let volumeCheckInterval: ReturnType<typeof setInterval> | null = null;
  let audioContext: AudioContext | null = null;
  let hadVoiceInput = false;
  const chunks: BlobPart[] = [];

  const clearSilenceTimer = () => {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const releaseMedia = () => {
    clearSilenceTimer();
    if (volumeCheckInterval !== null) {
      clearInterval(volumeCheckInterval);
      volumeCheckInterval = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try {
        void audioContext.close();
      } catch {
        // Ignore audio context close errors.
      }
      audioContext = null;
    }
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    if (stream) {
      try {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      } catch {
        // Ignore stream cleanup failures.
      }
      stream = null;
    }
  };

  const stopRecording = () => {
    if (stopped) return;
    stopped = true;
    clearSilenceTimer();
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        releaseMedia();
        callbacks.onEnd?.();
      }
      return;
    }
    cancelledBeforeStart = true;
    releaseMedia();
    callbacks.onEnd?.();
  };

  const resetSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (stopped) return;
      if (!hadVoiceInput) {
        stopRecording();
        callbacks.onError?.('No speech detected. Speak clearly and try again.');
        return;
      }
      stopRecording();
    }, silenceTimeoutMs);
  };

  const beginCapture = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledBeforeStart || stopped) {
        try {
          for (const track of mediaStream.getTracks()) track.stop();
        } catch {
          // Ignore track stop errors after early cancel.
        }
        return;
      }
      stream = mediaStream;

      const selectedMime = pickRecorderMimeType(
        typeof RecorderCtor.isTypeSupported === 'function'
          ? mime => RecorderCtor.isTypeSupported(mime)
          : undefined,
      );
      recorder = selectedMime
        ? new RecorderCtor(mediaStream, { mimeType: selectedMime })
        : new RecorderCtor(mediaStream);

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = () => {
        releaseMedia();
        callbacks.onProcessing?.(false);
        callbacks.onError?.('Could not record audio from microphone.');
      };

      recorder.onstop = async () => {
        const finalMime = recorder?.mimeType || selectedMime || 'audio/webm';
        releaseMedia();
        const audioBlob = new Blob(chunks, { type: finalMime });
        if (chunks.length === 0 || audioBlob.size === 0) {
          callbacks.onError?.('No speech captured. Hold for a moment and try again.');
          return;
        }
        if (audioBlob.size > MAX_RECORD_BYTES) {
          callbacks.onError?.('Recorded clip is too large. Keep voice questions under 20 seconds.');
          return;
        }
        callbacks.onProcessing?.(true);
        try {
          const base64 = await blobToBase64(audioBlob);
          const transcribe = callbacks.transcribeAudio
            ? callbacks.transcribeAudio
            : async (audioB64: string, mime: string) => {
              const res = await transcribeSpeechAudioApi(audioB64, mime);
              return res.transcript;
            };
          const transcript = (await transcribe(base64, finalMime)).trim();
          callbacks.onProcessing?.(false);
          if (transcript) {
            callbacks.onFinal(transcript);
            callbacks.onEnd?.();
          } else {
            callbacks.onError?.('No speech detected. Speak clearly and try again.');
          }
        } catch (cause) {
          callbacks.onProcessing?.(false);
          const msg =
            cause instanceof Error && cause.message
              ? cause.message
              : 'Could not transcribe recorded audio. Type your question instead.';
          callbacks.onError?.(msg);
        }
      };

      maxTimer = setTimeout(() => {
        stopRecording();
      }, MAX_RECORD_MS);

      recorder.start();
      callbacks.onInterim?.('Recording audio... Click microphone again to transcribe.');
      resetSilenceTimer();

      try {
        const AudioCtx =
          typeof window !== 'undefined'
            ? window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
            : null;
        if (AudioCtx) {
          audioContext = new AudioCtx();
          const source = audioContext.createMediaStreamSource(mediaStream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const buffer = new Uint8Array(analyser.frequencyBinCount);
          volumeCheckInterval = setInterval(() => {
            if (stopped) return;
            analyser.getByteFrequencyData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) sum += buffer[i];
            const avg = sum / buffer.length;
            if (avg > 14) {
              hadVoiceInput = true;
              resetSilenceTimer();
            }
          }, 100);
        }
      } catch {
        // AudioContext optional for environments lacking web audio permissions.
      }
    } catch (cause) {
      releaseMedia();
      if (!cancelledBeforeStart) {
        callbacks.onError?.(formatRecorderAccessError(cause));
      }
    }
  };

  void beginCapture();
  return { stop: stopRecording };
}

export function startVoiceDictation(callbacks: VoiceDictationCallbacks): { stop: () => void } | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor || speechApiBlocked) {
    return startRecorderDictation(callbacks);
  }

  const silenceTimeoutMs = callbacks.silenceTimeoutMs ?? VOICE_SILENCE_DELAY_MS;
  const recognition = new Ctor();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  let finished = false;
  let cancelled = false;
  let fallbackHandle: { stop: () => void } | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let hadVoiceInput = false;
  let accumulatedFinal = '';
  let currentInterim = '';
  let finalEmitted = false;

  const clearSilenceTimer = () => {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const emitFinalTranscript = () => {
    if (finalEmitted) return;
    const finalTranscript = [accumulatedFinal, currentInterim].filter(Boolean).join(' ').trim();
    if (finalTranscript) {
      finalEmitted = true;
      callbacks.onFinal(finalTranscript);
    }
  };

  const detachRecognition = () => {
    clearSilenceTimer();
    recognition.onaudiostart = null;
    recognition.onsoundstart = null;
    recognition.onspeechstart = null;
    recognition.onspeechend = null;
    recognition.onsoundend = null;
    recognition.onaudioend = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort?.();
    } catch {
      // Ignore abort errors during fallback switch.
    }
  };

  const resetSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (finished || cancelled) return;
      if (!hadVoiceInput && !accumulatedFinal.trim() && !currentInterim.trim()) {
        finished = true;
        detachRecognition();
        callbacks.onError?.('No speech detected. Hold steady and try again.');
        callbacks.onEnd?.();
        return;
      }
      try {
        recognition.stop();
      } catch {
        // Ignore stop error if recognition already ended.
      }
      emitFinalTranscript();
      if (!finished) {
        finished = true;
        callbacks.onEnd?.();
      }
    }, silenceTimeoutMs);
  };

  recognition.onaudiostart = () => resetSilenceTimer();
  recognition.onsoundstart = () => {
    hadVoiceInput = true;
    resetSilenceTimer();
  };
  recognition.onspeechstart = () => {
    hadVoiceInput = true;
    resetSilenceTimer();
  };
  recognition.onspeechend = () => resetSilenceTimer();
  recognition.onsoundend = () => resetSilenceTimer();

  recognition.onresult = event => {
    hadVoiceInput = true;
    let finalPart = '';
    let interimPart = '';
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result?.[0]?.transcript ?? '';
      if (result.isFinal) finalPart += (finalPart ? ' ' : '') + transcript.trim();
      else interimPart += (interimPart ? ' ' : '') + transcript.trim();
    }
    if (finalPart) accumulatedFinal = finalPart.trim();
    currentInterim = interimPart.trim();
    const displayInterim = currentInterim || accumulatedFinal;
    if (displayInterim) callbacks.onInterim?.(displayInterim);
    resetSilenceTimer();
  };

  recognition.onerror = event => {
    const code = event?.error || 'unknown';
    if (code === 'not-allowed') {
      finished = true;
      clearSilenceTimer();
      callbacks.onError?.('Microphone permission denied. Allow microphone access or type your question.');
      return;
    }
    if ((code === 'network' || code === 'service-not-allowed') && !cancelled && !fallbackHandle) {
      clearSilenceTimer();
      const offlineWithoutCustomStt =
        !callbacks.transcribeAudio && typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isMediaRecorderSupported() && !offlineWithoutCustomStt) {
        speechApiBlocked = true;
        finished = true;
        detachRecognition();
        fallbackHandle = startRecorderDictation(callbacks);
        return;
      }
      finished = true;
      callbacks.onError?.(
        offlineWithoutCustomStt
          ? 'Speech recognition service unreachable while offline. Type your question instead.'
          : 'Speech recognition service unreachable. Type your question instead.',
      );
      return;
    }
    clearSilenceTimer();
    if (code === 'no-speech') {
      callbacks.onError?.('No speech detected. Hold steady and try again.');
    } else if (code !== 'aborted') {
      callbacks.onError?.('Voice dictation interrupted. You can type your question.');
    }
  };

  recognition.onend = () => {
    clearSilenceTimer();
    if (!finished && !fallbackHandle) {
      finished = true;
      emitFinalTranscript();
      callbacks.onEnd?.();
    }
  };

  try {
    recognition.start();
    resetSilenceTimer();
  } catch {
    clearSilenceTimer();
    if (isMediaRecorderSupported()) {
      speechApiBlocked = true;
      return startRecorderDictation(callbacks);
    }
    callbacks.onError?.('Could not start microphone capture.');
    return null;
  }

  return {
    stop() {
      if (fallbackHandle) {
        fallbackHandle.stop();
        return;
      }
      if (finished || cancelled) return;
      cancelled = true;
      finished = true;
      clearSilenceTimer();
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors if recognition already halted.
      }
      emitFinalTranscript();
      callbacks.onEnd?.();
    },
  };
}

const SPEECH_START_TIMEOUT_MS = 2200;
const SPEECH_CHUNK_MAX_CHARS = 170;
const CANCEL_SETTLE_DELAY_MS = 60;
const VOICE_PROBE_TIMEOUT_MS = 120;
const PRELOAD_PROBE_TIMEOUT_MS = 150;
const AUDIO_PROGRESS_INTERVAL_MS = 45;
const TTS_BLOB_CACHE_MAX_ENTRIES = 16;
const MAX_TTS_REQUEST_CHARS = 1450;
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRjgAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

let activeSessionId = 0;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let startWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
let voicesCleanup: (() => void) | null = null;
let activeAudio: HTMLAudioElement | null = null;
let primedAudio: HTMLAudioElement | null = null;
let primedPlayPromise: Promise<void> | null = null;
let activeAudioUrl: string | null = null;
let activeTtsAbort: AbortController | null = null;
let audioProgressTimer: ReturnType<typeof setInterval> | null = null;
let voicesProbeSettled = false;
let preloadTimer: ReturnType<typeof setTimeout> | null = null;
let preloadCleanup: (() => void) | null = null;
const ttsBlobCache = new Map<string, Blob>();

export interface BackgroundAlertCallbacks {
  tag?: string;
  alertKeys?: string[];
  onStart?: () => void;
  onEnd?: () => void;
  onBlocked?: () => void;
  fetchAudio?: (text: string, signal: AbortSignal) => Promise<Blob>;
}

interface QueuedAlertItem {
  text: string;
  tag: string;
  alertKeys: string[];
  callbacks?: BackgroundAlertCallbacks;
}

let activeAlertSessionId = 0;
let activeAlertAudio: HTMLAudioElement | null = null;
let activeAlertAudioUrl: string | null = null;
let activeAlertAbort: AbortController | null = null;
let activeAlertUtterance: SpeechSynthesisUtterance | null = null;
let activeAlertItem: QueuedAlertItem | null = null;
let activeAlertResolve: ((outcome: 'done' | 'blocked' | 'aborted') => void) | null = null;
const alertSpeechQueue: QueuedAlertItem[] = [];
let alertQueuePumping = false;
let alertUnlockCleanup: (() => void) | null = null;

export function resetVoiceAssistantState(): void {
  stopAlertSpeaking();
  stopSpeaking();
  speechApiBlocked = false;
  voicesProbeSettled = false;
  if (preloadTimer !== null) {
    clearTimeout(preloadTimer);
    preloadTimer = null;
  }
  if (preloadCleanup) {
    preloadCleanup();
    preloadCleanup = null;
  }
  primedAudio = null;
  primedPlayPromise = null;
  ttsBlobCache.clear();
}

export function primeAudioPlayback(): void {
  if (!supportsAudioPlayback()) return;
  try {
    if (!primedAudio || primedAudio.error) {
      primedAudio = new window.Audio();
      primedAudio.preload = 'auto';
    }
    if (primedAudio !== activeAudio && primedAudio.paused) {
      const target = primedAudio;
      target.muted = true;
      target.src = SILENT_WAV_DATA_URI;
      const playPromise = target.play();
      if (playPromise && typeof playPromise.then === 'function') {
        const pending = playPromise
          .then(
            () => {
              if (primedAudio === target && target !== activeAudio) {
                target.pause();
                target.muted = false;
              }
            },
            () => {
              if (primedAudio === target) target.muted = false;
            },
          )
          .finally(() => {
            if (primedPlayPromise === pending) primedPlayPromise = null;
          });
        primedPlayPromise = pending;
      } else {
        target.pause();
        target.muted = false;
      }
    }
  } catch {
    // Ignore audio priming errors in headless tests or strict browsers.
  }
}

function releaseAudioElement(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.onplay = null;
  audio.ontimeupdate = null;
  audio.onended = null;
  audio.onerror = null;
  try {
    audio.pause();
    if (typeof audio.removeAttribute === 'function') {
      audio.removeAttribute('src');
    } else {
      audio.src = '';
    }
    if (typeof audio.load === 'function') {
      audio.load();
    }
  } catch {
    // Ignore cleanup errors on audio element.
  }
}

function revokeObjectUrl(url: string | null): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore URL cleanup errors.
  }
}

function clearAlertUnlockListeners(): void {
  if (alertUnlockCleanup) {
    alertUnlockCleanup();
    alertUnlockCleanup = null;
  }
}

function cleanupAlertAudioPlayback(): void {
  if (activeAlertAbort) {
    activeAlertAbort.abort();
    activeAlertAbort = null;
  }
  releaseAudioElement(activeAlertAudio);
  activeAlertAudio = null;
  revokeObjectUrl(activeAlertAudioUrl);
  activeAlertAudioUrl = null;
}

function isAssistantSpeechActive(): boolean {
  const synth = isSpeechSynthesisSupported() ? window.speechSynthesis : null;
  return Boolean(
    activeAudio !== null ||
    activeTtsAbort !== null ||
    pendingTimer !== null ||
    activeUtterance !== null ||
    (synth && !activeAlertUtterance && (synth.speaking || synth.pending)),
  );
}

function flushDeferredAlertIfIdle(): void {
  if (!alertSpeechQueue.length || isAssistantSpeechActive()) return;
  void pumpAlertQueue();
}

function cleanupAudioPlayback(): void {
  if (audioProgressTimer !== null) {
    clearInterval(audioProgressTimer);
    audioProgressTimer = null;
  }
  if (activeTtsAbort) {
    activeTtsAbort.abort();
    activeTtsAbort = null;
  }
  releaseAudioElement(activeAudio);
  activeAudio = null;
  revokeObjectUrl(activeAudioUrl);
  activeAudioUrl = null;
}

function clearSpeechTimers(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (startWatchdogTimer !== null) {
    clearTimeout(startWatchdogTimer);
    startWatchdogTimer = null;
  }
  if (voicesCleanup) {
    voicesCleanup();
    voicesCleanup = null;
  }
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[`*_#]+/g, ' ')
    .replace(/(?:^|\n)\s*[-•]\s+/g, '. ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitSpeechChunks(text: string, maxChunkChars = SPEECH_CHUNK_MAX_CHARS): string[] {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return [];

  const sentences = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map(part => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushOversized = (segment: string) => {
    const words = segment.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxChunkChars) {
        line = candidate;
      } else {
        if (line) chunks.push(line);
        line = word.length > maxChunkChars ? word.slice(0, maxChunkChars) : word;
      }
    }
    if (line) chunks.push(line);
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChunkChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushOversized(sentence);
      continue;
    }
    const combined = current ? `${current} ${sentence}` : sentence;
    if (combined.length <= maxChunkChars) {
      current = combined;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function isRoboticVoice(voice: SpeechSynthesisVoice): boolean {
  const descriptor = `${voice.name || ''} ${voice.voiceURI || ''}`;
  if (/\b(?:natural|neural|online|siri|enhanced|premium|google)\b/i.test(descriptor)) {
    return false;
  }
  if (
    /\b(?:espeak|espeak-ng|flite|festival|mbrola|speech-dispatcher|dummy)\b/i.test(descriptor) ||
    /\bmicrosoft\s+(?:david|zira|mark|george|hazel|susan|richard|linda|james)\b/i.test(descriptor)
  ) {
    return true;
  }
  if (
    voice.localService &&
    typeof navigator !== 'undefined' &&
    /Linux/i.test(navigator.userAgent || '') &&
    !/Android/i.test(navigator.userAgent || '')
  ) {
    // Linux desktop speech-dispatcher commonly exposes eSpeak voices without an eSpeak tag.
    return true;
  }
  return false;
}

export function pickSpeechVoice(
  voices: SpeechSynthesisVoice[],
  options?: { preferLocal?: boolean; excludeVoiceUri?: string },
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const filtered =
    options?.excludeVoiceUri && voices.length > 1
      ? voices.filter(voice => voice.voiceURI !== options.excludeVoiceUri)
      : voices;
  const nonRobotic = filtered.filter(voice => !isRoboticVoice(voice));
  const pool = nonRobotic.length ? nonRobotic : filtered.length ? filtered : voices;
  const isEnglish = (voice: SpeechSynthesisVoice) => /^en(?:[-_]|$)/i.test(voice.lang || '');
  const english = pool.filter(isEnglish);
  const preferLocal = options?.preferLocal !== false;

  if (preferLocal) {
    // Prefer non-robotic local OS voices over remote voices to avoid network startup lag.
    const localEnUs = english.find(voice => voice.localService && /^en[-_]us$/i.test(voice.lang));
    if (localEnUs) return localEnUs;
    const localEn = english.find(voice => voice.localService);
    if (localEn) return localEn;
  }

  return (
    english.find(voice => voice.default) ??
    english.find(voice => /^en[-_]us$/i.test(voice.lang)) ??
    english[0] ??
    (preferLocal ? pool.find(voice => voice.localService && voice.default) ?? pool.find(voice => voice.localService) : null) ??
    pool.find(voice => voice.default) ??
    pool[0] ??
    null
  );
}

export function preloadSpeechVoices(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    if (voices.length > 0) {
      voicesProbeSettled = true;
      return;
    }
    if (voicesProbeSettled || preloadTimer !== null) return;
    if (typeof synth.addEventListener !== 'function') {
      voicesProbeSettled = true;
      return;
    }
    const settle = () => {
      voicesProbeSettled = true;
      if (preloadTimer !== null) {
        clearTimeout(preloadTimer);
        preloadTimer = null;
      }
      if (preloadCleanup) {
        preloadCleanup();
        preloadCleanup = null;
      }
    };
    const onVoicesChanged = () => settle();
    synth.addEventListener('voiceschanged', onVoicesChanged);
    preloadCleanup = () => synth.removeEventListener('voiceschanged', onVoicesChanged);
    preloadTimer = setTimeout(settle, PRELOAD_PROBE_TIMEOUT_MS);
  } catch {
    voicesProbeSettled = true;
  }
}

function trimTtsRequestText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_TTS_REQUEST_CHARS) return collapsed;
  const slice = collapsed.slice(0, MAX_TTS_REQUEST_CHARS);
  const sentenceStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentenceStop >= Math.floor(MAX_TTS_REQUEST_CHARS * 0.5)) {
    return slice.slice(0, sentenceStop + 1).trim();
  }
  const wordStop = slice.lastIndexOf(' ');
  return (wordStop > 0 ? slice.slice(0, wordStop) : slice).trim();
}

function cacheTtsBlob(key: string, blob: Blob): void {
  if (ttsBlobCache.size >= TTS_BLOB_CACHE_MAX_ENTRIES) {
    const oldestKey = ttsBlobCache.keys().next().value;
    if (oldestKey) ttsBlobCache.delete(oldestKey);
  }
  ttsBlobCache.set(key, blob);
}

export function stopSpeaking(): void {
  activeSessionId++;
  clearSpeechTimers();
  cleanupAudioPlayback();
  activeUtterance = null;
  if (isSpeechSynthesisSupported()) {
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending || synth.paused) {
        synth.cancel();
      }
    } catch {
      // Ignore browser speech synthesis cancellation failures.
    }
  }
  flushDeferredAlertIfIdle();
}

function formatTtsErrorMessage(code: string, voiceCount: number): string {
  if (code === 'not-allowed' || code === 'audio-busy') {
    return 'Audio playback was blocked or busy in this browser. Click Read aloud again after interacting with the page.';
  }
  if (
    code === 'synthesis-unavailable' ||
    code === 'language-unavailable' ||
    code === 'voice-unavailable' ||
    voiceCount === 0
  ) {
    return 'No working text-to-speech voice was found in this browser (check OS speech settings such as speech-dispatcher/espeak-ng on Linux).';
  }
  return 'Browser text-to-speech could not play audio for this reply.';
}

export interface SpeechPlaybackProgress {
  currentTimeSec: number;
  durationSec: number;
  ratio: number;
}

export function speakAssistantReply(
  text: string,
  callbacks?: {
    onStart?: (meta?: { durationSec?: number }) => void;
    onProgress?: (progress: SpeechPlaybackProgress) => void;
    onEnd?: () => void;
    onError?: (message?: string) => void;
    fetchAudio?: (text: string, signal: AbortSignal) => Promise<Blob>;
    preferServerAudio?: boolean;
  },
): boolean {
  if (!isTtsPlaybackSupported()) return false;
  const cleaned = cleanTextForSpeech(text);
  const chunks = splitSpeechChunks(cleaned);
  if (!cleaned || !chunks.length) return false;

  const hasWebSpeech = isSpeechSynthesisSupported();
  const synth = hasWebSpeech ? window.speechSynthesis : null;
  const wasBusy = Boolean(
    activeAudio !== null ||
    activeTtsAbort !== null ||
    pendingTimer !== null ||
    (synth && (synth.speaking || synth.pending || activeUtterance)),
  );

  pauseAlertSpeechForAssistant();
  activeSessionId++;
  const sessionId = activeSessionId;
  clearSpeechTimers();
  cleanupAudioPlayback();
  activeUtterance = null;

  if (wasBusy && synth) {
    try {
      synth.cancel();
    } catch {
      // Ignore cancel errors before re-queueing speech.
    }
  }

  let notifiedStart = false;

  const playServerAudioFallback = async (
    fallbackErrorMessage: string,
    allowLocalFallback = false,
  ): Promise<void> => {
    const isOffline =
      !callbacks?.fetchAudio && typeof navigator !== 'undefined' && navigator.onLine === false;
    const tryLocalFallback = (): boolean => {
      if (!allowLocalFallback || !synth || sessionId !== activeSessionId) return false;
      let localVoices: SpeechSynthesisVoice[] = [];
      try {
        localVoices = synth.getVoices();
      } catch {
        localVoices = [];
      }
      const eligibleVoices = isOffline
        ? localVoices
        : localVoices.filter(voice => !isRoboticVoice(voice));
      if (!eligibleVoices.length) return false;
      speakChunk(0, true, false, undefined, false);
      return true;
    };

    if (sessionId !== activeSessionId) return;
    if (!supportsAudioPlayback()) {
      if (tryLocalFallback()) return;
      activeSessionId++;
      callbacks?.onError?.(fallbackErrorMessage);
      return;
    }
    if (!callbacks?.fetchAudio && typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (tryLocalFallback()) return;
      activeSessionId++;
      callbacks?.onError?.('No local browser speech voice is available while offline.');
      return;
    }

    try {
      const requestText = trimTtsRequestText(cleaned);
      let blob = ttsBlobCache.get(requestText);
      if (!blob) {
        const controller = new AbortController();
        activeTtsAbort = controller;
        const fetcher = callbacks?.fetchAudio ?? synthesizeAssistantSpeechApi;
        blob = await fetcher(requestText, controller.signal);
        if (activeTtsAbort === controller) activeTtsAbort = null;
        if (sessionId !== activeSessionId) return;
        cacheTtsBlob(requestText, blob);
      }

      if (primedPlayPromise && primedAudio && !primedAudio.error) {
        await primedPlayPromise;
      }
      if (sessionId !== activeSessionId) return;

      const objectUrl = URL.createObjectURL(blob);
      activeAudioUrl = objectUrl;

      const startElementPlayback = async (
        audio: HTMLAudioElement,
        allowFreshRetry: boolean,
      ): Promise<void> => {
        if (sessionId !== activeSessionId) return;
        activeAudio = audio;

        const readAudioProgress = (forceEnd = false) => {
          const duration =
            Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          const current = forceEnd
            ? duration
            : Number.isFinite(audio.currentTime) && audio.currentTime >= 0
              ? audio.currentTime
              : 0;
          const ratio = forceEnd
            ? 1
            : duration > 0
              ? Math.min(1, Math.max(0, current / duration))
              : 0;
          callbacks?.onProgress?.({ currentTimeSec: current, durationSec: duration, ratio });
        };

        const startProgressTracker = () => {
          if (!callbacks?.onProgress || audioProgressTimer !== null) return;
          audioProgressTimer = setInterval(() => {
            if (sessionId !== activeSessionId || activeAudio !== audio) {
              if (audioProgressTimer !== null) {
                clearInterval(audioProgressTimer);
                audioProgressTimer = null;
              }
              return;
            }
            readAudioProgress(false);
          }, AUDIO_PROGRESS_INTERVAL_MS);
        };

        const emitStart = () => {
          if (sessionId !== activeSessionId || notifiedStart) return;
          notifiedStart = true;
          const duration =
            Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          callbacks?.onStart?.(duration > 0 ? { durationSec: duration } : undefined);
          readAudioProgress(false);
          startProgressTracker();
        };

        const retryWithFreshElement = (): boolean => {
          if (!allowFreshRetry || notifiedStart || sessionId !== activeSessionId) return false;
          // Discard any stale primed element before falling back to local OS speech.
          primedAudio = null;
          primedPlayPromise = null;
          releaseAudioElement(audio);
          if (activeAudio === audio) activeAudio = null;
          void startElementPlayback(new window.Audio(objectUrl), false);
          return true;
        };

        audio.ontimeupdate = () => {
          if (sessionId !== activeSessionId) return;
          readAudioProgress(false);
        };
        audio.onplay = () => emitStart();
        audio.onended = () => {
          if (sessionId !== activeSessionId) return;
          readAudioProgress(true);
          cleanupAudioPlayback();
          callbacks?.onEnd?.();
          flushDeferredAlertIfIdle();
        };
        audio.onerror = () => {
          if (sessionId !== activeSessionId) return;
          if (retryWithFreshElement()) return;
          cleanupAudioPlayback();
          if (tryLocalFallback()) return;
          activeSessionId++;
          callbacks?.onError?.(fallbackErrorMessage);
          flushDeferredAlertIfIdle();
        };

        try {
          await audio.play();
          emitStart();
        } catch (cause) {
          if (sessionId !== activeSessionId) return;
          if (cause instanceof Error && cause.name === 'NotAllowedError') {
            cleanupAudioPlayback();
            activeSessionId++;
            callbacks?.onError?.('Audio playback was blocked by this browser. Click Read aloud directly.');
            flushDeferredAlertIfIdle();
            return;
          }
          if (retryWithFreshElement()) return;
          cleanupAudioPlayback();
          if (cause instanceof Error && cause.name === 'AbortError') {
            callbacks?.onEnd?.();
            flushDeferredAlertIfIdle();
            return;
          }
          if (tryLocalFallback()) return;
          activeSessionId++;
          callbacks?.onError?.(fallbackErrorMessage);
          flushDeferredAlertIfIdle();
        }
      };

      const reusablePrimed = primedAudio && !primedAudio.error ? primedAudio : null;
      if (primedAudio && primedAudio.error) {
        primedAudio = null;
        primedPlayPromise = null;
      }
      const audio = reusablePrimed ?? new window.Audio(objectUrl);
      if (reusablePrimed) {
        audio.muted = false;
        audio.src = objectUrl;
        if (typeof audio.load === 'function') audio.load();
      }
      await startElementPlayback(audio, Boolean(reusablePrimed));
    } catch (cause) {
      if (sessionId !== activeSessionId) return;
      cleanupAudioPlayback();
      if (cause instanceof Error && cause.name === 'AbortError') {
        callbacks?.onEnd?.();
        flushDeferredAlertIfIdle();
        return;
      }
      if (cause instanceof Error && cause.name === 'NotAllowedError') {
        activeSessionId++;
        callbacks?.onError?.('Audio playback was blocked by this browser. Click Read aloud directly.');
        flushDeferredAlertIfIdle();
        return;
      }
      if (tryLocalFallback()) return;
      activeSessionId++;
      if (cause instanceof Error && /timed out/i.test(cause.message)) {
        callbacks?.onError?.(cause.message);
      } else {
        callbacks?.onError?.(fallbackErrorMessage);
      }
      flushDeferredAlertIfIdle();
    }
  };

  const canUseServerAudioEarly =
    supportsAudioPlayback() &&
    (Boolean(callbacks?.fetchAudio) || typeof navigator === 'undefined' || navigator.onLine !== false);

  if (!synth) {
    void playServerAudioFallback('Text-to-speech synthesis is unavailable right now.');
    return true;
  }

  const chunkOffsets: number[] = [];
  let runningChunkOffset = 0;
  for (const chunk of chunks) {
    chunkOffsets.push(runningChunkOffset);
    runningChunkOffset += chunk.length + 1;
  }

  const speakChunk = (
    chunkIndex: number,
    preferLocal: boolean,
    triedLocalFallback: boolean,
    excludeVoiceUri?: string,
    allowServerFallback = true,
  ): void => {
    if (sessionId !== activeSessionId) return;

    let voices: SpeechSynthesisVoice[] = [];
    try {
      voices = synth.getVoices();
    } catch {
      voices = [];
    }

    const selectedVoice = pickSpeechVoice(voices, { preferLocal, excludeVoiceUri });
    const utterance = new window.SpeechSynthesisUtterance(chunks[chunkIndex]);
    utterance.lang = selectedVoice?.lang || 'en-US';
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Retain active reference so Chromium V8 GC cannot drop utterances before onend fires.
    activeUtterance = utterance;

    const retryWithLocalVoice = (): boolean => {
      const altLocal = voices.some(
        voice => voice.localService && voice.voiceURI !== selectedVoice?.voiceURI,
      );
      if (chunkIndex !== 0 || triedLocalFallback || !altLocal) return false;
      clearSpeechTimers();
      activeUtterance = null;
      try {
        synth.cancel();
      } catch {
        // Ignore cancel errors before local fallback retry.
      }
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        speakChunk(0, true, true, selectedVoice?.voiceURI, allowServerFallback);
      }, CANCEL_SETTLE_DELAY_MS);
      return true;
    };

    const handleFailure = (code: string, voiceCount: number) => {
      const errMsg = formatTtsErrorMessage(code, voiceCount);
      try {
        synth.cancel();
      } catch {
        // Ignore cleanup cancel errors.
      }
      if (allowServerFallback && chunkIndex === 0 && !notifiedStart && supportsAudioPlayback()) {
        void playServerAudioFallback(errMsg);
        return;
      }
      activeSessionId++;
      callbacks?.onError?.(errMsg);
      flushDeferredAlertIfIdle();
    };

    if (chunkIndex === 0 && !notifiedStart) {
      startWatchdogTimer = setTimeout(() => {
        startWatchdogTimer = null;
        if (sessionId !== activeSessionId) return;
        if (synth.speaking) return;
        if (retryWithLocalVoice()) return;
        activeUtterance = null;
        handleFailure('synthesis-unavailable', voices.length);
      }, SPEECH_START_TIMEOUT_MS);
    }

    utterance.onstart = () => {
      if (sessionId !== activeSessionId) return;
      if (startWatchdogTimer !== null) {
        clearTimeout(startWatchdogTimer);
        startWatchdogTimer = null;
      }
      if (!notifiedStart) {
        notifiedStart = true;
        callbacks?.onStart?.();
      }
    };

    utterance.onboundary = event => {
      if (sessionId !== activeSessionId) return;
      const charIdx = typeof event.charIndex === 'number' ? event.charIndex : 0;
      const offset = chunkOffsets[chunkIndex] ?? 0;
      const total = cleaned.length || 1;
      const ratio = Math.min(1, Math.max(0, (offset + charIdx) / total));
      callbacks?.onProgress?.({ currentTimeSec: 0, durationSec: 1, ratio });
    };

    utterance.onend = () => {
      if (sessionId !== activeSessionId) return;
      if (startWatchdogTimer !== null) {
        clearTimeout(startWatchdogTimer);
        startWatchdogTimer = null;
      }
      activeUtterance = null;
      if (chunkIndex + 1 < chunks.length) {
        speakChunk(
          chunkIndex + 1,
          preferLocal,
          triedLocalFallback,
          excludeVoiceUri,
          allowServerFallback,
        );
      } else {
        callbacks?.onEnd?.();
        flushDeferredAlertIfIdle();
      }
    };

    utterance.onerror = event => {
      if (sessionId !== activeSessionId) return;
      if (startWatchdogTimer !== null) {
        clearTimeout(startWatchdogTimer);
        startWatchdogTimer = null;
      }
      activeUtterance = null;
      const errCode = ((event as unknown as { error?: string } | undefined)?.error ?? '').toLowerCase();
      if (errCode === 'canceled' || errCode === 'interrupted') {
        callbacks?.onEnd?.();
        flushDeferredAlertIfIdle();
        return;
      }
      if (retryWithLocalVoice()) return;
      handleFailure(errCode, voices.length);
    };

    try {
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    } catch {
      clearSpeechTimers();
      activeUtterance = null;
      handleFailure('synthesis-failed', voices.length);
    }
  };

  const launch = () => {
    if (sessionId !== activeSessionId) return;
    const preferServerAudio = callbacks?.preferServerAudio !== false;
    if (preferServerAudio && canUseServerAudioEarly) {
      void playServerAudioFallback('Text-to-speech synthesis is unavailable right now.', true);
      return;
    }
    let voices: SpeechSynthesisVoice[] = [];
    try {
      voices = synth.getVoices();
    } catch {
      voices = [];
    }

    const startAfterVoicesCheck = () => {
      if (sessionId !== activeSessionId) return;
      let loadedVoices: SpeechSynthesisVoice[] = [];
      try {
        loadedVoices = synth.getVoices();
      } catch {
        loadedVoices = [];
      }
      if (loadedVoices.length > 0) voicesProbeSettled = true;
      const naturalVoices = loadedVoices.filter(voice => !isRoboticVoice(voice));
      const canUseServerAudio =
        supportsAudioPlayback() &&
        (Boolean(callbacks?.fetchAudio) || typeof navigator === 'undefined' || navigator.onLine !== false);
      if (
        supportsAudioPlayback() &&
        (loadedVoices.length === 0 || (naturalVoices.length === 0 && canUseServerAudio))
      ) {
        void playServerAudioFallback(formatTtsErrorMessage('synthesis-unavailable', loadedVoices.length));
        return;
      }
      speakChunk(0, true, false);
    };

    if (voices.length === 0 && !voicesProbeSettled && typeof synth.addEventListener === 'function') {
      let launched = false;
      const startOnce = () => {
        voicesProbeSettled = true;
        if (launched || sessionId !== activeSessionId) return;
        launched = true;
        clearSpeechTimers();
        startAfterVoicesCheck();
      };
      const onVoicesChanged = () => startOnce();
      synth.addEventListener('voiceschanged', onVoicesChanged);
      voicesCleanup = () => synth.removeEventListener('voiceschanged', onVoicesChanged);
      pendingTimer = setTimeout(startOnce, VOICE_PROBE_TIMEOUT_MS);
      return;
    }

    if (voices.length > 0) voicesProbeSettled = true;
    startAfterVoicesCheck();
  };

  if (wasBusy) {
    // Allow Chromium's async cancel() IPC to settle before queuing the next utterance.
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      launch();
    }, CANCEL_SETTLE_DELAY_MS);
  } else {
    launch();
  }

  return true;
}

function scheduleAlertAutoplayRetry(): void {
  clearAlertUnlockListeners();
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  const retry = () => {
    clearAlertUnlockListeners();
    void pumpAlertQueue();
  };
  window.addEventListener('click', retry, { once: true });
  window.addEventListener('keydown', retry, { once: true });
  alertUnlockCleanup = () => {
    window.removeEventListener('click', retry);
    window.removeEventListener('keydown', retry);
  };
}

function speakAlertWithSpeechSynthesis(
  cleaned: string,
  sessionId: number,
  callbacks?: { onStart?: () => void; onEnd?: () => void },
): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  if (sessionId !== activeAlertSessionId) return false;
  const synth = window.speechSynthesis;
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = synth.getVoices();
  } catch {
    voices = [];
  }
  const selectedVoice = pickSpeechVoice(voices, { preferLocal: true });
  const utterance = new window.SpeechSynthesisUtterance(cleaned);
  utterance.lang = selectedVoice?.lang || 'en-US';
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  activeAlertUtterance = utterance;
  utterance.onstart = () => {
    if (sessionId !== activeAlertSessionId) return;
    callbacks?.onStart?.();
  };
  const finish = () => {
    if (activeAlertUtterance === utterance) activeAlertUtterance = null;
    if (sessionId !== activeAlertSessionId) return;
    callbacks?.onEnd?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  try {
    if (synth.paused) synth.resume();
    synth.speak(utterance);
    return true;
  } catch {
    if (activeAlertUtterance === utterance) activeAlertUtterance = null;
    return false;
  }
}

function haltCurrentAlertPlayback(outcome: 'done' | 'blocked' | 'aborted' = 'aborted'): void {
  activeAlertSessionId++;
  clearAlertUnlockListeners();
  cleanupAlertAudioPlayback();
  const hadAlertUtterance = activeAlertUtterance !== null;
  activeAlertUtterance = null;
  if (hadAlertUtterance && isSpeechSynthesisSupported()) {
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending || synth.paused) {
        synth.cancel();
      }
    } catch {
      // Ignore browser speech synthesis cancellation failures.
    }
  }
  const resolve = activeAlertResolve;
  activeAlertResolve = null;
  activeAlertItem = null;
  resolve?.(outcome);
}

function pauseAlertSpeechForAssistant(): void {
  haltCurrentAlertPlayback('aborted');
}

/**
 * Halts active and queued background alert speech without interrupting assistant replies.
 */
export function stopAlertSpeaking(): void {
  alertSpeechQueue.length = 0;
  haltCurrentAlertPlayback('aborted');
}

/**
 * Removes queued or active alert speech whose alerts have been acknowledged or cleared,
 * allowing unrelated crew alerts to keep playing uninterrupted.
 */
export function syncActiveAlertSpeechKeys(activeKeys: Set<string>): void {
  if (activeKeys.size === 0) {
    stopAlertSpeaking();
    return;
  }
  for (let i = alertSpeechQueue.length - 1; i >= 0; i--) {
    const queued = alertSpeechQueue[i];
    if (queued.alertKeys.length > 0 && queued.alertKeys.every(k => !activeKeys.has(k))) {
      alertSpeechQueue.splice(i, 1);
    }
  }
  if (
    activeAlertItem &&
    activeAlertItem.alertKeys.length > 0 &&
    activeAlertItem.alertKeys.every(k => !activeKeys.has(k))
  ) {
    haltCurrentAlertPlayback('aborted');
  }
}

function playQueuedAlertItem(
  item: QueuedAlertItem,
  sessionId: number,
): Promise<'done' | 'blocked' | 'aborted'> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (outcome: 'done' | 'blocked' | 'aborted') => {
      if (settled) return;
      settled = true;
      if (activeAlertResolve === finish) activeAlertResolve = null;
      resolve(outcome);
    };
    activeAlertResolve = finish;

    if (sessionId !== activeAlertSessionId) {
      finish('aborted');
      return;
    }

    const callbacks = item.callbacks;
    const canUseServerAudio =
      supportsAudioPlayback() &&
      (Boolean(callbacks?.fetchAudio) || typeof navigator === 'undefined' || navigator.onLine !== false);

    const finishWithSpeechFallback = () => {
      const started = speakAlertWithSpeechSynthesis(item.text, sessionId, {
        onStart: callbacks?.onStart,
        onEnd: () => {
          callbacks?.onEnd?.();
          finish('done');
        },
      });
      if (!started) {
        callbacks?.onEnd?.();
        finish('done');
      }
    };

    if (!canUseServerAudio) {
      finishWithSpeechFallback();
      return;
    }

    const runServerPlayback = async (): Promise<void> => {
      let notifiedStart = false;
      const emitStart = () => {
        if (notifiedStart || sessionId !== activeAlertSessionId) return;
        notifiedStart = true;
        callbacks?.onStart?.();
      };

      try {
        const requestText = trimTtsRequestText(item.text);
        let blob = ttsBlobCache.get(requestText);
        if (!blob) {
          const controller = new AbortController();
          activeAlertAbort = controller;
          try {
            const fetchAudio = callbacks?.fetchAudio ?? synthesizeAssistantSpeechApi;
            blob = await fetchAudio(requestText, controller.signal);
            cacheTtsBlob(requestText, blob);
          } finally {
            if (activeAlertAbort === controller) {
              activeAlertAbort = null;
            }
          }
        }

        if (sessionId !== activeAlertSessionId) {
          finish('aborted');
          return;
        }
        if (isAssistantSpeechActive()) {
          alertSpeechQueue.unshift(item);
          finish('aborted');
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        const audio = new window.Audio(objectUrl);
        activeAlertAudio = audio;
        activeAlertAudioUrl = objectUrl;

        audio.onplay = () => emitStart();
        audio.onended = () => {
          if (sessionId !== activeAlertSessionId) {
            finish('aborted');
            return;
          }
          cleanupAlertAudioPlayback();
          callbacks?.onEnd?.();
          finish('done');
        };
        audio.onerror = () => {
          if (sessionId !== activeAlertSessionId) {
            finish('aborted');
            return;
          }
          cleanupAlertAudioPlayback();
          finishWithSpeechFallback();
        };

        await audio.play();
        emitStart();
      } catch (cause) {
        if (sessionId !== activeAlertSessionId) {
          finish('aborted');
          return;
        }
        cleanupAlertAudioPlayback();
        if (cause instanceof Error && cause.name === 'AbortError') {
          callbacks?.onEnd?.();
          finish('aborted');
          return;
        }
        if (cause instanceof Error && cause.name === 'NotAllowedError') {
          alertSpeechQueue.unshift(item);
          scheduleAlertAutoplayRetry();
          callbacks?.onBlocked?.();
          finish('blocked');
          return;
        }
        finishWithSpeechFallback();
      }
    };

    void runServerPlayback();
  });
}

async function pumpAlertQueue(): Promise<void> {
  if (alertQueuePumping || isAssistantSpeechActive() || alertSpeechQueue.length === 0) return;
  alertQueuePumping = true;
  let lastOutcome: 'done' | 'blocked' | 'aborted' = 'done';
  try {
    while (alertSpeechQueue.length > 0 && !isAssistantSpeechActive()) {
      const item = alertSpeechQueue.shift()!;
      activeAlertSessionId++;
      const sessionId = activeAlertSessionId;
      activeAlertItem = item;
      lastOutcome = await playQueuedAlertItem(item, sessionId);
      activeAlertItem = null;
      if (lastOutcome === 'blocked') break;
    }
  } finally {
    alertQueuePumping = false;
    if (lastOutcome !== 'blocked' && alertSpeechQueue.length > 0 && !isAssistantSpeechActive()) {
      void pumpAlertQueue();
    }
  }
}

/**
 * Enqueues alert summaries and recommended actions via Edge TTS to play asynchronously
 * across crew profiles and tab switches without interrupting active alerts or AI speech.
 */
export function speakBackgroundAlert(
  text: string,
  callbacks?: BackgroundAlertCallbacks,
): boolean {
  if (!isTtsPlaybackSupported()) return false;
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return false;

  const tag = callbacks?.tag ?? 'global';
  const alertKeys = callbacks?.alertKeys ?? [];
  const alreadyActiveOrQueued =
    (activeAlertItem?.tag === tag && activeAlertItem.text === cleaned) ||
    alertSpeechQueue.some(entry => entry.tag === tag && entry.text === cleaned);
  if (!alreadyActiveOrQueued) {
    alertSpeechQueue.push({ text: cleaned, tag, alertKeys, callbacks });
  }
  void pumpAlertQueue();
  return true;
}
