import { useEffect, useState } from "react";
import { mistralGateway, type MistralGatewayStatus } from "@/lib/mistralGateway";

/** Abonnement live au guichet Mistral — pour afficher un indicateur de débit. */
export function useMistralGatewayStatus(): MistralGatewayStatus {
  const [status, setStatus] = useState<MistralGatewayStatus>(() =>
    mistralGateway.status(),
  );

  useEffect(() => mistralGateway.subscribe(setStatus), []);

  return status;
}
