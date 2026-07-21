import { useEffect, useState } from "react";
import { useMistralGatewayStatus } from "@/hooks/useMistralGatewayStatus";

/**
 * Indicateur global (visible depuis n'importe quel écran) quand le guichet
 * Mistral met les appels en pause suite à un 429/502/503 — remplace le
 * silence total pendant les tentatives de retry par un statut lisible.
 */
export function MistralGatewayBanner() {
  const status = useMistralGatewayStatus();
  const [now, setNow] = useState(() => Date.now());

  const paused = status.pausedUntil > now;

  useEffect(() => {
    if (!paused) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  if (!paused) return null;

  const secondsLeft = Math.max(0, Math.ceil((status.pausedUntil - now) / 1000));
  const waitingCount = status.queueLength + status.active;

  return (
    <div className="mistral-gateway-banner" role="status" aria-live="polite">
      <span className="mistral-gateway-banner-dot" aria-hidden="true" />
      <span>
        Ralenti par Mistral (limite de débit) — reprise dans <strong>{secondsLeft}s</strong>
        {waitingCount > 0
          ? ` · ${waitingCount} appel${waitingCount > 1 ? "s" : ""} en attente`
          : ""}
      </span>
    </div>
  );
}
