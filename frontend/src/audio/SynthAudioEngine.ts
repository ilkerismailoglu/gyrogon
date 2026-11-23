import { HapticFeedbackKind, triggerHaptic } from '../services/nativeBridge';

export type SoundEffectType =
  | 'rotate'
  | 'lock'
  | 'clear'
  | 'bomb'
  | 'joker'
  | 'freeze'
  | 'danger'
  | 'revive'
  | 'bloom'
  | 'fold'
  | 'gameover';

export class SynthAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private hapticsEnabled = true;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.ctx = new Ctx();
      }
    }
    if (this.ctx && (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted')) {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  unlock(): void {
    this.ensureContext();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  get isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  vibrate(pattern: number | number[]): void {
    if (!this.hapticsEnabled) return;
    let kind: HapticFeedbackKind = 'light';
    if (Array.isArray(pattern)) {
      kind = (pattern[0] ?? 0) >= 35 ? 'error' : (pattern[0] ?? 0) >= 18 ? 'heavy' : 'success';
    } else if (pattern >= 15) {
      kind = 'medium';
    }
    triggerHaptic(kind);
  }

  play(type: SoundEffectType, combo = 1): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      switch (type) {
        case 'rotate': {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(240, now);
          osc.frequency.exponentialRampToValueAtTime(360, now + 0.045);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }
        case 'lock': {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(145, now);
          osc.frequency.exponentialRampToValueAtTime(72, now + 0.075);
          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        }
        case 'clear': {
          const pentatonic = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
          const root = pentatonic[Math.min(combo - 1, pentatonic.length - 1)] ?? 329.63;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(root, now);
          osc.frequency.exponentialRampToValueAtTime(root * 1.5, now + 0.2);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.22);
          break;
        }
        case 'bomb': {
          osc.type = 'square';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(42, now + 0.3);
          gain.gain.setValueAtTime(0.16, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
          osc.start(now);
          osc.stop(now + 0.32);
          break;
        }
        case 'joker': {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(1040, now + 0.16);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.start(now);
          osc.stop(now + 0.18);
          break;
        }
        case 'freeze': {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
          osc.start(now);
          osc.stop(now + 0.26);
          break;
        }
        case 'danger': {
          osc.type = 'square';
          osc.frequency.setValueAtTime(480, now);
          osc.frequency.setValueAtTime(380, now + 0.08);
          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        }
        case 'revive': {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(900, now + 0.28);
          gain.gain.setValueAtTime(0.14, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        }
        case 'bloom': {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(330, now);
          osc.frequency.exponentialRampToValueAtTime(493.88, now + 0.14);
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.32);
          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
          osc.start(now);
          osc.stop(now + 0.38);
          break;
        }
        case 'fold': {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(659.25, now);
          osc.frequency.exponentialRampToValueAtTime(440, now + 0.16);
          osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.32);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
          osc.start(now);
          osc.stop(now + 0.36);
          break;
        }
        case 'gameover': {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(240, now);
          osc.frequency.linearRampToValueAtTime(70, now + 0.45);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
          osc.start(now);
          osc.stop(now + 0.46);
          break;
        }
      }
    } catch {
      // Ignore Web Audio errors when blocked by autoplay policies
    }
  }
}

export const synthAudio = new SynthAudioEngine();
