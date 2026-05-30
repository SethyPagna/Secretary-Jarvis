import { useEffect } from "react";

type PollInterval = number | (() => number);

interface ScheduledPollOptions {
  enabled?: boolean;
  immediate?: boolean;
  intervalMs: PollInterval;
}

function resolveInterval(intervalMs: PollInterval): number {
  return typeof intervalMs === "function" ? intervalMs() : intervalMs;
}

export function useScheduledPoll(
  callback: () => Promise<unknown> | void,
  { enabled = true, immediate = true, intervalMs }: ScheduledPollOptions,
): void {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let timer: number | null = null;

    const schedule = () => {
      if (!cancelled) {
        timer = window.setTimeout(run, Math.max(250, resolveInterval(intervalMs)));
      }
    };

    const run = () => {
      Promise.resolve(callback())
        .catch(() => undefined)
        .finally(schedule);
    };

    if (immediate) {
      run();
    } else {
      schedule();
    }

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [callback, enabled, immediate, intervalMs]);
}
