# Pre-beta checks

From the settled ideas in `docs/IDEAS.md`. For each check, find out what
the app does today and report pass or fail, with evidence. Fix anything
that fails before the beta starts. If a fix is large, report it first
instead of building it.

## 1. Quoted figures never reach a tech's phone (idea 1)

- Sign in as a tech. Check what the phone receives from the database,
  not just what the screen shows.
- **Pass:** sold or quoted hours, percentages and comparison figures are
  not in any data synced to a tech's phone, and the database rules (RLS)
  block techs from reading them.
- **Fail:** they're downloaded and only hidden on screen.

## 2. Photos carry no location data (idea 8)

- Take a photo in the app with location turned on for the phone camera.
  Also attach a photo picked from the gallery. Download both uploaded
  files from storage and check them for GPS data.
- **Pass:** neither uploaded file contains GPS coordinates or other
  location data.
- **Fail:** either one does. Shrinking a photo doesn't always remove
  this data, so check the actual uploaded files.

## 3. Nobody's work is silently lost or overwritten (idea 10)

Test these three cases:

- **a. Clash:** a tech edits an entry offline. While they're offline, a
  PM corrects the same entry. The tech reconnects.
- **b. Refused change:** the server rejects a tech's change, for example
  because the job was closed while they were offline.
- **c. Deleted while offline:** a PM deletes or changes a task that a
  tech logged hours against while offline.

For each case, report what ends up saved, what the change history shows,
and what the tech sees.

- **Pass:** both versions are in the history, the tech can see what
  happened, and any refused change is shown to the tech in plain words.
- **Fail:** a version vanishes, or the tech isn't told.

## 4. Problem reports don't record activity (idea 2)

- Check what the beta's automatic problem reports and the feedback tool
  send.
- **Pass:** only the error itself, the app version and the device type.
  No list of screens visited, no record of taps, and no record of when
  the person used the app.
- **Fail:** any of that activity is collected.

Report back on all four before the beta starts.
