import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Clock, RotateCcw } from 'lucide-react';
import type { CheckInDraft } from '../services/checkInDraft';
import {
  UTC_TIME_SLOTS,
  applyUtcTimeSelection,
  formatUtcDate,
  formatUtcDateTime,
  formatUtcTime,
  shiftUtcDays,
  sleepTiming,
  utcPresetWindow,
} from '../services/sleepTiming';
import { FormField } from './WellnessUI';

interface Props {
  step: number;
  draft: CheckInDraft;
  update<K extends keyof CheckInDraft>(field: K, value: CheckInDraft[K]): void;
  error: string;
}

function OptionalRating({
  label,
  name,
  value,
  low,
  high,
  update,
}: {
  label: string;
  name: 'isolation' | 'socialConnection' | 'emotionalWellbeing';
  value: string;
  low: string;
  high: string;
  update: Props['update'];
}) {
  return (
    <div className="form-field">
      <span>{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="pill-choice-row" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === ''}
          className={`pill-choice ${value === '' ? 'active' : ''}`}
          onClick={() => update(name, '')}
        >
          Skip
        </button>
        {['1', '2', '3', '4', '5'].map(num => (
          <button
            key={num}
            type="button"
            role="radio"
            aria-checked={value === num}
            className={`pill-choice ${value === num ? 'active' : ''}`}
            onClick={() => update(name, num)}
          >
            {num}
          </button>
        ))}
      </div>
      <small>{`1 = ${low} · 5 = ${high}`}</small>
    </div>
  );
}

const PAIN_QUICK_CHIPS = [
  { value: '', label: 'Skip' },
  { value: '0', label: '0 (None)' },
  { value: '2', label: '2 (Mild)' },
  { value: '4', label: '4 (Mod)' },
  { value: '7', label: '7 (High)' },
];

function UtcTimeField({
  label,
  name,
  role,
  value,
  otherValue,
  onChange,
}: {
  label: string;
  name: 'sleepStartUtc' | 'wakeUtc';
  role: 'start' | 'wake';
  value: string;
  otherValue: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const now = new Date();
  const todayUtc = formatUtcDate(now);
  const yesterdayUtc = shiftUtcDays(todayUtc, -1);
  const currentUtcTime = formatUtcTime(now);
  const datePart = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
  const timePart = /T\d{2}:\d{2}$/.test(value) ? value.slice(11, 16) : '';
  const options: string[] = ['NOW', ...UTC_TIME_SLOTS];

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function openDropdown(initialIndex?: number) {
    const slotIdx = timePart ? UTC_TIME_SLOTS.indexOf(timePart) + 1 : 0;
    const currentSlotIdx =
      Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes()) / 30) + 1;
    const fallbackIdx = role === 'start' ? 45 : currentSlotIdx;
    setActiveIndex(initialIndex ?? (slotIdx > 0 ? slotIdx : fallbackIdx));
    setOpen(true);
  }

  function applyNow() {
    onChange(formatUtcDateTime(new Date()));
    setOpen(false);
  }

  function selectOption(option: string) {
    if (option === 'NOW') {
      applyNow();
    } else {
      onChange(
        applyUtcTimeSelection({
          role,
          timePart: option,
          currentValue: value,
          otherValue,
          now: new Date(),
        }),
      );
      setOpen(false);
    }
    triggerRef.current?.focus();
  }

  function updateDateOnly(nextDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      if (!nextDate) onChange('');
      return;
    }
    const defaultTime = timePart || (role === 'start' ? '22:00' : formatUtcTime(new Date()));
    onChange(`${nextDate}T${defaultTime}`);
  }

  function moveActive(delta: number) {
    setActiveIndex(prev => Math.max(0, Math.min(options.length - 1, prev + delta)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openDropdown();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(options[activeIndex] ?? 'NOW');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      const idx = options.findIndex((opt, i) => i > activeIndex && opt.startsWith(event.key));
      const wrapIdx = idx > 0 ? idx : options.findIndex(opt => opt.startsWith(event.key));
      if (wrapIdx > 0) setActiveIndex(wrapIdx);
    }
  }

  return (
    <div className="form-field utc-picker" ref={containerRef}>
      <div className="utc-picker-head">
        <span>{label}</span>
        {value && (
          <button
            type="button"
            className="utc-clear-link"
            onClick={() => onChange('')}
            aria-label={`Clear ${label}`}
          >
            Clear
          </button>
        )}
      </div>
      <input type="hidden" name={name} value={value} />

      <div className="utc-time-row">
        <div className="utc-dropdown">
          <button
            ref={triggerRef}
            type="button"
            className={`utc-dropdown-trigger ${timePart ? 'has-value' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={open ? `${listboxId}-opt-${activeIndex}` : undefined}
            aria-label={`${label}: ${value ? `${datePart} ${timePart} UTC` : 'Choose UTC time'}`}
            onClick={() => (open ? setOpen(false) : openDropdown())}
            onKeyDown={handleKeyDown}
          >
            <Clock size={15} aria-hidden="true" />
            <span>{timePart ? `${timePart} UTC` : 'Choose time (UTC)'}</span>
            <ChevronDown size={15} className="utc-chevron" aria-hidden="true" />
          </button>

          {open && (
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={`${label} time options`}
              className="utc-dropdown-panel"
              tabIndex={-1}
              onKeyDown={handleKeyDown}
            >
              {options.map((opt, idx) => {
                const isNow = opt === 'NOW';
                const isSelected = !isNow && opt === timePart;
                const isFocused = idx === activeIndex;
                return (
                  <button
                    key={opt}
                    id={`${listboxId}-opt-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={isFocused ? 'true' : undefined}
                    className={`utc-dropdown-option ${isNow ? 'now-option' : ''} ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectOption(opt)}
                  >
                    {isNow ? `Use current time (${currentUtcTime} UTC)` : `${opt} UTC`}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="button secondary compact-btn utc-now-btn"
          onClick={applyNow}
          title={`Set ${label} to current time (${todayUtc} ${currentUtcTime} UTC)`}
        >
          Current time
        </button>
      </div>

      <div className="utc-day-row">
        <div className="pill-choice-row" role="group" aria-label={`${label} UTC day`}>
          <button
            type="button"
            className={`pill-choice ${datePart === yesterdayUtc ? 'active' : ''}`}
            aria-pressed={datePart === yesterdayUtc}
            onClick={() => updateDateOnly(yesterdayUtc)}
            title={yesterdayUtc}
          >
            Yesterday
          </button>
          <button
            type="button"
            className={`pill-choice ${datePart === todayUtc ? 'active' : ''}`}
            aria-pressed={datePart === todayUtc}
            onClick={() => updateDateOnly(todayUtc)}
            title={todayUtc}
          >
            Today
          </button>
        </div>
        <input
          type="date"
          className="utc-date-input"
          aria-label={`${label} UTC date`}
          value={datePart}
          onChange={e => updateDateOnly(e.target.value)}
        />
      </div>
      {value && <small>Selected: {datePart} {timePart} UTC</small>}
    </div>
  );
}

export function SpaceCheckInFields({ step, draft, update }: Props) {
  const timing = sleepTiming(draft.sleepStartUtc, draft.wakeUtc);
  const roundedWindowHours = timing ? (Math.round((timing.windowMinutes / 60) * 4) / 4).toString() : '';

  const title =
    step === 0
      ? 'Sleep timing (UTC, optional)'
      : step === 1
        ? 'Connection and emotional well-being (optional)'
        : 'Physical discomfort & immune notes (optional)';

  function applyQuickWakePreset(hours: number) {
    const preset = utcPresetWindow(hours);
    update('sleepStartUtc', preset.sleepStartUtc);
    update('wakeUtc', preset.wakeUtc);
  }

  function clearSleepTiming() {
    update('sleepStartUtc', '');
    update('wakeUtc', '');
  }

  return (
    <section className="optional-fields-card" aria-label={title}>
      <div className="section-heading compact">
        <h3>{title}</h3>
        <span className="pill">Optional</span>
      </div>
      {step === 0 && (
        <>
          <p className="helper">
            Choose UTC times from the dropdown or tap Current time. Overnight wake-ups roll to the next UTC day automatically.
          </p>
          <div className="pill-choice-row" role="group" aria-label="Quick UTC sleep window presets">
            <button type="button" className="pill-choice" onClick={() => applyQuickWakePreset(8)}>
              Woke now · 8h sleep
            </button>
            <button type="button" className="pill-choice" onClick={() => applyQuickWakePreset(7)}>
              Woke now · 7h sleep
            </button>
            {(draft.sleepStartUtc || draft.wakeUtc) && (
              <button type="button" className="pill-choice" onClick={clearSleepTiming}>
                <RotateCcw size={13} aria-hidden="true" style={{ marginRight: 5, verticalAlign: '-2px' }} />
                Clear times
              </button>
            )}
          </div>
          <div className="form-grid">
            <UtcTimeField
              label="Sleep start (UTC)"
              name="sleepStartUtc"
              role="start"
              value={draft.sleepStartUtc}
              otherValue={draft.wakeUtc}
              onChange={next => update('sleepStartUtc', next)}
            />
            <UtcTimeField
              label="Wake-up (UTC)"
              name="wakeUtc"
              role="wake"
              value={draft.wakeUtc}
              otherValue={draft.sleepStartUtc}
              onChange={next => update('wakeUtc', next)}
            />
          </div>
          {timing && (
            <div className="row" role="status">
              <p className="helper" style={{ margin: 0 }}>
                Recorded sleep window: {(timing.windowMinutes / 60).toFixed(2)} hours. This is elapsed time, not necessarily time asleep.
              </p>
              <button
                type="button"
                className="button secondary compact-btn"
                onClick={() => update('sleepHours', roundedWindowHours)}
              >
                Apply {roundedWindowHours}h to sleep duration
              </button>
            </div>
          )}
        </>
      )}
      {step === 1 && (
        <>
          <p className="helper">
            Share only what you want to record. These are personal self-reports, not mental health diagnoses.
          </p>
          <div className="form-grid">
            <OptionalRating
              label="How isolated have you felt today?"
              name="isolation"
              value={draft.isolation}
              low="not at all"
              high="very much"
              update={update}
            />
            <OptionalRating
              label="How connected have you felt to other people?"
              name="socialConnection"
              value={draft.socialConnection}
              low="not connected"
              high="very connected"
              update={update}
            />
            <OptionalRating
              label="How has your emotional well-being felt today?"
              name="emotionalWellbeing"
              value={draft.emotionalWellbeing}
              low="very low"
              high="very good"
              update={update}
            />
          </div>
          <p className="helper">
            Personal reflections stay in this local prototype. Free-text notes are not sent to Gemini.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <p className="helper">
            A pain score describes your experience. It does not identify a condition or determine medical clearance.
          </p>
          <div className="form-grid">
            <FormField label="Pain intensity (0–10)" hint="Leave blank to skip. 0 = no pain; 10 = intense pain.">
              <input
                name="painIntensity"
                type="number"
                inputMode="numeric"
                min="0"
                max="10"
                step="1"
                value={draft.painIntensity}
                onChange={e => update('painIntensity', e.target.value)}
              />
              <div className="pill-choice-row" role="group" aria-label="Quick pain intensity presets">
                {PAIN_QUICK_CHIPS.map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    className={`pill-choice ${draft.painIntensity === chip.value ? 'active' : ''}`}
                    onClick={() => update('painIntensity', chip.value)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Pain location (optional)" hint="Up to 100 characters">
              <input
                name="painLocation"
                type="text"
                maxLength={100}
                value={draft.painLocation}
                onChange={e => update('painLocation', e.target.value)}
                placeholder="e.g. lower back"
              />
            </FormField>
          </div>
          <div className="form-grid">
            <FormField label="Discomfort notes (optional)" hint="Up to 500 characters. Follow approved procedures for medical concerns.">
              <textarea
                name="painNotes"
                rows={2}
                maxLength={500}
                value={draft.painNotes}
                onChange={e => update('painNotes', e.target.value)}
              />
            </FormField>
            <FormField label="Skin / immune signs (optional)" hint="Comma-separated signs e.g. dry skin, congestion">
              <input
                name="immuneSymptoms"
                type="text"
                maxLength={120}
                value={draft.immuneSymptoms ?? ''}
                onChange={e => update('immuneSymptoms', e.target.value)}
                placeholder="e.g. none, mild rash"
              />
            </FormField>
          </div>
        </>
      )}
    </section>
  );
}
