declare global {
  interface Window {
    /** Set true by the server only for `jarvis dashboard --tui` (or JARVIS_DASHBOARD_TUI=1). */
    __JARVIS_DASHBOARD_EMBEDDED_CHAT__?: boolean;
    __JARVIS_DASHBOARD_TUI__?: boolean;
  }
}

/** True only when the dashboard was started with embedded TUI Chat (`jarvis dashboard --tui`). */
export function isDashboardEmbeddedChatEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__JARVIS_DASHBOARD_EMBEDDED_CHAT__ === true) return true;
  return window.__JARVIS_DASHBOARD_TUI__ === true;
}
