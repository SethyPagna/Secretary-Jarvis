# C++ Muscle

This layer is for raw local inference and low-level hardware-adjacent work:

- llama.cpp / GGUF serving
- whisper.cpp speech-to-text
- Piper or similar local TTS
- future wake-word and streaming audio helpers

Jarvis does not reimplement heavy inference in TypeScript. TypeScript handles UI/API/events, Python handles orchestration, and this layer hosts fast native engines.
