export {};

declare global {
  interface JarvisDesktopBridge {
    getBackendStatus: () => Promise<{
      ok: boolean;
      baseUrl: string;
      status?: unknown;
      error?: string;
    }>;
    windowControl: (
      action: "minimize" | "maximize" | "toggle-maximize" | "close",
    ) => Promise<{
      ok: boolean;
      maximized?: boolean;
      error?: string;
    }>;
  }

  interface Window {
    jarvisDesktop?: JarvisDesktopBridge;
  }
}
