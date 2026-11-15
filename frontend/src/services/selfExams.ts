import { localDb } from '../db/localDb';
import type { ImageAssessmentRecord, SelfExamType, VitalSigns } from '../types/telemetry';
import {
  analyzeSelfExamImageApi,
  fetchAssessmentsRemote,
  isOnlineHttpBrowser,
  syncAssessmentRemote,
  type RemoteAssessmentRow,
} from './api';

export interface SelfExamGuideSpec {
  id: SelfExamType;
  label: string;
  subtitle: string;
  steps: string[];
  normalReference: string;
  escalateTrigger: string;
}

export const SELF_EXAM_GUIDES: Record<SelfExamType, SelfExamGuideSpec> = {
  ocular_ultrasound: {
    id: 'ocular_ultrasound',
    label: 'Ocular Ultrasound (SANS)',
    subtitle: 'Optic nerve sheath diameter & posterior globe check',
    steps: [
      'Apply sterile ultrasound gel over a closed eyelid; keep transducer pressure gentle.',
      'Align probe transversely across the eye orbit until the dark optic nerve shadow appears.',
      'Capture frame 3 mm posterior to the optic disc to check sheath widening or globe flattening.',
    ],
    normalReference: 'ONSD <5.0 mm bilaterally with smooth posterior scleral contour (OSD-583/680).',
    escalateTrigger: 'Blurry near vision, choroidal folds, or bilateral ONSD >5.5 mm.',
  },
  dermal_radiation: {
    id: 'dermal_radiation',
    label: 'Skin & Radiation Erythema',
    subtitle: 'Visual inspection of rash, abrasion, or radiation erythema',
    steps: [
      'Position camera 20 cm from forearm, neck, or suit pressure zone under neutral cabin LEDs.',
      'Avoid specular glare; include surrounding unaffected skin for color baseline contrast.',
      'Note tenderness, itching, warmth, or onset relative to EVA suit doffing or solar alerts.',
    ],
    normalReference: 'Intact barrier, uniform skin tone, no induration or expanding erythema.',
    escalateTrigger: 'Rapidly spreading redness, blistering, purulent exudate, or systemic fever.',
  },
  glucometer_nutrition: {
    id: 'glucometer_nutrition',
    label: 'Glucometer & Intake Check',
    subtitle: 'Capillary blood sugar strip or daily nutrition/hydration photo',
    steps: [
      'Cleanse fingertip with alcohol prep, dry completely, and capture glucometer display clearly.',
      'Optionally photograph ration pack barcode or electrolyte pouch to log intake balance.',
      'Record whether measurement is fasting (>8h) or within 2 hours of meal/EVA.',
    ],
    normalReference: '70-140 mg/dL fasting/pre-EVA nominal band (OSD-575 flight mean ~93 mg/dL).',
    escalateTrigger: 'Glucose <55 mg/dL with dizziness/tremor, or >240 mg/dL on repeat test.',
  },
};

export function resizeImageFileToDataUrl(file: File, maxDim = 640): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const srcUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
        const width = Math.max(16, Math.round(img.width * scale));
        const height = Math.max(16, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: srcUrl, mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = 'image/jpeg';
        resolve({ dataUrl: canvas.toDataURL(mime, 0.82), mimeType: mime });
      };
      img.src = srcUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function generateReferenceScanDataUrl(examType: SelfExamType): string {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#06121d';
  ctx.fillRect(0, 0, 480, 320);

  if (examType === 'ocular_ultrasound') {
    // Stylized B-mode ultrasound fan + anechoic vitreous globe + optic nerve shadow.
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(240, 128, 72, 0, Math.PI * 2);
    ctx.fillStyle = '#02080f';
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(228, 200, 24, 96);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px monospace';
    ctx.fillText('B-MODE OCULAR REF · ONSD 4.3 mm', 18, 26);
    ctx.fillText('DEPTH 4.5 cm · SANS BASELINE', 18, 304);
  } else if (examType === 'dermal_radiation') {
    ctx.fillStyle = '#d4a38a';
    ctx.fillRect(70, 50, 340, 210);
    ctx.fillStyle = 'rgba(220, 95, 85, 0.45)';
    ctx.beginPath();
    ctx.ellipse(240, 155, 58, 42, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '13px monospace';
    ctx.fillText('DERMAL REF · EVA FOREARM ZONE', 18, 26);
  } else {
    ctx.fillStyle = '#0f293d';
    ctx.fillRect(110, 40, 260, 240);
    ctx.fillStyle = '#1e3a4c';
    ctx.fillRect(140, 72, 200, 96);
    ctx.fillStyle = '#2dd4bf';
    ctx.font = 'bold 42px monospace';
    ctx.fillText('94', 182, 134);
    ctx.font = '14px monospace';
    ctx.fillText('mg/dL', 252, 134);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('GLUCOMETER REF · FASTING CHECK', 18, 26);
  }
  return canvas.toDataURL('image/png');
}

export interface ObservationSpeechParts {
  intro: string;
  findings: string;
  actionsText: string;
  consultText: string;
}

export function getObservationSpeechParts(record: ImageAssessmentRecord): ObservationSpeechParts {
  const guide = SELF_EXAM_GUIDES[record.examType];
  const label = guide?.label ?? record.examType;
  const actions = record.recommendedActions.slice(0, 3).join('. ');
  return {
    intro: `${label} assessment: ${record.severity}.`,
    findings: record.findings.trim(),
    actionsText: actions ? `Recommended actions: ${actions}.` : '',
    consultText: record.groundConsultRequired ? 'Ground Flight Surgeon review is recommended.' : '',
  };
}

export function buildObservationSpeechText(record: ImageAssessmentRecord): string {
  const parts = getObservationSpeechParts(record);
  return [parts.intro, parts.findings, parts.actionsText, parts.consultText]
    .filter(Boolean)
    .join(' ');
}

// Compute cumulative display weights for observation text with punctuation pause weights.
export function computeTextWeights(text: string): number[] {
  const cumulative: number[] = [];
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let weight = 1;
    if (/\s/.test(ch)) weight = 0.45;
    else if (/[.!?]/.test(ch)) weight = 4.2;
    else if (/[,;:]/.test(ch)) weight = 2.6;
    total += weight;
    cumulative.push(total);
  }
  return cumulative;
}

export function computeObservationSpeechWeights(record: ImageAssessmentRecord): {
  weights: number[];
  introEndIdx: number;
  findingsEndIdx: number;
  actionsEndIdx: number;
  consultEndIdx: number;
} {
  const parts = getObservationSpeechParts(record);
  const segments = [parts.intro, parts.findings, parts.actionsText, parts.consultText];
  const cumulative: number[] = [];
  let total = 0;
  let introEndIdx = 0;
  let findingsEndIdx = 0;
  let actionsEndIdx = 0;
  let consultEndIdx = 0;

  segments.forEach((segment, segIdx) => {
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      let weight = 1;
      if (/\s/.test(ch)) weight = 0.45;
      else if (/[.!?]/.test(ch)) weight = 4.2;
      else if (/[,;:]/.test(ch)) weight = 2.6;
      if (segIdx < segments.length - 1 && i === segment.length - 1) {
        weight += 3.5;
      }
      total += weight;
      cumulative.push(total);
    }
    if (segIdx === 0) introEndIdx = cumulative.length;
    else if (segIdx === 1) findingsEndIdx = cumulative.length;
    else if (segIdx === 2) actionsEndIdx = cumulative.length;
    else if (segIdx === 3) consultEndIdx = cumulative.length;
  });

  return {
    weights: cumulative,
    introEndIdx,
    findingsEndIdx,
    actionsEndIdx,
    consultEndIdx,
  };
}

export interface ObservationStreamSlice {
  findingsText: string;
  findingsComplete: boolean;
  showActions: boolean;
  showConsult: boolean;
  complete: boolean;
}

// Slice observation findings and sections for character-by-character streaming matching speech.
export function sliceObservationStream(
  record: ImageAssessmentRecord,
  revealedChars?: number,
): ObservationStreamSlice {
  const parts = getObservationSpeechParts(record);
  const introLen = parts.intro.length;
  const findingsLen = parts.findings.length;
  const actionsLen = parts.actionsText.length;
  const consultLen = parts.consultText.length;
  const totalChars = introLen + findingsLen + actionsLen + consultLen;

  if (revealedChars === undefined || revealedChars >= totalChars) {
    return {
      findingsText: record.findings,
      findingsComplete: true,
      showActions: record.recommendedActions.length > 0,
      showConsult: true,
      complete: true,
    };
  }

  const clamped = Math.max(0, Math.floor(revealedChars));

  if (clamped <= introLen) {
    return {
      findingsText: '',
      findingsComplete: false,
      showActions: false,
      showConsult: false,
      complete: false,
    };
  }

  const findingsChars = Math.min(clamped - introLen, findingsLen);
  const findingsComplete = findingsChars >= findingsLen;
  const showActions = clamped > introLen + findingsLen && record.recommendedActions.length > 0;
  const showConsult = clamped > introLen + findingsLen + actionsLen;

  return {
    findingsText: record.findings.slice(0, findingsChars),
    findingsComplete,
    showActions,
    showConsult,
    complete: clamped >= totalChars,
  };
}

// Slice observation findings for character-by-character streaming with completion indicator.
export function sliceObservationFindings(findings: string, revealedChars?: number): {
  text: string;
  complete: boolean;
} {
  const len = findings.length;
  if (revealedChars === undefined || revealedChars >= len) {
    return { text: findings, complete: true };
  }
  const count = Math.max(0, Math.floor(revealedChars));
  return { text: findings.slice(0, count), complete: count >= len };
}


export function remoteRowToAssessment(row: RemoteAssessmentRow): ImageAssessmentRecord {
  const validExam: SelfExamType =
    row.exam_type === 'dermal_radiation' || row.exam_type === 'glucometer_nutrition'
      ? row.exam_type
      : 'ocular_ultrasound';
  return {
    id: row.client_id || row.id || `remote-exam-${row.astronaut_id}-${row.recorded_at}`,
    astronautId: row.astronaut_id,
    examType: validExam,
    recordedAt: row.recorded_at,
    severity: row.severity || 'nominal',
    findings: row.findings,
    recommendedActions: Array.isArray(row.recommended_actions) ? row.recommended_actions : [],
    groundConsultRequired: Boolean(row.ground_consult_required),
    analysisSource: row.analysis_source || 'database',
    imageQuality: 'acceptable',
    ...(row.thumbnail_data_url ? { thumbnailDataUrl: row.thumbnail_data_url } : {}),
  };
}

export async function listImageAssessments(astronautId: string): Promise<ImageAssessmentRecord[]> {
  try {
    const items = await localDb.imagingAssessments.where('astronautId').equals(astronautId).toArray();
    const sortedLocal = items.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    if (!isOnlineHttpBrowser()) return sortedLocal;
    try {
      const { records } = await fetchAssessmentsRemote(astronautId, 40);
      if (!Array.isArray(records) || records.length === 0) return sortedLocal;
      const merged = new Map<string, ImageAssessmentRecord>();
      for (const item of sortedLocal) merged.set(item.id, item);
      const remoteOnly: ImageAssessmentRecord[] = [];
      for (const row of records) {
        const mapped = remoteRowToAssessment(row);
        if (!merged.has(mapped.id)) {
          merged.set(mapped.id, mapped);
          remoteOnly.push(mapped);
        }
      }
      if (remoteOnly.length > 0) {
        await localDb.imagingAssessments.bulkPut(remoteOnly).catch(() => {});
      }
      return [...merged.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    } catch {
      return sortedLocal;
    }
  } catch {
    return [];
  }
}

export async function runAndSaveSelfExam(params: {
  astronautId: string;
  examType: SelfExamType;
  dataUrl: string;
  mimeType: string;
  notes: string;
  vitals: VitalSigns;
  kpIndex: number;
  offline: boolean;
}): Promise<ImageAssessmentRecord> {
  const guide = SELF_EXAM_GUIDES[params.examType];
  const base64 = params.dataUrl.split(',')[1] || '';

  let record: ImageAssessmentRecord = {
    id: crypto.randomUUID(),
    astronautId: params.astronautId,
    examType: params.examType,
    recordedAt: new Date().toISOString(),
    severity: 'nominal',
    findings: `Offline ${guide.label} saved on device. Follow checklist guidelines and re-evaluate in Ground telemetry window.`,
    recommendedActions: [guide.steps[0], guide.steps[2], `Baseline: ${guide.normalReference}`],
    groundConsultRequired: false,
    analysisSource: 'device-offline',
    imageQuality: params.dataUrl ? 'Captured local image frame' : 'Checklist only',
    thumbnailDataUrl: params.dataUrl || undefined,
  };

  if (!params.offline) {
    try {
      const apiRes = await analyzeSelfExamImageApi({
        astronaut_id: params.astronautId,
        exam_type: params.examType,
        image_base64: base64 || undefined,
        mime_type: params.mimeType,
        notes: params.notes || undefined,
        mission_zone: params.vitals.mission_zone,
        mission_day: params.vitals.mission_day,
        blood_glucose: params.vitals.blood_glucose,
        radiation_rate: params.vitals.radiation_rate,
        kp_index: params.kpIndex,
        heart_rate: params.vitals.heart_rate,
        spo2: params.vitals.spo2,
      });
      record = {
        ...record,
        severity: apiRes.severity,
        findings: apiRes.findings,
        recommendedActions: apiRes.recommended_actions,
        groundConsultRequired: apiRes.ground_consult_required,
        analysisSource: apiRes.analysis_source,
        imageQuality: apiRes.image_quality,
      };
    } catch {
      // Retain offline protocol-assisted result cleanly when server is unreachable.
    }
  }

  try {
    await localDb.imagingAssessments.put(record);
  } catch {
    // Non-blocking storage fallback when IndexedDB is unavailable in constrained environments.
  }

  if (!params.offline) {
    const payload = {
      client_id: record.id,
      astronaut_id: record.astronautId,
      exam_type: record.examType,
      recorded_at: record.recordedAt,
      severity: record.severity,
      findings: record.findings,
      recommended_actions: record.recommendedActions,
      ground_consult_required: record.groundConsultRequired,
      analysis_source: record.analysisSource,
      ...(record.thumbnailDataUrl ? { thumbnail_data_url: record.thumbnailDataUrl } : {}),
    };
    void syncAssessmentRemote(payload).catch(() => {});
  }

  return record;
}
