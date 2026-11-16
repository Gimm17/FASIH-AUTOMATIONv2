<div align="center">

# 🔍 FASIH Duplicate Assignment Automation (v2)

### Read-Only, User-Assisted Chrome Extension (Manifest V3) for BPS FASIH-SM

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![React](https://img.shields.io/badge/React-Side%20Panel-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Vitest-145%20Unit%20Tests-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)

*Automates duplicate assignment lookup and UUID extraction on `fasih-sm.bps.go.id` with deterministic matching guards, IndexedDB checkpoints, and Excel patching.*

</div>

---

## ✨ Features

- **Read-Only & User-Assisted Safety** — Extracts assignment UUIDs strictly from `href` links without ever clicking *Review* or *Lanjutkan Penugasan*.
- **Deterministic Matching First** — Normalizes names/codes, applies Levenshtein similarity & token overlap, and enforces self-exclusion + facility/protected-token hard rejects that AI cannot override.
- **Optional AI Adjudication** — Uses an OpenAI-compatible localhost gateway (Zod-validated) strictly for query typo correction and ambiguous `AI_REVIEW` candidates.
- **Resilient Job Engine** — Start, Pause, Resume, or Stop anytime; every processed row is checkpointed in `IndexedDB`.
- **Manual Review Queue** — Ambiguous matches enter a review queue in the Chrome Side Panel; manual confirmation triggers re-extraction.
- **Non-Destructive Excel Export** — Resolves columns by header name (`data1`, `code_identity`, `assignment_id_duplicate`, `nama_duplicate`), preserving the original workbook structure and filling only output columns.

---

## 🏗️ Architecture

| Component | Path | Responsibility |
| :--- | :--- | :--- |
| **Content Script** | `src/content/fasih-content.ts` | DOM command router (search, auto-scroll virtualized list, card inspection, link reading) |
| **Service Worker** | `src/background/` | Job orchestrator, message router, AI proxy & cache, download manager |
| **Side Panel (React)** | `src/sidepanel/` | Excel upload, job controls, live progress, logs, manual review queue, settings |
| **Matching Engine** | `src/matching/` | Normalization, Levenshtein, token overlap, protected tokens, facility guard, verifier |
| **AI Adapter** | `src/ai/` | Query correction & ambiguous adjudication (Zod-validated) |
| **Excel Adapter** | `src/excel/` | Header-based target parsing and safe output column patching |
| **Persistence** | `src/persistence/` | `IndexedDB` (jobs, targets, results, cache) + `chrome.storage` for settings |

---

## 🚀 Setup & Build

```bash
# 1. Install dependencies
npm install

# 2. Typecheck (TypeScript strict)
npm run typecheck

# 3. Run unit tests (145 tests via Vitest)
npm test

# 4. Build production bundle to dist/
npm run build
```

### Load in Chrome
1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `dist/` directory.
3. Open `https://fasih-sm.bps.go.id` and log in.
4. Click the extension icon to open the **Side Panel**, upload your `.xlsx` file, and start checking.

> **Security Note:** `xlsx` is loaded via `cdn.sheetjs.com` (0.20.3) rather than legacy npm `0.18.5` to avoid known prototype-pollution / ReDoS CVEs.
