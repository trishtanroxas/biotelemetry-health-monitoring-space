export const onboardingKey = 'biotelemetry:onboarding:v2';
export function isWelcomeHidden(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    const value = JSON.parse(storage.getItem(onboardingKey) ?? 'null');
    return value?.version === 2 && value.dontShowAgain === true;
  } catch { return false; }
}
export function saveWelcomePreference(storage: Pick<Storage, 'setItem'>, dontShowAgain: boolean): boolean {
  try { storage.setItem(onboardingKey, JSON.stringify({ version: 2, dontShowAgain })); return true; }
  catch { return false; }
}

export const tourSteps = [
  { id: 'checkin', selector: '[data-tour="checkin"]', label: 'Your first click', title: 'Start with how you feel.',
    description: 'Use Record Today’s Health for a three-step check-in: sleep, wellbeing and activity. Your unfinished answers stay on this device.',
    hint: 'After the tour, this is the first button to use.' },
  { id: 'focus', selector: '[data-tour="focus"]', label: 'Open a focus card', title: 'Put an observation in context.',
    description: 'Each of the four cards opens a detail dialog. Explore your observations beside the relevant NASA research, with sources and species clearly labeled.',
    hint: 'Select a card to see its observations and research. No health score is inferred.' },
  { id: 'demo', selector: '[data-tour="demo"]', label: 'Try a fictional week', title: 'Explore before entering data.',
    description: 'Start demo loads seven fictional days. Switch scenarios and move the day slider to see the cards change. Exit demo restores your saved-data view.',
    hint: 'The demo is temporary. Your check-ins and vision history stay untouched.' },
  { id: 'navigation', selector: '[data-tour="navigation"]', label: 'Find your way around', title: 'A place for each part of your day.',
    description: 'Check-In records your day. My Health Trends shows saved history. Daily Activities tracks completed routines. The Assistant explains selected saved context.',
    hint: 'The Assistant is a local demo adapter; no external AI provider is connected.' },
  { id: 'crew', selector: '[data-tour="crew"]', label: 'Keep the right context', title: 'Choose the astronaut first.',
    description: 'Use this selector to change crew member. Check-ins, activities and vision observations are separated by astronaut in this browser.',
    hint: 'You are ready. Open your first check-in, or finish here and explore.' },
] as const;

export interface TourRect { left: number; top: number; width: number; height: number }
export function placeTourCard(target: TourRect | null, viewport: { width: number; height: number }, cardHeight: number) {
  const margin = 12, gap = 16;
  const width = Math.max(1, Math.min(384, viewport.width - margin * 2));
  const height = Math.min(cardHeight, Math.max(1, viewport.height - margin * 2));
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
  if (!target) return { left: (viewport.width - width) / 2, top: Math.max(margin, (viewport.height - height) / 2), width, placement: 'center' };
  const bottom = target.top + target.height, right = target.left + target.width;
  let left = clamp(target.left, margin, viewport.width - width - margin), top: number, placement: string;
  if (viewport.height - bottom - gap - margin >= height) { top = bottom + gap; placement = 'below'; }
  else if (target.top - gap - margin >= height) { top = target.top - gap - height; placement = 'above'; }
  else if (viewport.width - right - gap - margin >= width) { left = right + gap; top = target.top; placement = 'right'; }
  else if (target.left - gap - margin >= width) { left = target.left - gap - width; top = target.top; placement = 'left'; }
  else { top = bottom + gap; placement = 'compact'; }
  return { left, top: clamp(top, margin, viewport.height - height - margin), width, placement };
}
