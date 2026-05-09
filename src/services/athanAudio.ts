import type { AthanStyle, PrayerKey } from '../stores/settingsStore';
import { useSettingsStore } from '../stores/settingsStore';

/** Regular / Fajr pairs per style. Medina falls back to Mecca files if the Medina asset is missing. */
const STYLE_SRC: Record<Exclude<AthanStyle, 'simple'>, { reg: string; fajr: string }> = {
  mecca: { reg: '/athan.mp3', fajr: '/fajr.mp3' },
  medina: { reg: '/athan-medina.mp3', fajr: '/fajr.mp3' },
};

const audios: Record<string, HTMLAudioElement> = {};

function getAudio(src: string): HTMLAudioElement {
  if (!audios[src]) {
    audios[src] = new Audio(src);
    audios[src].preload = 'auto';
  }
  return audios[src];
}

let simpleTimer: ReturnType<typeof setTimeout> | null = null;
let simpleCtx: AudioContext | null = null;

function stopSimpleBeep(): void {
  if (simpleTimer != null) {
    clearTimeout(simpleTimer);
    simpleTimer = null;
  }
}

function playSimpleBeep(volume: number): void {
  stopSimpleBeep();
  try {
    simpleCtx ??= new AudioContext();
    const ctx = simpleCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = Math.min(0.35, Math.max(0.02, volume * 0.25));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const stopAt = ctx.currentTime + 0.35;
    gain.gain.exponentialRampToValueAtTime(0.001, stopAt);
    osc.stop(stopAt);
    simpleTimer = window.setTimeout(() => {
      simpleTimer = null;
    }, 400);
  } catch {
    /* ignore */
  }
}

function playMp3(src: string, volume: number, fallbackSrc?: string): void {
  const a = getAudio(src);
  a.volume = volume;
  a.currentTime = 0;
  a.play().catch(() => {
    if (fallbackSrc && fallbackSrc !== src) {
      playMp3(fallbackSrc, volume);
    }
  });
}

export function playAthan(prayerKey: PrayerKey): void {
  const cfg = useSettingsStore.getState().prayerConfig;
  if (!cfg.athanEnabled) return;
  if (!cfg.athanPrayers.includes(prayerKey)) return;

  const vol = Math.max(0, Math.min(1, (cfg.athanVolume ?? 70) / 100));
  const style = cfg.athanStyle ?? 'mecca';

  if (style === 'simple') {
    playSimpleBeep(vol);
    return;
  }

  const pair = STYLE_SRC[style];
  const primary = prayerKey === 'fajr' ? pair.fajr : pair.reg;
  const meccaPair = STYLE_SRC.mecca;
  const fallback =
    style === 'medina' ? (prayerKey === 'fajr' ? meccaPair.fajr : meccaPair.reg) : undefined;

  playMp3(primary, vol, fallback);
}

export function stopAthan(): void {
  stopSimpleBeep();
  for (const a of Object.values(audios)) {
    a.pause();
    a.currentTime = 0;
  }
}

export function preloadAthan(): void {
  for (const pair of Object.values(STYLE_SRC)) {
    getAudio(pair.reg);
    getAudio(pair.fajr);
  }
}
