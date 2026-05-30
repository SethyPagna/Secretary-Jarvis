import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import type { StatusResponse } from "@/lib/api";
import { useScheduledPoll } from "@/hooks/useScheduledPoll";

const POLL_MS = 10_000;

/**
 * Light-weight status poll for the app shell (sidebar). The Status page uses
 * its own faster interval; we keep this slower to avoid duplicate load.
 */
export function useSidebarStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const load = useCallback(() => {
    return api
      .getStatus()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  useScheduledPoll(load, { intervalMs: POLL_MS });

  return status;
}
