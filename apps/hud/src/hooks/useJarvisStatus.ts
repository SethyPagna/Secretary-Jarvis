import { useEffect, useState } from "react";
import type { JarvisStatus } from "@jarvis/core";

const API_BASE_URL = import.meta.env.VITE_JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4317";

export function useJarvisStatus() {
  const [status, setStatus] = useState<JarvisStatus | null>(null);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/status`);
        if (!response.ok) {
          throw new Error(`Gateway ${response.status}`);
        }
        const next = (await response.json()) as JarvisStatus;
        if (!cancelled) {
          setStatus(next);
          setOnline(true);
        }
      } catch {
        if (!cancelled) {
          setOnline(false);
        }
      }
    }

    void load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { status, online, apiBaseUrl: API_BASE_URL };
}
