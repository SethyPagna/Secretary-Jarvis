import { useRuntimeSnapshot } from "@/contexts/RuntimeProvider";

/**
 * Light-weight status poll for the app shell (sidebar). The Status page uses
 * its own faster interval; we keep this slower to avoid duplicate load.
 */
export function useSidebarStatus() {
  return useRuntimeSnapshot().status;
}
