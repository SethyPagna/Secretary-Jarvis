import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Container,
  MoreHorizontal,
  Play,
  RefreshCw,
  Save,
  Square,
  XCircle,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { KnowledgePage } from "@/components/KnowledgePage";
import { setupItems, setupSections } from "@/content/knowledge";
import {
  api,
  type DockerRuntimeActionResponse,
  type DockerRuntimeStatusResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type DockerProfile = "auto" | "llamacpp" | "vllm" | "ollama";

const profileOptions: Array<{ id: DockerProfile; label: string; hint: string }> = [
  { id: "auto", label: "Auto", hint: "llama.cpp, then vLLM, then Ollama" },
  { id: "llamacpp", label: "llama.cpp", hint: "Default GGUF runtime" },
  { id: "vllm", label: "vLLM", hint: "Throughput runtime" },
  { id: "ollama", label: "Ollama", hint: "Compatibility fallback" },
];

export default function SetupPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-4">
      <DockerModelsPanel />
      <KnowledgePage
        title="Setup"
        subtitle="Production setup checkpoints for dependencies, local models, desktop behavior, Docker/WSL, and packaging."
        sections={setupSections}
        items={setupItems}
        slotName="setup"
      />
    </div>
  );
}

function DockerModelsPanel() {
  const [profile, setProfile] = useState<DockerProfile>("auto");
  const [includeVoice, setIncludeVoice] = useState(true);
  const [status, setStatus] = useState<DockerRuntimeStatusResponse | null>(null);
  const [lastAction, setLastAction] = useState<DockerRuntimeActionResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const refresh = async (selectedProfile = profile) => {
    setBusy("refresh");
    try {
      const next = await api.getDockerRuntime(selectedProfile);
      setStatus(next);
    } catch (error) {
      setLastAction({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void api
      .getDockerRuntime("auto")
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLastAction({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const action = async (
    name: string,
    callback: () => Promise<DockerRuntimeActionResponse>,
  ) => {
    setBusy(name);
    try {
      const result = await callback();
      setLastAction(result);
      setStatus(result.status ?? status);
    } catch (error) {
      setLastAction({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const serviceCount = status?.services?.services?.length ?? 0;
  const runningServices = useMemo(() => {
    const services = status?.services?.services ?? [];
    return services.filter((service) =>
      String(service.State ?? service.state ?? service.Status ?? "")
        .toLowerCase()
        .includes("running"),
    ).length;
  }, [status]);

  const llmProbe =
    status?.profile === "vllm"
      ? status.probes?.vllm
      : status?.profile === "ollama"
        ? status.probes?.ollama
        : status?.probes?.llamacpp;
  const voiceProbe = status?.probes?.voice;

  return (
    <section className="border border-current/15 bg-background-base/45 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Container className="h-4 w-4 text-midground" />
            <h1 className="font-mondwest text-display text-sm uppercase tracking-[0.12em] text-text-primary">
              Docker Local Models
            </h1>
            <StatusBadge
              ok={Boolean(status?.docker_available && status.compose_available)}
              label={
                status?.docker_available && status.compose_available
                  ? "Docker ready"
                  : "Docker not ready"
              }
            />
            <StatusBadge
              ok={Boolean(llmProbe?.ok)}
              label={llmProbe?.ok ? "LLM endpoint online" : "LLM offline"}
            />
            <StatusBadge
              ok={Boolean(voiceProbe?.ok)}
              label={voiceProbe?.ok ? "Voice endpoint online" : "Voice offline"}
            />
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-5 text-text-secondary">
            JARVIS can start Docker services for local LLM, STT, and TTS, then
            apply their loopback endpoints to the desktop backend. Resource
            caps are not hard-coded; stopping services returns idle Docker/WSL
            resources to the host.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            ghost
            className="h-8 gap-2"
            disabled={Boolean(busy)}
            onClick={() => void refresh(profile)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy === "refresh" && "animate-spin")} />
            Refresh
          </Button>
          <Button
            className="h-8 gap-2"
            disabled={Boolean(busy)}
            onClick={() =>
              void action("start", () =>
                api.startDockerRuntime({ profile, include_voice: includeVoice }),
              )
            }
          >
            <Play className="h-3.5 w-3.5" />
            Start
          </Button>
          <Button
            ghost
            className="h-8 gap-2"
            disabled={Boolean(busy)}
            onClick={() => void action("apply", () => api.applyDockerRuntime({ profile, include_voice: includeVoice }))}
          >
            <Save className="h-3.5 w-3.5" />
            Apply
          </Button>
          <Button
            ghost
            className="h-8 gap-2 text-text-secondary"
            disabled={Boolean(busy)}
            onClick={() => void action("stop", () => api.stopDockerRuntime())}
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
          <Button
            ghost
            size="icon"
            aria-label="Show Docker details"
            className="h-8 w-8 text-text-tertiary hover:text-midground"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex flex-wrap gap-1.5">
          {profileOptions.map((option) => {
            const active = option.id === profile;
            return (
              <button
                key={option.id}
                type="button"
                title={option.hint}
                onClick={() => {
                  setProfile(option.id);
                  void refresh(option.id);
                }}
                className={cn(
                  "border px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "border-midground/70 bg-midground/10 text-midground"
                    : "border-current/15 bg-background-base/25 text-text-secondary hover:border-midground/40 hover:text-midground",
                )}
              >
                {option.label}
              </button>
            );
          })}
          <label className="flex items-center gap-2 border border-current/15 bg-background-base/25 px-3 py-1.5 text-xs text-text-secondary">
            <input
              checked={includeVoice}
              className="h-3.5 w-3.5 accent-midground"
              onChange={(event) => setIncludeVoice(event.target.checked)}
              type="checkbox"
            />
            Voice runtime
          </label>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-text-tertiary">
          <span>{status?.profile ? `Selected: ${status.profile}` : "Selected: checking"}</span>
          <span>{serviceCount ? `${runningServices}/${serviceCount} running` : "No service state yet"}</span>
        </div>
      </div>

      {lastAction?.error ? (
        <div className="mt-3 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {lastAction.error}
        </div>
      ) : null}

      {lastAction?.ok && lastAction.changed_keys?.length ? (
        <div className="mt-3 border border-midground/30 bg-midground/5 px-3 py-2 text-sm text-text-secondary">
          Applied Docker runtime config: {lastAction.changed_keys.join(", ")}
        </div>
      ) : null}

      {detailsOpen ? (
        <div className="mt-3 grid gap-2 border border-current/10 bg-background-base/35 p-3 text-xs text-text-secondary md:grid-cols-2 xl:grid-cols-4">
          <Detail label="Compose" value={status?.compose_file ?? "Not loaded"} />
          <Detail label="Models" value={String(status?.plan?.models_root ?? "Not detected")} />
          <Detail label="LLM URL" value={String(status?.endpoints?.[status.profile] ?? status?.endpoints?.llamacpp ?? "")} />
          <Detail label="Voice URL" value={String(status?.endpoints?.voice ?? "")} />
        </div>
      ) : null}
    </section>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge className={cn("gap-1 text-[0.62rem]", ok ? "text-emerald-300" : "text-amber-300")}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mondwest text-display text-[0.65rem] uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 min-w-0 border border-current/10 bg-background-base/25 px-2 py-1.5">
        <code className="block truncate bg-transparent font-mono text-[0.72rem] text-text-secondary" title={value}>
          {value || "Not set"}
        </code>
      </div>
    </div>
  );
}
