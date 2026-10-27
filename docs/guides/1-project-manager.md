# Hour Keeper: guide for Project Managers

**The app:** https://hourkeeper.vercel.app

## What it does, in one minute

Your crew records the hours they work on each task of a job, on their phone. You set up the job with the hours you **sold** for each task. The app then shows you **sold against actual**, task by task, so you can see where a job is running over, and which tasks run over again and again on different jobs.

It works with no signal. Hours are saved on the phone and sent to the office when the phone gets signal back.

It does **not** track anyone. There is no GPS, no clock-in, and no live view of where people are or when they opened the app. Photos have their location data removed before they are saved.

## Put it on your phone

1. **iPhone:** open the link in **Safari**, tap the Share button, then **Add to Home Screen**.
2. **Android:** open the link in **Chrome**, tap the three dots, then **Add to Home screen**.
3. Open it once with signal so it saves itself. After that it works offline.
4. Sign up with your work email. An admin has to approve you before you can get in.

## What you can do

| You can | Where |
|---|---|
| Set up a job and its tasks | Jobs tab, **New job** |
| Add the crew to a job | Open the job, **Team** |
| Send the job to the field | Open the job, **Release to field** |
| Change tasks or sold hours later | Open the job, **Edit job** |
| Correct anyone's hours | Open the job, tap the task, tap the entry |
| Finish a job | Open the job, **Mark job complete** |
| See sold, actual, over and **% used** | Job screen and Reports tab |
| Compare jobs | Reports tab, **Compare** |
| Share a report as a PDF | Reports tab, tap a job |
| Save a job's task list as a template | Open the job, **Save as template** |

You also see everything a Supervisor sees. Percentages and **Compare** are for PMs and Admins only.

## Setting up a job

1. Go to the **Jobs** tab and tap **New job**.
2. Fill in what you know: name, project number, quotation number, customer, address, number of stops and travel. You can leave blanks.
3. Choose how to add the tasks:
   - **Import a file:** the hours sheet as Excel, CSV or PDF. The app reads it for you.
   - **Start from a template:** for example the lift installation template.
   - **Start blank:** type the tasks in.
4. You land on the **Check tasks** screen.
   - Lines marked orange need a look (a repeated or out-of-order line number).
   - If the sheet's total doesn't match the lines added up, a note tells you. Reports always use the lines.
   - Fix anything, then tap **Save job**.
5. The job is saved as a **Draft**. Nobody in the field can see it yet.

**Add the crew:** open the job, tap **Team**, and tick each person. Approved field techs are listed first, other approved people below. If someone is missing, ask an Admin to approve them.

**Send it to the field:** tap **Release to field**. Techs get the job on their phone the next time it syncs.

**To log your own hours** on a job, add yourself under **Team** first.

## Changing a job later

Open the job and tap **Edit job**. You can rename things, add or remove tasks, and change sold hours at any time. A task that already has hours logged on it **can't** be removed.

If someone else changes the same entry at the same time as you, nothing is lost. See "Clashes" below.

## Reading the numbers

- **Sold:** the hours you set up for the task or job.
- **Actual:** the hours the crew have logged.
- **Remaining** or **Over:** sold minus actual.
- **Used:** actual as a percentage of sold. Only you and Admins see this.

On the **Reports** tab, tap a job for its full report: every task and phase, extras, hours by person and by day, and comments. Tap **Share PDF** (or **Save PDF**) to send it. You stay in the app.

**Extras** are the two "Other" lines on every job: variations (extra productive work) and non-productive time such as site not ready. The notes and photos on those lines are your evidence.

**Compare** (top right of the Reports tab) ranks jobs by how much of the sold hours they used. It also lists the tasks that run over on job after job, which is the evidence for quoting them differently next time.

## Corrections are visible

You can correct anyone's entry. The entry is then marked **Edited**, and anyone can tap that to see what it was before, what it is now, and who changed it. Nobody's hours are changed in secret.

## Clashes and "not saved" messages

- If you and a tech change **different** things on the same entry (you fix the hours, they add a note), both changes are kept.
- If you both change the **same** thing, the app never overwrites either. The person who was offline is shown both versions and chooses. Both stay in the entry's history.
- If a change can't be saved (for example the job was completed), the person sees a plain message and their change is kept on their phone until they deal with it.

## Finishing a job

Tap **Mark job complete**. Techs can no longer log hours on it. If you need to fix something afterwards, tap **Reopen**, make the correction, then complete it again. Then save the report as a PDF: that is the job's sold-versus-actual record.

## The sync badge (top right)

| Badge | Meaning |
|---|---|
| **Synced** | Everything is saved to the office |
| **3 to send** | Saved on the phone and sending now |
| **Offline · 3 waiting** | No signal. It sends when signal returns. |
| **1 not saved** (red) | A change was refused. Tap the badge to see why. |

## If something goes wrong

| Problem | What to do |
|---|---|
| "A new version of Hour Keeper is ready" | Tap **Reload**. Nothing unsent is lost. |
| A tech can't see a job | Check it is **released** and they are ticked under **Team**. Ask them to open the app with signal. |
| A tech can't sign in | Ask an Admin to check they are approved and not switched off. |
| Anything confusing or broken | **More**, then **Send feedback**. A few words is enough. |
