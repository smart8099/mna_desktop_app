# MNA Management System

Desktop application for **Madrasatul Nurul Absar** (Private Basic Islamic School, Ghana).
Cross-platform (Windows + macOS), offline, single local database file.

See [`PLAN.md`](./PLAN.md) for the full product plan and roadmap.

## Stack

- **Tauri 2** (Rust shell) + **React 19** + **TypeScript** + **Vite**
- **SQLite** via `tauri-plugin-sql` (single file `mna.db` in the app data folder)
- **Tailwind CSS v4** + a small in-repo component set
- **TanStack Query** for the data layer, **React Router** (hash) for navigation

## Requirements

- Node 20+ and pnpm
- Rust (stable) + platform build tools (Xcode CLT on macOS, MSVC + WebView2 on Windows)

## Develop

```bash
pnpm install
pnpm app          # tauri dev — launches the desktop window with hot reload
```

Frontend only (browser, no Tauri APIs):

```bash
pnpm dev
```

## Build installers

```bash
pnpm app:build    # produces .dmg/.app (macOS) or .msi/.exe (Windows) under src-tauri/target/release/bundle
```

## Test

```bash
pnpm verify       # build + frontend tests + Rust tests
```

56 automated tests (28 Rust, 28 frontend) + a manual smoke checklist — see [`TESTING.md`](./TESTING.md).

## Project layout

```
src/
  app/            shell, responsive sidebar, top bar, navigation
  components/ui/   Button, Input, Card, Dialog, Field, State
  features/
    settings/      School, Fees & Grading, Academic Years, Calendar, Classes, Subjects
    backup/        Download DB / Upload DB / automatic backups
    PlaceholderPage.tsx   stub screens for Phase 1–4 modules
  lib/            db client, cn, hijri, formatting, media query
src-tauri/
  migrations/0001_init.sql    full schema (v1) + seed data
  migrations/0002_phase2.sql  exam-fee setting + exam_fees unique index (v2)
  src/backup.rs               database download / restore / auto-backup commands
  src/importer.rs             legacy xlsx student parser
  src/media.rs                student photo storage
  src/lib.rs                  plugin wiring, migrations, staged-restore-on-startup hook
```

## Status

- **Phase 0 — Foundation** ✅ — app shell, schema + migrations, Settings, Backup & Recovery.
- **Phase 1 — People** ✅ — Students (register, photos, search, pagination, promotion,
  auto admission numbers, `+233` phone fields) and Teachers (records + class/subject
  assignments); one-time importer for the legacy spreadsheet.
- **Phase 2 — Daily operations** ✅ — Attendance (class/date register + per-student
  summary), Daily Tuition Fees (weekend/vacation fee engine, per-student ledger and
  payments), Examination Fees (due vs paid, standard-fee bulk apply, receipts).

Next: Phase 3 — Results, Report Cards, Exam Receipts.
