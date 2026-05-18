const PANEL_CACHE_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

interface PanelCacheEntry<T> {
  version: number;
  savedAt: number;
  value: T;
}

export function panelCacheKey(apiBaseUrl: string, path: string): string {
  return `jarvis:hud-panel:${PANEL_CACHE_VERSION}:${apiBaseUrl}:${path}`;
}

export function readPanelCache<T>(key: string, maxAgeMs = DEFAULT_MAX_AGE_MS): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as PanelCacheEntry<T>;
    if (parsed.version !== PANEL_CACHE_VERSION || Date.now() - parsed.savedAt > maxAgeMs) {
      return undefined;
    }
    return parsed.value;
  } catch {
    return undefined;
  }
}

export function writePanelCache<T>(key: string, value: T): void {
  try {
    const entry: PanelCacheEntry<T> = {
      version: PANEL_CACHE_VERSION,
      savedAt: Date.now(),
      value
    };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Cache failures should never block Jarvis controls.
  }
}

export async function fetchPanelJson<T>(apiBaseUrl: string, path: string): Promise<T | undefined> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    return undefined;
  }
  const payload = (await response.json()) as T;
  writePanelCache(panelCacheKey(apiBaseUrl, path), payload);
  return payload;
}
