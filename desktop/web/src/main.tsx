import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { SystemActionsProvider } from "./contexts/SystemActions";
import { I18nProvider } from "./i18n";
import { exposePluginSDK } from "./plugins";
import { ThemeProvider } from "./themes";
import { JARVIS_BASE_PATH } from "./lib/api";

// Expose the plugin SDK before rendering so plugins loaded via <script>
// can access React, components, etc. immediately.
exposePluginSDK();

type RootErrorBoundaryState = {
  error: Error | null;
};

class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[jarvis-renderer] startup render failed", error, info);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="jarvis-boot" role="alert">
        <section className="jarvis-boot__card">
          <div className="jarvis-boot__orb" aria-hidden="true" />
          <p className="jarvis-boot__label">JARVIS</p>
          <p className="jarvis-boot__detail">
            The desktop shell started, but the interface hit a render error.
            Restart JARVIS from the title bar or check the desktop log.
          </p>
          <pre className="max-w-[34rem] overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-3 text-xs text-cyan-50">
            {this.state.error.message}
          </pre>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={JARVIS_BASE_PATH || undefined}>
    <I18nProvider>
      <ThemeProvider>
        <SystemActionsProvider>
          <RootErrorBoundary>
            <App />
          </RootErrorBoundary>
        </SystemActionsProvider>
      </ThemeProvider>
    </I18nProvider>
  </BrowserRouter>,
);
