# Hour Keeper — Ideas

Settled ideas from the ideas chat. Each one is judged on two questions:
would a tech use it unaided, and does it feel like tracking?

This file is ideas only. The build chat decides how and when to build them.

## Settled

### 1. Quoted figures are blocked by the database, not just hidden

- Techs see only their own job and straight hours. Quoted hours,
  percentages and comparisons never reach a tech's phone.
- Enforce it with database access rules (Supabase row-level security),
  not by hiding things on screen.
- Why: if the data is on the phone, someone will find it, and the app
  then looks like it was hiding something. Trust depends on this.
- Sold hours are also commercially sensitive: they reveal how Schindler
  prices work. Another reason they never reach the phone.
- Build chat: confirm this is how it works today.

### 2. Monitoring means crash reports only, never activity logs

- Collect crash and error reports only.
- Never record what a user does or when they do it (screens opened,
  taps, time in app, usage patterns).
- The existing automatic problem reports are the limit.
- Why: activity logs are exactly what a crew or union rep would call
  tracking.

### 3. Automated checks run on every change

- Every change runs the existing tests, typecheck and lint before it
  goes live (e.g. GitHub Actions).
- Why: part of being company-ready. The crew never sees it; it just
  stops broken updates reaching them.

### 4. Remote sign-out of a lost or stolen phone

- An admin can sign out a lost or stolen phone in one action.
- Honest limit: because the app works offline, the sign-out takes effect
  when the phone next connects. Until then, that job's data stays on the
  phone. Say this plainly in the pitch.
- Why: head office IT will ask about this before approving the app.

### 5. Built for Schindler, not for selling

- Hour Keeper is an internal Schindler tool, not software sold to other
  companies.
- Group jobs and people by branch or region (already in `PLAN.md`), not
  as separate customer companies.
- No per-user billing.
- Why: keeps the app simple, and avoids building for a business case
  that doesn't exist. Selling outside Schindler would be a separate
  decision, starting with who owns the software.

### 6. Push notifications only tell a tech what happened to them

- Techs choose whether to turn notifications on. The app works fully
  with them off.
- Only tell a tech about something that happened to them, e.g. "You've
  been added to a job" or "Your PM corrected one of your entries" (this
  also supports corrections being visible).
- Never: reminders to log hours, "you haven't logged today", overdue
  warnings, or anything sent to the office about a tech's activity.
- Offline is fine: a notification arrives when the phone next has signal.
- Why: alerts that chase techs are exactly what makes an app feel like
  tracking. `PLAN.md` lists optional push notifications for the
  app-store version, so this rule applies before that work starts.

### 7. No live view of field activity

- The office sees hours per job and task after the phone syncs, never a
  live feed of who logged what, or when.
- No live dashboards of field activity, even if a tool makes it easy.
- Why: a live view is monitoring, which the design rules forbid.
  Comparing sold vs actual is after-the-fact work anyway.

### 8. Photos carry no location data

- Phone cameras usually save GPS coordinates inside each photo file.
  Remove them before upload, including photos picked from the gallery.
- Build chat: confirm this. Shrinking a photo may or may not remove it.
- Why: location data reaching the office is GPS tracking by accident,
  against the design rules.

### 9. Photos are trustworthy records

- Keep the time each photo was taken.
- Once synced, a photo can't be quietly replaced or deleted. Any change
  is visible, the same as corrections.
- Why: photos only protect a tech if they can be trusted. This records
  when the photo was taken, not where the tech was; the tech chooses
  when to take one.

## Parked

- **AI agents / MCP:** possible later on the office side only, read-only
  questions about finished jobs. Never on the tech side. Needs Schindler
  IT and AI policy approval first.
- **Server-side functions for payroll:** revisit when payroll connections
  are planned, so payroll logins stay on the server, not on phones.
- **Office-side search across past jobs:** search jobs and tasks (e.g.
  "which jobs ran over on this task type?") once there are many jobs.
  Jobs and tasks only, not techs' notes: notes protect the tech and
  must not become a way to dig for blame. Techs don't need search.

## Open questions

- Name (working title).
- What field or time systems Schindler already has.
- Which payroll system the company uses.
- Company login: will IT want techs to sign in with their existing
  Schindler work account (single sign-on)?
- How long hour records are kept, who decides, and whether they count as
  employment records. Ask HR or legal.
- Which country the database is stored in (check the Supabase region).
- Offline storage: `PLAN.md` says SQLite, the app's dependencies list
  AsyncStorage. Is that deliberate?
