# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-10

### Fixed

- Launching the app manually now surfaces the settings window instead of appearing to do nothing; login-item starts stay silent in the background
- macOS: re-opening the app from the Dock/Finder brings the settings window to front

### Changed

- Security hardening: all renderer permission requests are denied; raw server error details stay in the local log only
- e2e default trigger synced to the default shortcut (Alt+Shift+D)

## [0.1.0] - 2026-10-09

### Added

- Global hotkey (default `Alt+Shift+D` / `⌥⇧D`) to look up selected text or clipboard content in any app
- Quick-look popup with streaming answers, follow-up questions and a full conversation flow
- Multi-provider support: OpenAI, Anthropic, DeepSeek, Google Gemini, OpenRouter, Moonshot, Zhipu, SiliconFlow, xAI, Ollama, LM Studio, plus custom OpenAI/Anthropic-compatible endpoints
- Reasoning level control (off / low / medium / high / max) mapped per provider
- Built-in prompt presets (quick lookup, translation, code explanation, summarization, polishing) with full customization
- Settings window (general, providers, prompts, shortcut & interaction, about) with light/dark themes and zh/en UI
- Local history, stored on device only; API keys encrypted with the OS keychain
- Cross-platform support: macOS, Windows, Linux
