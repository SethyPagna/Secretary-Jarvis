import { existsSync } from "node:fs";
import { join } from "node:path";

export interface PackagingReadiness {
  generatedAt: string;
  root: string;
  electron: {
    ready: boolean;
    packageJson: string;
    mainEntry: string;
    rendererBuild: string;
    mainBuild: string;
    releaseFolder: string;
    commands: string[];
    note: string;
  };
  tauriFallback: {
    ready: boolean;
    configPath: string;
    commands: string[];
    note: string;
  };
  startup: {
    startScript: string;
    stopScript: string;
    registerScript: string;
    checkOnlyCommand: string;
    standardRegisterCommand: string;
    elevatedRegisterCommand: string;
    note: string;
  };
  backgroundRuntime: {
    pidFolder: string;
    logFolder: string;
    expectedProcesses: string[];
    wakeMethods: Array<{ id: string; label: string; status: "ready" | "staged"; detail: string }>;
  };
  summary: {
    electronShellReady: boolean;
    tauriFallbackReady: boolean;
    startupScriptsReady: boolean;
    productionCommandsReady: boolean;
  };
  recommendations: string[];
}

export function buildPackagingReadiness(params: { root: string; generatedAt: string }): PackagingReadiness {
  const electron = electronReadiness(params.root);
  const tauriFallback = tauriReadiness(params.root);
  const startup = startupCommands(params.root);
  const startupScriptsReady = [startup.startScript, startup.stopScript, startup.registerScript].every((path) => existsSync(path));
  const productionCommandsReady = electron.ready && startupScriptsReady;

  return {
    generatedAt: params.generatedAt,
    root: params.root,
    electron,
    tauriFallback,
    startup,
    backgroundRuntime: {
      pidFolder: join(params.root, "data", "runtime"),
      logFolder: join(params.root, "data", "logs"),
      expectedProcesses: ["ollama.exe", "python.exe", "node.exe", "electron.exe", "Secretary Jarvis HUD.exe"],
      wakeMethods: [
        {
          id: "tray-open-hud",
          label: "Tray icon opens HUD",
          status: "ready",
          detail: "Use the Windows tray icon when Jarvis is running in the background.",
        },
        {
          id: "orb-click",
          label: "Centered orb click/tap",
          status: "ready",
          detail: "Click the orb to open radial controls for dashboard, text, voice, devices, and settings.",
        },
        {
          id: "manual-voice-panel",
          label: "Manual voice panel",
          status: "ready",
          detail: "Open Voice from the orb. Current reliable wake is click/tap until wake-word assets are installed.",
        },
        {
          id: "hotword",
          label: "Say Jarvis",
          status: "staged",
          detail: "Hotword wake is wired as a staged path and becomes live after Porcupine or Vosk wake dependencies are installed and enabled.",
        },
      ],
    },
    summary: {
      electronShellReady: electron.ready,
      tauriFallbackReady: tauriFallback.ready,
      startupScriptsReady,
      productionCommandsReady,
    },
    recommendations: recommendationsFor(electron.ready, tauriFallback.ready, startupScriptsReady),
  };
}

function electronReadiness(root: string): PackagingReadiness["electron"] {
  const packageJson = join(root, "apps", "hud", "package.json");
  const mainEntry = join(root, "apps", "hud", "electron", "main.ts");
  const rendererBuild = join(root, "apps", "hud", "dist", "index.html");
  const mainBuild = join(root, "apps", "hud", "dist-electron", "main.js");
  const releaseFolder = join(root, "apps", "hud", "release");
  const sourceReady = existsSync(packageJson) && existsSync(mainEntry);

  return {
    ready: sourceReady,
    packageJson,
    mainEntry,
    rendererBuild,
    mainBuild,
    releaseFolder,
    commands: [
      "npm.cmd run dev:hud",
      "npm.cmd run start:hud",
      "npm.cmd run package:hud",
      "npm.cmd run dist:hud",
    ],
    note: sourceReady
      ? "Electron HUD source is present. Run build/package commands to refresh dist or installer artifacts."
      : "Electron HUD source files are missing.",
  };
}

function tauriReadiness(root: string): PackagingReadiness["tauriFallback"] {
  const configPath = join(root, "apps", "desktop", "src-tauri", "tauri.conf.json");
  const ready = existsSync(configPath);
  return {
    ready,
    configPath,
    commands: ["npm.cmd run dev:tauri", "npm.cmd run build -w @jarvis/desktop"],
    note: ready ? "Tauri fallback config is present." : "Tauri fallback config is not present or not yet generated.",
  };
}

function startupCommands(root: string): PackagingReadiness["startup"] {
  const runtimeScript = join(root, "scripts", "jarvis-runtime.ps1");

  return {
    startScript: runtimeScript,
    stopScript: runtimeScript,
    registerScript: runtimeScript,
    checkOnlyCommand: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\jarvis-runtime.ps1 -Action RegisterStartup -CheckOnly",
    standardRegisterCommand: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\jarvis-runtime.ps1 -Action RegisterStartup -StandardStartup",
    elevatedRegisterCommand: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\jarvis-runtime.ps1 -Action RegisterStartup",
    note: "The canonical supervisor owns start, stop, live test, and startup registration previews. This endpoint never registers startup tasks or elevates privileges.",
  };
}

function recommendationsFor(electronReady: boolean, tauriReady: boolean, startupScriptsReady: boolean): string[] {
  const recommendations: string[] = [];
  if (!electronReady) {
    recommendations.push("Restore apps/hud Electron source before packaging the primary HUD shell.");
  }
  if (!tauriReady) {
    recommendations.push("Keep Tauri as fallback only if apps/desktop/src-tauri is available.");
  }
  if (!startupScriptsReady) {
    recommendations.push("Restore start, stop, and register scripts before enabling background startup.");
  }
  recommendations.push("Use check-only startup commands first; register standard or elevated startup only after owner review.");
  recommendations.push("Hotword wake remains staged until wake-word dependencies are installed and enabled.");
  return recommendations;
}
