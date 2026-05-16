from __future__ import annotations

import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any


class SystemControlService:
    def __init__(self, project_root: Path, secretary_root: Path) -> None:
        self.project_root = project_root
        self.secretary_root = secretary_root
        self.protected_roots = [
            project_root / "apps",
            project_root / "packages",
            project_root / "services",
            project_root / "souls",
            project_root / "vendor",
            project_root / ".git",
        ]
        self.approved_apps = {
            "explorer": ["explorer.exe"],
            "file explorer": ["explorer.exe"],
            "notepad": ["notepad.exe"],
            "powershell": ["powershell.exe", "-NoProfile"],
            "terminal": ["wt.exe"],
            "vscode": ["code"],
            "vs code": ["code"],
            "ollama": ["ollama"],
        }

    def capabilities(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "system-approved-admin-executor",
                "label": "Approved-admin system executor",
                "kind": "system-control",
                "status": "ready",
                "installed": True,
                "details": "Executes only policy-approved local actions through structured Python handlers.",
            }
        ]

    def execute(self, payload: dict[str, Any]) -> dict[str, Any]:
        action = payload.get("systemAction") if isinstance(payload.get("systemAction"), dict) else payload
        approved = bool(payload.get("approved", False))
        if not approved:
            return self.result("blocked", action, "Execution refused because approved=true was not provided.")

        category = str(action.get("category", "read-local"))
        command = str(action.get("command", "")).strip()
        target = str(action.get("target", "")).strip()
        if not command:
            return self.result("blocked", action, "Execution refused because command is empty.")

        if category in {"write-local", "delete-local", "run-script"} and self.is_protected_target(target):
            return self.result("blocked", action, "Protected Jarvis source/core paths cannot be modified by runtime agents.")

        try:
            if category == "read-local":
                return self.inspect_system(action)
            if category == "app-control":
                return self.open_app(action, command, target)
            if category == "window-control":
                return self.result("staged", action, "Window control is approved but awaits the pygetwindow/pywinauto dependency.")
            if category == "device-control":
                return self.result("staged", action, "Device control is approved but awaits a local audio/device control dependency.")
            if category == "service-control":
                return self.control_service(action, command)
            if category == "write-local":
                return self.write_local(action, command, target)
            if category == "delete-local":
                return self.delete_local(action, target)
            if category == "run-script":
                return self.run_approved_script(action, target or command)
        except Exception as error:  # noqa: BLE001 - local execution diagnostics need to be surfaced.
            return self.result("failed", action, f"Execution failed: {error}")

        return self.result("blocked", action, f"Unsupported system action category: {category}.")

    def inspect_system(self, action: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "cwd": os.getcwd(),
            "projectRoot": str(self.project_root),
            "secretaryRoot": str(self.secretary_root),
            "tools": {
                "ollama": shutil.which("ollama"),
                "powershell": shutil.which("powershell"),
                "code": shutil.which("code"),
                "wt": shutil.which("wt"),
            },
        }
        return self.result("executed", action, "System state inspected locally.", payload)

    def open_app(self, action: dict[str, Any], command: str, target: str) -> dict[str, Any]:
        normalized = f"{command} {target}".lower()
        app_command = None
        app_name = ""
        for name, candidate in self.approved_apps.items():
            if name in normalized:
                app_command = candidate
                app_name = name
                break

        if not app_command:
            return self.result("blocked", action, "App launch is limited to the approved local app registry.")

        executable = shutil.which(app_command[0]) or app_command[0]
        subprocess.Popen([executable, *app_command[1:]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return self.result("executed", action, f"Opened approved local app: {app_name}.", {"app": app_name})

    def control_service(self, action: dict[str, Any], command: str) -> dict[str, Any]:
        normalized = command.lower()
        if "ollama" in normalized and ("start" in normalized or "launch" in normalized):
            ollama = shutil.which("ollama")
            if not ollama:
                return self.result("failed", action, "Ollama is not on PATH for the Python executor.")
            subprocess.Popen([ollama, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return self.result("executed", action, "Started Ollama local model service.", {"service": "ollama"})

        return self.result(
            "staged",
            action,
            "Service action is approved but not executed until the service is in the approved service registry.",
        )

    def write_local(self, action: dict[str, Any], command: str, target: str) -> dict[str, Any]:
        if not target:
            return self.result("blocked", action, "Write action requires a target path.")
        path = Path(target).expanduser()
        if "mkdir" in command.lower() or "create folder" in command.lower():
            path.mkdir(parents=True, exist_ok=True)
            return self.result("executed", action, f"Created approved folder: {path}.", {"path": str(path)})

        return self.result(
            "staged",
            action,
            "Write action approved, but copy/move/edit execution requires structured source/target fields in the next slice.",
        )

    def delete_local(self, action: dict[str, Any], target: str) -> dict[str, Any]:
        if not target:
            return self.result("blocked", action, "Delete action requires a target path.")
        path = Path(target).expanduser()
        if not path.exists():
            return self.result("failed", action, f"Delete target does not exist: {path}.")
        if path.is_dir():
            path.rmdir()
        else:
            path.unlink()
        return self.result("executed", action, f"Deleted approved target: {path}.", {"path": str(path)})

    def run_approved_script(self, action: dict[str, Any], target: str) -> dict[str, Any]:
        script_path = Path(target).expanduser()
        if not script_path.exists():
            return self.result("failed", action, f"Script was not found: {script_path}.")
        scripts_root = (self.project_root / "scripts").resolve()
        resolved = script_path.resolve()
        if scripts_root not in resolved.parents:
            return self.result("blocked", action, "Only scripts inside the Jarvis scripts folder can run through this executor.")
        if script_path.suffix.lower() not in {".ps1", ".bat", ".cmd", ".py"}:
            return self.result("blocked", action, "Only .ps1, .bat, .cmd, and .py scripts are approved script types.")

        command = self.script_command(resolved)
        completed = subprocess.run(command, text=True, capture_output=True, timeout=120, check=False)
        return self.result(
            "executed" if completed.returncode == 0 else "failed",
            action,
            f"Script exited with code {completed.returncode}.",
            {
                "returnCode": completed.returncode,
                "stdoutPreview": completed.stdout[-2000:],
                "stderrPreview": completed.stderr[-2000:],
            },
        )

    def is_protected_target(self, target: str) -> bool:
        if not target:
            return False
        try:
            resolved = Path(target).expanduser().resolve()
        except Exception:
            return True
        for root in self.protected_roots:
            protected = root.resolve()
            if resolved == protected or protected in resolved.parents:
                return True
        return False

    @staticmethod
    def script_command(script_path: Path) -> list[str]:
        suffix = script_path.suffix.lower()
        if suffix == ".ps1":
            return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script_path)]
        if suffix == ".py":
            return ["python", str(script_path)]
        return [str(script_path)]

    @staticmethod
    def result(status: str, action: dict[str, Any], message: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "status": status,
            "executed": status == "executed",
            "actionId": action.get("id"),
            "category": action.get("category"),
            "message": message,
            "payload": payload or {},
            "localOnly": True,
        }
