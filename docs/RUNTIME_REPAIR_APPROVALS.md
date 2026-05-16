# Runtime Repair Approvals

Jarvis runtime repair actions are dry-run first. A dry-run creates a preview and an approval request; it does not change environment variables, launch apps, call endpoints, enable sensors, or download models.

## Repair Actions

### Ollama PATH

- Purpose: make `ollama` visible to startup scripts and terminals.
- Risk: modifies the user `PATH` environment variable.
- Approval category: `run-script`.
- Reversible: yes, remove the Ollama folder from User PATH.
- Dry-run endpoint: `POST /api/runtime/adapter-repair/dry-run` with `ollama-path`.

### Launch Ollama

- Purpose: start the local Ollama app/runtime if installed.
- Risk: changes local process state.
- Approval category: `app-control`.
- Reversible: yes, quit Ollama or stop the process.
- Dry-run endpoint: `POST /api/runtime/adapter-repair/dry-run` with `ollama-launch`.

### LM Studio Endpoint Check

- Purpose: preview a local OpenAI-compatible endpoint check.
- Risk: touches localhost runtime status only.
- Approval category: `service-control`.
- Reversible: yes, no state is changed by the preview.
- Dry-run endpoint: `POST /api/runtime/adapter-repair/dry-run` with `lmstudio-endpoint`.

### Hotword Enablement

- Purpose: prepare `Say Jarvis` wake behavior.
- Risk: continuous microphone wake requires sensor capture.
- Approval category: `sensor-capture`.
- Reversible: yes, disable hotword listening or use emergency stop.
- Dry-run endpoint: `POST /api/runtime/adapter-repair/dry-run` with `hotword-enable`.

## HUD Flow

1. Open the centered orb.
2. Choose `Settings`.
3. Expand `Wake`.
4. Choose a repair dry-run button.
5. Review the command preview and approval state.
6. Approve only if the action matches your intent.

The HUD keeps repair commands hidden until you ask for a dry-run, so normal use remains concise.

## Safety Rules

- No repair action runs automatically.
- No PATH mutation happens without approval.
- No continuous microphone wake is enabled without approval.
- No hosted model inference is enabled by these actions.
- Emergency stop remains available for runtime or sensor-control work.
