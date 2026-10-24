# Pre-beta check results

Results for the six checks in `docs/PRE-BETA-CHECKS.md`. Updated in each
pull request that works on one. Last updated 24 Oct 2026.

| # | Check | Status |
|---|-------|--------|
| 1 | Quoted figures never reach a tech's phone | **Fail today.** Fix not built yet. |
| 2 | Photos carry no location data | **Fixed and passing** (tested in the web app; not yet on a real phone camera) |
| 3 | Nobody's work is silently lost or overwritten | Not yet checked or fixed |
| 4 | Problem reports don't record activity | **Pass** |
| 5 | iPhone can't wipe unsynced hours (web app) | Not started |
| 6 | Live data is protected during AI-assisted building | **Open: needs a decision from Darryl** (see below) |

Also done in the same pull request: the report no longer ranks people by
hours (see "Related change").

## 2. Photos carry no location data

**Before the fix: fail.** Test photos carrying GPS were put through the
real web app by all three routes and the uploaded files were inspected
byte by byte.

| Route | Result before | Result now |
|---|---|---|
| Camera | Clean (the browser re-saves the photo) | Clean |
| Photo library | Clean (same reason) | Clean |
| **File button** (a photo added as a file) | **GPS kept, in all 5 test files** | Clean |
| A photo the app can't shrink | Original uploaded as it was | Cleaned, or refused |
| A fake "photo" (not an image) | Uploaded without complaint | Refused with a plain message |

The test files:

- JPEG with EXIF GPS, camera details, time, comment, colour profile and a
  "rotated" flag.
- PNG with EXIF GPS.
- Progressive JPEG with GPS in an XMP packet.
- JPEG with a second photo (with its own GPS) appended after the end.
- 2400 px JPEG with GPS (camera and library routes).

**What was changed.** Every image, however it's added, now goes through
`src/files/imageClean.ts` before it can be saved or uploaded:

- Kept: the picture itself, the colour profile, and which way up it is.
- Removed: EXIF (GPS, camera, time, thumbnail), XMP, IPTC, comments, and
  anything stuck on after the end of the image.
- The picture data isn't touched. Checked with a second image library
  (Pillow): pixels identical before and after, all four test files.
- A photo that can't be cleaned is refused, never uploaded as it was.

**Evidence now.** 8 automated tests on the cleaner. Browser run: 7 files
reached storage; every image is a single JPEG that opens; none has a GPS
location, or any GPS, camera, XMP or EXIF text anywhere in its bytes; big
photos are 1600 px wide; the PNG came out as a JPEG without its data; the
plain text file was unchanged; the fake photo was refused.

**Not covered.**

- Real phone cameras. Only the web version has run, with GPS-tagged test
  photos, not a photo from a phone with location turned on. The cleaner
  works on the file's bytes, so it doesn't depend on the phone, but the
  phone camera route in the app hasn't run on a phone.
- Capture time. It was in the removed hidden data. Idea 9 (photos as
  trustworthy records) needs it kept some other way: record it as its own
  field before removing the rest. Not built yet.
- Files that aren't images (PDFs, spreadsheets) are uploaded unchanged and
  can carry their own hidden details.

## 4. Problem reports don't record activity

**Pass.**

- `app_errors` holds: id, who, the error message, the stack, the page path,
  app version and build, device type, a repeat count, and timestamps.
  `feedback` holds: who, kind, the text, version, device type, status and
  timestamps (confirmed against the live database's columns).
- The app keeps one value for "current screen", overwritten as the person
  moves, not a list. It is only attached to an error.
- No analytics, tracking or monitoring library is installed (`package.json`),
  and a search of `src/` and `supabase/` found no tracking code and no
  "last seen" field.
- Nothing is written when there's no error, apart from feedback the person
  chooses to send.
- Two small notes, neither is activity logging: the page path can contain a
  job ID, and a repeated error updates one row's timestamp (the last time
  that error happened).

## 6. Live data is protected during AI-assisted building

**Open. This needs a decision from Darryl.** From what is available to the
build chat today:

- The AI tool can run changes on the live Supabase database (new tables,
  access rules, data updates) directly, in the same step as building.
  Migrations 0008 to 0011 were applied that way, and the repository's
  migration files were written to match.
- That is fine while the database holds only demo data. Once the beta
  starts it holds real hours from real techs, and the check says changes
  should need Darryl's approval first.

Options, simplest first: (a) a rule that the AI tool writes a migration file
and Darryl approves it before anything touches the database; (b) a
separate test database for building, with the live one changed only after
approval; (c) a limited access token that can't change live data. Which one
is a decision for Darryl.

## Related change: the report no longer ranks people (idea 11)

The "Hours by person" list on the report was sorted with the most hours
first, and every tech could see it. That was effectively a league table.

- The office sees the list in name order.
- A tech sees only their own hours ("Your hours"), not colleagues'.
- Job totals and the day-by-day table are unchanged.

Colleagues' names can still appear as the author of a comment, which is a
shared team thread.
