import { CameraOff, RotateCw, Video } from "lucide-react";
import { useState } from "react";
import { formatTime } from "../format";
import { PanelHeader, StatusPill } from "./ui";

/** Retour webcam : flux MJPEG annoté produit par le service IA, relayé par l'API. */
export function VideoPanel({ now }: { now: number }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "live" | "failed">("loading");

  const retry = () => {
    setState("loading");
    setAttempt((a) => a + 1);
  };

  return (
    <section className="panel video">
      <PanelHeader
        icon={Video}
        title="Vision · CAM-01"
        subtitle="Détection IA en local"
        actions={
          state === "live" ? (
            <StatusPill tone="good">En direct</StatusPill>
          ) : state === "failed" ? (
            <StatusPill tone="critical">Indisponible</StatusPill>
          ) : (
            <StatusPill tone="idle">Connexion…</StatusPill>
          )
        }
      />
      <div className={`video-frame is-${state}`}>
        <span className="hud-corner tl" aria-hidden />
        <span className="hud-corner tr" aria-hidden />
        <span className="hud-corner bl" aria-hidden />
        <span className="hud-corner br" aria-hidden />
        {state !== "failed" && (
          <img
            key={attempt}
            src={`/api/v1/video?t=${attempt}`}
            alt="Flux webcam analysé par l'IA"
            onLoad={() => setState("live")}
            onError={() => setState("failed")}
          />
        )}
        {state === "live" && (
          <>
            <span className="hud-badge hud-rec">
              <span className="rec-dot" aria-hidden /> REC
            </span>
            <span className="hud-badge hud-time">{formatTime(now)}</span>
          </>
        )}
        {state === "failed" && (
          <div className="video-placeholder">
            <span className="placeholder-icon">
              <CameraOff size={26} aria-hidden />
            </span>
            <p className="placeholder-title">Flux vidéo indisponible</p>
            <p className="placeholder-text">Le service IA ne diffuse pas encore la webcam.</p>
            <button type="button" className="btn btn-ghost" onClick={retry}>
              <RotateCw size={15} aria-hidden /> Réessayer
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
