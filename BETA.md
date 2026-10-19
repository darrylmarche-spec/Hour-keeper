# Hour Keeper — beta run sheet

A small crew uses Hour Keeper on one real job for 2–3 weeks. The aim is to find what's confusing or broken before it goes company-wide.

App: **https://hourkeeper.vercel.app** (the web app; add it to the home screen and it works like an app, offline too).

## 1. Before you start (PM / admin)

- [ ] **Tighten passwords** in Supabase: Authentication → Sign In / Providers → Email. Set *Minimum password length* to 10 and require letters and digits. (Blocking passwords from known data breaches needs Supabase's paid Pro plan; worth turning on if you upgrade for the company-wide rollout.)
- [ ] **Pick the job.** Create it with **New job → Import a file** (the hours sheet, as Excel, CSV or PDF), or start from the lift template. Check the lines and save.
- [ ] **Invite the crew.** Admin → **Invite people** sends a message with the link and home-screen steps. When each person has signed up, approve them in **Admin** and set their role (Field Tech, Supervisor, PM).
- [ ] **Add them to the job.** Job → **Team** → tick each person.
- [ ] **Release to field.** Job → **Release to field**. Techs see the job on their phones at the next sync.
- [ ] Ask everyone to open the app **once with signal** after being added, so the job downloads to their phone.

## 2. What testers do (send this to the crew)

> Each day you're on site:
> 1. Open Hour Keeper → the job → tap the task you worked on.
> 2. Pick the day, tap the hours (or type them), add a note if useful → **Save hours**.
> 3. Take a photo or add a comment if there's something the office should know.
> 4. No signal? Just carry on. Everything saves on the phone and sends when you're back in range. The badge at the top says what's waiting.
> 5. Made a mistake? Tap the entry to change it. It gets marked "Edited", which is fine.
> 6. Anything confusing or broken, or an idea: **More → Send feedback**. A few words is plenty.

## 3. During the beta (you)

- **Admin → Feedback & problems.** Check it every couple of days.
  - **Feedback**: what people sent. Mark items *Seen* or *Done*; the sender sees the status change.
  - **Problems**: crashes and unexpected errors the app reports by itself, with the screen, phone type and app version. Nobody has to describe them.
- **Reports tab → the job.** Watch sold vs actual build up. PMs also get **Compare jobs** once there are a few.
- Send me (Claude) anything from the inbox that needs fixing. Each fix ships as a new version: open phones show **"A new version of Hour Keeper is ready — Reload"**, and reloading never loses unsent work.

## 4. What to watch for

| Question | Where to look |
|---|---|
| Are people logging every day? | Report → *Hours by day* |
| Is the hours sheet split right? (lots of hours on "Other" lines = tasks missing) | Report → *Planned work and extras* |
| Does offline work on your sites? | Feedback; the sync badge |
| Are entries being corrected a lot? (confusing task names) | Report details → *Edited entries* |
| Do the PDFs make sense to the PM and supervisor? | Share one at the end of week 1 |

## 5. After the beta

- Go through the feedback together and decide what to change before rolling out wider.
- **Mark the job complete**, then save its report as a PDF. That's the first real sold-vs-actual record.
- Next steps from the plan: service & repair jobs, app-store builds (iPhone / Android), and connections to payroll and accounting if wanted.

## Known limits in the beta

- It's the **web app** on phones, not yet in the App Store or Play Store. "Add to Home Screen" gives the app experience.
- A person's **first** sign-in on a phone needs signal; after that it works offline.
- Photos are shrunk to about 1600 px wide, which is plenty for site records and keeps uploads small.
- Feedback and problem reports go to admins only.
