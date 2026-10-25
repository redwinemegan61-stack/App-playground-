# PatchForge Studio — Issue Triage, Visual Debugger & Patch Generator

PatchForge Studio is a developer engineering console that combines open-source repository issue triage (pre-loaded with the `googleapis/python-genai` Issue #3060 AFC optional scalar schema bug and related SDK issues), multimodal visual analysis powered by `gemini-4-argon` for uploaded screenshots/tracebacks/schema diffs, and an interactive unified diff & `.patch` generator.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices incorporate your confirmed selections and establish the design and functional scope before implementation.

- **Confirmed Decision 1 — Unified Issue Triage, Image Analyzer & Patch Studio**: The workspace integrates repository issue inspection, visual screenshot/traceback debugging via `gemini-4-argon`, and automated patch synthesis in a single cohesive engineering workbench.
- **Confirmed Decision 2 — Optimized Visual Diagnostic Presets**: The image analyzer is tailored for terminal tracebacks, JSON schema diffs, and UI bug screenshots, while supporting any uploaded photo or technical diagram with custom analysis instructions.
- **Confirmed Decision 3 — Structured Diagnosis, Diff Viewer & `.patch` Export**: Every visual analysis or issue triage produces a structured root-cause breakdown, an interactive side-by-side or unified diff viewer, and one-click `.patch` and `git format-patch` downloads.

---

## 1. Overview & Core Concept

- **What It Does**: Allows engineers to inspect critical repository issues (including the `googleapis/python-genai` Issue #3060 fix for `int | None` callable tool schemas), upload photos or screenshots of terminal stack traces, schema payloads, or UI bugs for deep multimodal analysis using `gemini-4-argon`, and generate verified `.patch` files ready for `git apply`.
- **Target Audience / Persona**: SDK maintainers, open-source contributors, and full-stack software engineers triaging bugs from visual evidence and repository issue trackers.
- **Key Value**: Bridges visual bug artifacts (screenshots of tracebacks, broken schemas, or UI glitches) directly to root-cause code diagnosis and downloadable Git patches in a single workflow.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Issue Triage & Patch Inspection**: Browse curated open issues from `googleapis/python-genai` (led by Issue #3060: *Callable tools optional scalar parameters get `"type": "object"`*), inspect the root-cause analysis, toggle between Unified Diff and Split Diff views, test schema inference interactively, and download `fix-issue-3060.patch` or `0001-fix-afc-infer-correct-schema-type.patch`.
  2. **Multimodal Image Analysis (`gemini-4-argon`)**: Drag and drop or upload any photo/screenshot (or load a sample traceback/schema screenshot), choose an analysis preset (*Terminal Traceback & Exception*, *JSON Schema & Type Diff*, *UI Layout & Visual Bug*, or *Custom Engineering Prompt*), and run server-side `gemini-4-argon` analysis.
  3. **Visual-to-Patch Synthesis**: Review the structured output from `gemini-4-argon`—including extracted text/OCR, severity assessment, root-cause explanation, affected component mapping, and an automatically synthesized unified `.patch` diff that can be edited, copied, or downloaded as a `.patch` file.
  4. **Interactive Schema & Patch Sandbox**: Test Python callable type signatures (e.g., `int | None`, `list[str] | None`, `Address | None`, `Color | None`) to compare pre-patch vs. post-patch JSON Schema output in real time.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft dark-first engineering console inspired by Linear, Raycast, and GitHub Next—crisp 1px structural borders, zero decorative clutter, and high-density tabular precision.
  - *Color Palette & Mood*:
    - Dominant Canvas (60%): Deep Carbon Slate (`#0B0F17`) with elevated workspace panels (`#111827`).
    - Structural Surfaces (30%): Subtle slate hairlines (`#1E293B`), muted steel secondary text (`#94A3B8`), and crisp alabaster primary typography (`#F8FAFC`).
    - Accent & Semantic Budget (10%): Precision Indigo (`#6366F1`) for primary interactive actions, paired with explicit text-labeled semantic indicators: Emerald (`#10B981`) for patch additions/verified state, Crimson (`#EF4444`) for deletions/critical severity, and Amber (`#F59E0B`) for warnings.
  - *Typography & Hierarchy*:
    - Display & Navigation: `Plus Jakarta Sans` (SemiBold 600 / Bold 700) for clean structural headers.
    - Body Prose: `Public Sans` (Regular 400 / Medium 500) for readable diagnostic explanations.
    - Code, Diffs & Telemetry: `JetBrains Mono` with `tabular-nums` for line numbers, diff hunks, JSON schemas, and issue numbers.
  - *Component Styling & Layout*: Full-viewport 1440px desktop layout featuring a 260px left navigation sidebar, a strict 3-zone top bar (breadcrumb trail on the left, navigation tabs in the center, and primary `.patch` export CTA on the right), and a split-pane main workspace with single-elevation bordered surfaces.

- **Interactive Feedback & Motion**:
  - Fast $\le 150\text{ms}$ transitions on tab switches, filter controls, and diff mode toggles.
  - Structured skeleton placeholders while `gemini-4-argon` processes uploaded images.
  - Explicit empty states, error banners with retry controls, and copy/download confirmation states.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side `gemini-4-argon` Multimodal Pipeline with Structured JSON Output**
  - *Chosen Approach*: All Gemini API calls execute on the Express backend (`/api/analyze-image` and `/api/generate-patch`) using `@google/genai` and model `gemini-4-argon` with structured `responseSchema` so every image analysis reliably returns summary, extracted error text, root cause, severity, and a valid unified `.patch` diff.
  - *Why*: Guarantees API key protection, consistent UI rendering of diagnostic sections, and immediate `.patch` downloadability from any uploaded image.
  - *Alternatives Considered*: Free-form markdown responses (harder to extract clean `.patch` files reliably without parsing errors).

- **Decision 2: Pre-Loaded `googleapis/python-genai` Issue #3060 Case Study + Live Custom Image Triage**
  - *Chosen Approach*: Ship the complete, verified Issue #3060 patch (`_infer_type_from_any_of` in `_automatic_function_calling_util.py` + `test_types.py` unit tests) alongside a live interactive `gemini-4-argon` visual analyzer and custom issue patch builder.
  - *Why*: Immediately fulfills the `python-genai` critical issue patch requirement while letting users upload any new photo or screenshot to generate fresh diagnoses and patches.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        PatchForge Studio (Client UI)                         │
│                                                                              │
│  ┌────────────────────┐  ┌────────────────────────────────────────────────┐  │
│  │   Top Bar (3-Zone) │  │ Breadcrumb · Workspace Views · Export .patch   │  │
│  └────────────────────┘  └────────────────────────────────────────────────┘  │
│  ┌────────────────────┐  ┌────────────────────────────────────────────────┐  │
│  │ Sidebar Navigation │  │              Active Workspace View             │  │
│  │                    │  │                                                │  │
│  │ • Issue Triage     │  │  ┌────────────────────┐  ┌──────────────────┐  │  │
│  │   (#3060, #3105,   │  │  │ Visual Image       │  │ Structured       │  │  │
│  │    #3044, Custom)  │  │  │ Dropzone & Preview │  │ Diagnosis &      │  │  │
│  │ • Image Analyzer   │──┼─►│ (Upload / Presets) │─►│ Root Cause Panel │  │  │
│  │   (Gemini 4 Argon) │  │  └────────────────────┘  └────────┬─────────┘  │  │
│  │ • Patch & Diff     │  │                                   │            │  │
│  │   Workbench        │  │  ┌────────────────────────────────▼─────────┐  │  │
│  │ • Schema Sandbox   │  │  │ Interactive Unified / Split Diff Viewer  │  │  │
│  │                    │  │  │ + One-Click .patch / git format-patch    │  │  │
│  └────────────────────┘  │  └──────────────────────────────────────────┘  │  │
│                          └────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ HTTP POST (JSON / Base64 Image)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Express Backend Server (Port 3000)                   │
│                                                                              │
│  ┌────────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ POST /api/analyze-image            │  │ POST /api/synthesize-patch     │  │
│  │ • Validates image & prompt preset  │  │ • Takes issue context + image  │  │
│  │ • Calls gemini-4-argon multimodal  │  │   diagnosis                    │  │
│  │   with structured responseSchema   │  │ • Calls gemini-4-argon to      │  │
│  └─────────────────┬──────────────────┘  │   produce unified git .patch   │  │
│                    │                     └────────────────┬───────────────┘  │
│                    └──────────────────┬───────────────────┘                  │
│                                       ▼                                      │
│                    ┌──────────────────────────────────────┐                  │
│                    │ @google/genai SDK (gemini-4-argon)   │                  │
│                    │ User-Agent: aistudio-build           │                  │
│                    └──────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `RepositoryIssue`: Issue ID, title, severity, status, affected module, root-cause summary, before/after JSON schema comparison, unified diff patch, and `git format-patch` content.
  - `ImageAnalysisSession`: Uploaded image data URL, MIME type, file metadata, selected diagnostic preset, custom prompt, `gemini-4-argon` structured analysis result (`title`, `category`, `severity`, `extractedText`, `rootCause`, `suggestedFix`, `generatedPatch`, `targetFile`), and timestamp.
  - `SchemaTestCase`: Callable signature expression, pre-fix schema output (`"type": "object"` bug), and post-fix `_infer_type_from_any_of` schema output.

- **Interactive Component & State Mapping**:
  - **Image Upload & Preset Selector**: Accepts file drag-and-drop, file picker, clipboard paste, or built-in sample technical images (e.g., Python `TypeError` traceback canvas, JSON Schema `anyOf` inspector snapshot, UI layout bug capture). Selecting a preset updates the analysis prompt and triggers `/api/analyze-image`.
  - **Diff & Patch Workbench**: Supports switching between Unified Diff, Split Side-by-Side Diff, and Raw `.patch` source; allows live editing of the patch header/hunks; provides `Copy git apply Command`, `Download .patch`, and `Download format-patch` actions.
  - **Promote Image Analysis to Issue**: Converts any `gemini-4-argon` image diagnosis directly into a tracked issue entry in the sidebar with its generated `.patch` attached.
