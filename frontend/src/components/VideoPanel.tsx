import { useState } from "react";

/** Retour webcam : flux MJPEG produit par le service IA, relayé par l'API. */
export function VideoPanel() {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  return (
    <div className="panel video">
      <h2>Retour webcam</h2>
      <div className="video-frame">
        {failed ? (
          <div className="video-placeholder">
            <p>Flux vidéo indisponible</p>
            <button
              className="btn"
              onClick={() => {
                setFailed(false);
                setAttempt((a) => a + 1);
              }}
            >
              Réessayer
            </button>
          </div>
        ) : (
          <img key={attempt} src={`/api/v1/video?t=${attempt}`} alt="Flux webcam analysé par l'IA" onError={() => setFailed(true)} />
        )}
      </div>
    </div>
  );
}
