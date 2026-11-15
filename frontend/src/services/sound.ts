// Web Audio API Synthesizer for Space HUD Alarms
class SoundService {
  private audioCtx: AudioContext | null = null;
  public enabled: boolean = true;
  public isDashboardRoute: boolean = false;
  public volume: number = 0.5;

  private initCtx() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public setRoute(route: string) {
    const isDashboard = route !== 'landing' && route !== '' && !route.startsWith('#overview') && !route.startsWith('#problem') && !route.startsWith('#autonomy') && !route.startsWith('#capabilities') && !route.startsWith('#architecture') && !route.startsWith('#science') && !route.startsWith('#team');
    this.isDashboardRoute = isDashboard;
    if (!isDashboard) {
      this.stopAllAudio();
    }
  }

  public stopAllAudio() {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      this.audioCtx.suspend().catch(() => {});
    }
  }

  private canPlayAudio(): boolean {
    return this.enabled && this.isDashboardRoute && this.volume > 0;
  }

  // Soft blip when receiving telemetry updates
  playBlip() {
    if (!this.canPlayAudio()) return;
    this.initCtx();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0.015 * this.volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.05);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  // Critical warning tone for Hypoxia / Radiation Spike / Emergency
  playCritical() {
    if (!this.canPlayAudio()) return;
    this.initCtx();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      
      const now = this.audioCtx.currentTime;
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.15);
      osc.frequency.linearRampToValueAtTime(440, now + 0.3);

      gain.gain.setValueAtTime(0.08 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  // Emergency Alarm alias for backwards compatibility
  playEmergencyAlarm() {
    this.playCritical();
  }

  // Warning tone: dual-step descending alert (660Hz -> 550Hz)
  playWarning() {
    if (!this.canPlayAudio()) return;
    this.initCtx();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';

      const now = this.audioCtx.currentTime;
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(550, now + 0.12);

      gain.gain.setValueAtTime(0.06 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {}
  }

  // Informational chime: gentle sine chime (880Hz)
  playInfo() {
    if (!this.canPlayAudio()) return;
    this.initCtx();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';

      const now = this.audioCtx.currentTime;
      osc.frequency.setValueAtTime(880, now);

      gain.gain.setValueAtTime(0.04 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {}
  }

  // Success chime: ascending celestial chord arpeggio (C5 -> E5 -> G5)
  playSuccess() {
    if (!this.canPlayAudio()) return;
    this.initCtx();
    if (!this.audioCtx) return;

    try {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      const now = this.audioCtx.currentTime;

      notes.forEach((freq, idx) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.035 * this.volume, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.18);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.18);
      });
    } catch (e) {}
  }
}

export const soundService = new SoundService();

