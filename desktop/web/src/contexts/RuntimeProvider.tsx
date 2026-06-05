import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  api,
  type RuntimeReadinessResponse,
  type RuntimeStatsResponse,
  type StatusResponse,
  type TeamSoulInfo,
} from "@/lib/api";
import { useScheduledPoll } from "@/hooks/useScheduledPoll";

const RUNTIME_POLL_VISIBLE_MS = 10_000;
const RUNTIME_POLL_BACKGROUND_MS = 30_000;
const STATS_POLL_VISIBLE_MS = 1_000;
const STATS_POLL_BACKGROUND_MS = 5_000;

interface RuntimeSnapshotContextValue {
  bootstrapped: boolean;
  status: StatusResponse | null;
  readiness: RuntimeReadinessResponse | null;
  stats: RuntimeStatsResponse | null;
  teamSouls: TeamSoulInfo[];
  refreshRuntime: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

const RuntimeSnapshotContext = createContext<RuntimeSnapshotContextValue | null>(null);

function visibleInterval(visibleMs: number, backgroundMs: number): number {
  return document.visibilityState === "visible" ? visibleMs : backgroundMs;
}

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const bootstrappedRef = useRef(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [readiness, setReadiness] = useState<RuntimeReadinessResponse | null>(null);
  const [stats, setStats] = useState<RuntimeStatsResponse | null>(null);
  const [teamSouls, setTeamSouls] = useState<TeamSoulInfo[]>([]);

  const refreshLiveRuntime = useCallback(async () => {
    const [statusResult, readinessResult, soulsResult] = await Promise.allSettled([
      api.getStatus(),
      api.getRuntimeReadiness(),
      api.getTeamSouls(),
    ]);

    if (statusResult.status === "fulfilled") setStatus(statusResult.value);
    if (readinessResult.status === "fulfilled") setReadiness(readinessResult.value);
    if (soulsResult.status === "fulfilled") setTeamSouls(soulsResult.value.souls);
  }, []);

  const refreshRuntime = useCallback(async () => {
    if (bootstrappedRef.current) {
      await refreshLiveRuntime();
      return;
    }

    try {
      const bootstrap = await api.getDesktopBootstrap();
      bootstrappedRef.current = true;
      setBootstrapped(true);
      setStatus(bootstrap.status);
      setReadiness(bootstrap.readiness);
      setTeamSouls(bootstrap.souls.souls);
      if (bootstrap.stats) {
        setStats((currentStats) =>
          currentStats?.timestamp &&
          !currentStats.cached &&
          currentStats.cache !== "startup-manifest"
            ? currentStats
            : bootstrap.stats ?? currentStats,
        );
      }
      await refreshLiveRuntime();
    } catch {
      bootstrappedRef.current = true;
      setBootstrapped(true);
      await refreshLiveRuntime();
    }
  }, [refreshLiveRuntime]);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.getRuntimeStats());
    } catch {
      setStats(null);
    }
  }, []);

  useScheduledPoll(refreshRuntime, {
    intervalMs: () => visibleInterval(RUNTIME_POLL_VISIBLE_MS, RUNTIME_POLL_BACKGROUND_MS),
  });
  useScheduledPoll(refreshStats, {
    intervalMs: () => visibleInterval(STATS_POLL_VISIBLE_MS, STATS_POLL_BACKGROUND_MS),
  });

  const value = useMemo<RuntimeSnapshotContextValue>(
    () => ({
      bootstrapped,
      status,
      readiness,
      stats,
      teamSouls,
      refreshRuntime,
      refreshStats,
    }),
    [bootstrapped, readiness, refreshRuntime, refreshStats, stats, status, teamSouls],
  );

  return (
    <RuntimeSnapshotContext.Provider value={value}>
      {children}
    </RuntimeSnapshotContext.Provider>
  );
}

export function useRuntimeSnapshot(): RuntimeSnapshotContextValue {
  const value = useContext(RuntimeSnapshotContext);
  if (value === null) {
    throw new Error("useRuntimeSnapshot must be used inside RuntimeProvider");
  }
  return value;
}
