# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**마음정산 (HeartBook)** — A Korean ceremonial event (경조사) management app. Users track monetary gifts given/received for weddings, funerals, birthdays, and other events. Features AI-powered invitation image parsing via Gemini, CSV bulk import, push notifications, and statistics.

The app is built for Google AI Studio deployment (not standard Vercel). It uses a custom Express server wrapping Next.js.

## Commands

- **Dev server:** `npm run dev` (runs `tsx server.ts` — Express + Next.js on port 3000)
- **Build:** `npm run build` (runs `next build`)
- **Lint:** `npm run lint` (runs `eslint .`)
- **Start:** `npm run start` (runs `tsx server.ts` in production mode)

## Architecture

### Hybrid Server: Express + Next.js (`server.ts`)

The app does NOT use standard Next.js server. `server.ts` is a custom Express server that:
1. Initializes Firebase Admin SDK (Firestore)
2. Configures web-push (VAPID keys)
3. Defines Express API routes (`/api/scrape`, `/api/cron/notify`, `/api/test-push`)
4. Delegates all other requests to Next.js via `nextApp.getRequestHandler()`

The `/api/scrape` endpoint uses Puppeteer with stealth plugin to scrape invitation URLs.

### Dual Data Layer

The app has two independent data paths:
- **Client-side (primary):** Zustand store (`src/store/useStore.ts`) with `localStorage` persistence (key: `heartbook-storage`, version 2 with migrations). Currently uses `userId: 'local-user'` — no auth wired to the store.
- **Server-side:** Firebase Admin SDK in `server.ts` for push notification cron jobs (reads `entries` and `subscriptions` collections).
- **Client Firebase SDK:** `src/lib/firebase.ts` initializes Firebase client SDK with config from `firebase-applet-config.json`. Exports auth, Firestore, and Google auth provider. Currently the store does NOT sync with Firestore.

### Routing

Next.js App Router with all pages as client components:
- `app/page.tsx` → HomeTab (AI input, quick stats, notifications)
- `app/calendar/page.tsx` → CalendarTab
- `app/history/page.tsx` → HistoryTab
- `app/contacts/page.tsx` → ContactsTab
- `app/stats/page.tsx` → StatisticsTab

Each page wraps its tab component in `components/Layout.tsx`, which provides a mobile-first shell (430px max-width, simulated phone frame) with bottom navigation.

### Key Patterns

- **AI parsing:** HomeTab uses `@google/genai` (Gemini) directly on the client to parse natural text, URLs, and invitation images into structured `EventEntry` data.
- **Image analysis:** `src/utils/nanoBananaDocs.ts` documents the Gemini-based image extraction pipeline for Korean invitations.
- **CSV import:** `src/components/BulkImportModal.tsx` + `src/utils/csvParser.ts` for bulk data import via PapaParse.
- **State:** All app state flows through the single Zustand store. Components import `useStore` directly.
- **UI:** Tailwind CSS v4 + Lucide icons + Framer Motion + Sonner toasts + react-calendar + Recharts.

### Environment Variables

See `.env.example`:
- `GEMINI_API_KEY` — Required for AI features (Gemini API)
- `FIREBASE_PROJECT_ID` — Firebase project
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web push notifications
- `APP_URL` — Hosting URL (injected by AI Studio at runtime)

### Firestore Collections

Defined in `firestore.rules`: `subscriptions`, `contacts`, `entries`, `users`. All documents are user-scoped (`userId` field, owner-only access).

### Language

UI is entirely in Korean. All user-facing strings, labels, and AI prompts are Korean.
