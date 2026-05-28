import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Cpu,
  FolderSearch,
  HardDrive,
  RefreshCw,
  Volume2,
  XCircle,
} from "lucide-react";
import { Badge } from "@jarvis_managed-research/ui/ui/components/badge";
import { Button } from "@jarvis_managed-research/ui/ui/components/button";
import { KnowledgePage } from "@/components/KnowledgePage";
import { setupItems, setupSections } from "@/content/knowledge";
import { api, type LocalModelsResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-4">
      <LocalRuntimePanel />
      <KnowledgePage
        title="Setup"
        subtitle="Runtime checks for packaged desktop, local models, voice, permissions, gateway, and updates."
        sections={setupSections}
        items={setupItems}
        slotName="setup"
      />
    </div>
  );
}

function LocalRuntimePanel() {
  const [models, setModels] = useState<LocalModelsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      setModels(await api.getLocalModels());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const counts = useMemo(() => {
    const list = models?.models ?? [];
    return {
      llm: list.filter((model) => model.kind === "llm").length,
      stt: list.filter((model) => model.kind === "stt").length,
      tts: list.filter((model) => model.kind === "tts").length,
      total: list.length,
    };
  }, [models]);

  return (
    <section className="border border-current/15 bg-background-base/45 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <HardDrive className="h-4 w-4 text-midground" />
            <h1 className="text-sm font-semibold uppercase tracking-[0.1em] text-text-primary">
              Local Runtime
            </h1>
            <StatusBadge ok={counts.llm > 0} label={counts.llm > 0 ? "LLM assets found" : "No LLM assets"} />
            <StatusBadge ok={counts.stt > 0} label={counts.stt > 0 ? "Whisper ready" : "STT model missing"} />
            <StatusBadge ok={counts.tts > 0} label={counts.tts > 0 ? "Voice assets ready" : "TTS assets missing"} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-5 text-text-secondary">
            One local desktop runtime: model folder first, llama.cpp first, vLLM second, Ollama last.
            Voice uses local Kokoro and Whisper assets when present.
          </p>
        </div>

        <Button
          ghost
          className="h-8 shrink-0 gap-2 whitespace-nowrap px-3"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <RuntimeMetric icon={<Cpu className="h-4 w-4" />} label="LLM" value={`${counts.llm} local`} />
        <RuntimeMetric icon={<FolderSearch className="h-4 w-4" />} label="STT" value={`${counts.stt} Whisper`} />
        <RuntimeMetric icon={<Volume2 className="h-4 w-4" />} label="TTS" value={`${counts.tts} voice`} />
      </div>

      {models?.roots?.length ? (
        <div className="mt-3 min-w-0 break-words border border-current/10 bg-background-base/25 px-3 py-2 text-xs text-text-tertiary">
          <span className="text-text-secondary">Model roots: </span>
          <span className="font-mono">{models.roots.join(" | ")}</span>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function RuntimeMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border border-current/10 bg-background-base/25 px-3 py-2">
      <span className="text-midground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
          {label}
        </div>
        <div className="truncate text-sm font-semibold text-text-primary">{value}</div>
      </div>
    </div>
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
