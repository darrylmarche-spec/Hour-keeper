# Hour Keeper

Field hour tracking for lift & escalator jobs: project managers set up each job's
tasks with the hours it was **sold** at, field techs log the hours each task
**actually** took, and reports compare the two. Works offline.

See [PLAN.md](PLAN.md) for the full plan and build phases.

## Stack

- **App:** Expo SDK 58 (React Native) with Expo Router — one codebase for iPhone, Android and web
- **Backend:** Supabase project `hour-keeper` (Sydney, `ap-southeast-2`) — Postgres with row-level security, auth, storage
- **Offline:** every device keeps its own copy of the data (`src/data/localStore.ts`) and a queue of
  unsent changes; `src/data/sync.ts` pushes and pulls when there's signal
- **Web:** single-page build with a service worker (`scripts/build-sw.js`) so it opens with no signal

## Commands

```bash
npm install
npm start            # dev server (press w for web, or scan the QR code with Expo Go)
npm test             # unit tests (sync engine, hour totals)
npm run typecheck
npm run lint
npm run build:web    # production web build → dist/ (what Vercel deploys)
```

## Where things live

| Path | What |
|---|---|
| `src/app/` | Screens (Expo Router — every file is a route) |
| `src/data/` | Offline store, sync engine, Supabase adapter, hour totals |
| `src/components/ui.tsx` | Header bar, back button, sync badge, buttons, fields |
| `src/theme/colors.ts` | Colours carried over from SCS Checklist |
| `supabase/migrations/` | Database schema, access rules, seeded template — applied in order |

## Accounts & roles

People request an account in the app; an **admin approves** it and picks the role
(Field Tech, Supervisor, Project Manager, Admin). If no active admin exists, the next
account created becomes the admin.

## Rules the app keeps

- Every screen has a back button or the tab bar; the back button goes home if there's no history.
- Nothing opens a new window or tab. Reports will open inside the app.
- Every screen has its own web address, so refresh and the browser back button always work.
