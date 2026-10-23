# Hour Keeper: project summary

*One page, for anyone (or any chat) picking this project up cold. Working name only: a rename is being considered.*

## What it is
A phone app for **lift/escalator field crews** to log **actual hours against each task on a job**, so the office can compare **what was sold with what the job really took**. Built by Darryl (Schindler Australia, Melbourne), to be pitched to head office in Switzerland.

## The point of it
**Simplicity first**, so the field actually uses it and sees it as a help, not a spying tool, while being genuinely useful to the office. The better the field's data, the better the office's quotes.

**Design rules (don't break these):**
- Fewest taps possible: tap the task, tap the hours, save.
- Works fully **offline** (shafts, basements, new builds). Everything saves on the phone first and syncs later.
- **No spying features**: no GPS, clock-in/out, live monitoring, alerts or rankings.
- Techs see only their own job and straight hours; percentages and cross-job comparison are for PMs, after the fact.
- Corrections are visible to everyone ("Edited" + history), never silent.
- It gives something back to the tech: photos, notes and comments that protect them on variations and site problems.
- Never trap the user on a screen: every screen has a way back.
- Keeps the look of the old SCS Checklist app (red, flat, high contrast).

## People and roles
Field Tech (logs own hours) · Supervisor (sets up/edits jobs, sees all jobs, plain hours) · Project Manager (everything above plus % used and Compare jobs) · Admin (people, roles, feedback inbox).

## What's built (all merged and live at https://hourkeeper.vercel.app)
1. **Foundation**: accounts, roles, offline storage and sync, sync badge.
2. **Job setup**: new job from an Excel/CSV/PDF hours sheet (checked on one screen before saving), a template, or blank; edit; assign techs; release, complete, reopen; save as template. Highett (59 tasks, 216 hours) is the demo job.
3. **Tech logging**: tap a task, log hours by day with a note; edit history; photos, files and comments; all offline.
4. **Reports**: sold vs actual by task and phase, extras (VO / non-productive) separately, hours by person and day, comments; PM-only % and **Compare jobs**; Share/Save PDF inside the app.
5. **Beta tools**: in-app Send feedback, automatic problem reports, Admin feedback inbox, Invite people, "new version ready" banner.

## How it's built
Expo SDK 58 / React Native 0.88 / Expo Router (one codebase: web now, iPhone/Android later) · Supabase (Postgres with row-level security, logins, file storage) · Vercel (hosting; deploys automatically when a pull request is merged to `main`). Offline = a local copy plus an outbox that syncs oldest-first.

## Status
Beta about to start: a small crew on one real job for 2-3 weeks. Run sheet: `BETA.md`. Day-to-day guide: `MY-INSTRUCTIONS.md`. Roadmap: `PLAN.md` ("After the beta": fix beta issues, company-ready, app stores, service/repair jobs, connections to payroll/accounting). Head-office pitch draft: `docs/PITCH.md`.

## Open questions
- Name (current name is a working title).
- What field/time systems Schindler already has, so the pitch can say how this differs or complements.
- Which payroll/accounting system the company uses.
- Data hosting and IT approval for anything beyond a pilot (the app currently runs on Darryl's own accounts).
- Does the company already have Apple/Google developer accounts?

## Constraints and cautions
- The Schindler layout drawings carry an IP notice: **don't copy them into the repo or the app**; only job facts (project no., quote no., stops, travel) are used.
- Don't put real customer or job data into the app until Darryl has cleared it with his manager and IT.
- Don't claim savings or numbers that haven't been measured.

## How Darryl works with Claude
Plain language, point form, and short answers preferred. Claude builds on a branch, opens a **draft pull request** with a Vercel preview link, and Darryl says **"merge it"**. Nothing goes live without that.
