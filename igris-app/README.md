# igris

igris is a cross-device personal AI assistant runtime with a sleek, Apple-inspired Dynamic Island desktop interface built with Electron, React, and Tailwind CSS.

## Architecture

```
User (Voice / Text)
      │
      ▼
Dynamic Island Desktop UI (Electron + React)
      │ (IPC)
      ▼
Igris Core Runtime
      │
  Intent & Complexity Analysis
  ┌───────────────┴───────────────┐
  ▼                               ▼
Pi Agent                        Hive (Multi-Agent Colony)
- Fast reasoning                - Telegram / Slack / Email integrations
- Quick single-turn Q&A         - Web browsing & scraping
- In-process TypeScript         - Multi-agent parallel task execution
                                - Persistent task recovery
```

## Features

- **Dynamic Island UI**: Floating, fluid Apple-style capsule running top-center of your desktop (always on top, frameless, translucent glassmorphism). Expands with spring physics upon interaction.
- **Voice-First Interaction**: Integrated speech-to-text (Web Speech API) and text-to-speech voice feedback.
- **Execution Router**:
  - Automatically routes lightweight prompts and instant Q&A to **Pi Agent** (`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`).
  - Automatically routes external integrations (Telegram, Slack, email, GitHub, Jira) and complex multi-step workflows to **Hive**.
- **Model Agnostic with Nebius**: NVIDIA Nemotron-70B model provider wrapped behind an extensible `ModelProvider` interface.
- **Headless Hive**: Hive's web frontend has been removed; Hive serves strictly as a headless agent runtime backend.
- **Persistent Memory**: SQLite FTS5 store for personal preferences, project architecture, and observed agent activity logs.

## Setup & Running

### 1. Environment Configuration

Copy the example environment file and fill in your keys:

```bash
cp .env.example .env
```

Ensure your `.env` contains:
```env
NEBIUS_API_KEY=your_nebius_api_key_here
NEBIUS_BASE_URL=https://api.studio.nebius.ai/v1
NEBIUS_MODEL=nvidia/llama-3.1-nemotron-70b-instruct
HIVE_BASE_URL=http://localhost:8889
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build & Typecheck

```bash
npm run typecheck
npm run build
```

### 4. Start the Application

In development mode:

```bash
npm run dev
```

To run Hive in headless mode alongside:
```bash
cd ../hive
./hive open   # Runs API server on port 8889 in headless mode
```
