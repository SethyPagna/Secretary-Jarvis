import { existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis";
const LOCAL_VENV_PYTHON = join(PROJECT_ROOT, "services", "brain", ".venv", "Scripts", "python.exe");

export function resolveJarvisPython(explicitPython?: string): string {
  if (explicitPython) {
    return explicitPython;
  }
  if (process.env.JARVIS_PYTHON) {
    return process.env.JARVIS_PYTHON;
  }
  if (existsSync(LOCAL_VENV_PYTHON)) {
    return LOCAL_VENV_PYTHON;
  }
  return "python";
}

export function jarvisPythonRuntimeLabel(explicitPython?: string): string {
  const python = resolveJarvisPython(explicitPython);
  return python === "python" ? "system-python" : python;
}
