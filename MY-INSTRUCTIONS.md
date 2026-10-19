# Hour Keeper: my instructions

**App:** https://hourkeeper.vercel.app
**My login:** darrylmarche@protonmail.com (Admin)

---

## Put it on my phone

- **iPhone:** open the link in Safari, then Share → **Add to Home Screen**.
- **Android:** open the link in Chrome, then ⋮ → **Add to Home screen**.
- Open it **once with signal** so it saves itself to the phone. After that it works offline.

---

## People

**Invite someone**
1. **Admin** tab → **Invite people**.
2. Send the message by text, email or Teams. It has the link and the home-screen steps.

**Approve them** (after they sign up)
1. **Admin** tab → **Waiting for approval**.
2. Tap their role: **Field Tech / Supervisor / Project Manager / Admin**.
3. Tap **Approve**.

**Change a role:** Admin → find the person → tap the new role.
**Remove someone:** Admin → **Switch off**. Their past hours stay in reports.
**Second admin:** approve them and tap **Admin**.

| Role | Can do |
|---|---|
| Field Tech | Sees jobs they're on; logs their own hours, photos, notes |
| Supervisor | Sets up and edits jobs, sees all jobs, plain-hours reports |
| Project Manager | Everything a supervisor can, plus **% used** and **Compare jobs** |
| Admin | Everything, plus people, roles and the feedback inbox |

---

## Set up a job

1. **Jobs** tab → **New job**.
2. Fill in what you know: name, Project No., Quotation No., customer, address, stops, travel. The name and sheet total can come from the file.
3. Choose how to add the tasks:
   - **Import a file**: the hours sheet as Excel (.xlsx), CSV or PDF.
   - **Start from a template**: the lift install template, or one you've saved.
   - **Start blank**: type the tasks in.
4. **Check tasks** screen:
   - Lines marked orange need a look (repeated or out-of-order line numbers).
   - A note shows if the sheet total doesn't match the lines. Reports use the lines.
   - Fix anything, then tap **Save job**.
5. The job is saved as a **Draft**. Techs can't see it yet.

**Add the crew:** open the job → **Team** → tick each person.
**Send it to the field:** **Release to field**. Techs get it on their phones at the next sync.

**Change a job later:** open the job → **Edit job**.
- You can change tasks and sold hours any time.
- A task that already has hours logged can't be deleted.

**Finish a job:** **Mark job complete**. Logging stops; **Reopen** if you need corrections.

**Save as template:** on any job, **Save as template**. It shows up next time you create a job.
**Manage templates:** **More** → **Templates** (rename or remove).

---

## Logging hours (what techs do)

1. Open the job → tap the task.
2. Pick the day → tap or type the hours → add a note if useful → **Save hours**.
3. Under that, add photos, files or comments.
4. To fix a mistake, tap the entry and change it. It's marked **Edited**, and tapping that shows what changed.

**PMs, supervisors and admins can correct anyone's entry.** To log my **own** hours on a job, I need to add myself to its **Team** first.

---

## Reports

- **Reports** tab → tap a job (or open the job → **Sold vs actual report · PDF**).
- The report shows sold vs actual for every task and phase, extras (VO and non-productive), hours by person and by day, and comments.
- **Share PDF / Save PDF**: you stay in the app.
- **Compare** (top right of Reports, for PMs and admins): jobs ranked by % used, plus the tasks that run over on job after job.

---

## The sync badge (top right)

| Badge | Meaning |
|---|---|
| **Synced** | Everything is saved to the office |
| **3 to send** | Saved on the phone, sending now |
| **Offline · 3 waiting** | No signal; it sends when signal returns. Keep working. |
| **1 not saved** (red) | The server refused a change. Tap the badge to see why. |

Tap the badge any time for details.

---

## Beta: checking feedback

- **Admin** tab → **Feedback & problems**.
  - **Feedback** is what people sent from More → Send feedback. Mark it **Seen** or **Done**; they see the change.
  - **Problems** are crashes or errors the app reported by itself, with the screen, phone type and version.
- Check it every couple of days. Paste anything that needs fixing to Claude.
- The full beta run sheet is in **BETA.md**.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| "A new version of Hour Keeper is ready" | Tap **Reload**. Nothing unsent is lost. |
| "This screen didn't load" | **Try again**, or **Go to Jobs**. Usually no signal; try again with signal. |
| Stuck on the loading screen | Wait about 10 seconds for the **Reload** button, or close and reopen the app. |
| A tech can't see a job | Check the job is **released** and they're ticked under **Team**; ask them to open the app with signal. |
| Someone can't sign in | Check they're **approved** in Admin and not switched off. |
| New phone or first sign-in | Needs signal once to download everything. |

Version number: bottom of the **More** tab. Include it when reporting a problem.

---

## Behind the scenes (only if needed)

| What | Where |
|---|---|
| The live app | Vercel → project **hourkeeper**. It updates by itself whenever code is merged. |
| Data and logins | Supabase → project **hour-keeper** (Sydney). Free plan. |
| The code | GitHub → **darrylmarche-spec/Hour-keeper** |
| Build plan | **PLAN.md** in the code |

**Supabase password setting** (do once): Authentication → Sign In / Providers → Email → minimum password length **10**, require letters and digits.

**Working with Claude:** describe the change you want. Claude builds it and opens a pull request with a test link, and you reply **"merge it"** to put it live.

---

## Still to come (from the plan)

- Service and repair job types
- iPhone App Store and Android Play Store versions
- Connections to payroll or accounting, if wanted
