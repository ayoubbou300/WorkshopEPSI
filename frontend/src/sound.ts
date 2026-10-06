import { useCallback, useState } from "react";
import type { Severity } from "./types";

const STORAGE_KEY = "sentinel.sound";
let context: AudioContext | null = null;

/** Bip d'alerte synthétisé (aucun fichier audio) : deux tons pour critique, un pour avertissement. */
export function playAlertSound(severity: Severity) {
  if (severity === "info") return;
  try {
    context ??= new AudioContext();
    const tones = severity === "critical" ? [880, 660, 880] : [740];
    tones.forEach((frequency, i) => {
      const start = context!.currentTime + i * 0.18;
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(context!.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
  } catch {
    /* audio indisponible : l'alerte reste visuelle */
  }
}

export function useSoundSetting(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setEnabled((value) => {
      try {
        localStorage.setItem(STORAGE_KEY, value ? "off" : "on");
      } catch {
        /* préférence non mémorisée */
      }
      return !value;
    });
  }, []);
  return [enabled, toggle];
}
