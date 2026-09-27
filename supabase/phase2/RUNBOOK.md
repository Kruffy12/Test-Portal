# Phase 2 switchover runbook

Nothing here runs until the owner says **"switch over"**. Book 90 minutes; expect 45–60.

Project: `lakusziubvqhqhrlkdhd` (live). Frontend branch: `phase2-local` (this worktree).

## Staging result (2026-09-27)

Throwaway project `pviqyfnqzcsosihpoxks`. Backup + switchover SQL ran as written. `api` deployed with `--no-verify-jwt`. `node supabase/phase2/staging/smoke.mjs` → **82 passed, 0 failed**. Browser: manager signed in, Dashboard greeted “Test Manager”, Current Jobs listed the 3 fake jobs with Delete on each.

## Before the day

- [x] Staging project passed every check in "Smoke tests" below, for all three roles.
- [ ] Pre-switch release is live on `origin/main` for at least a day (maintenance screen for the
      old app + sign-in card). Every shop device has opened the portal since.
- [ ] Staff broadcast the day before: "The portal will be down for an upgrade on ___ from ___.
      You'll need to sign in again afterwards. Your password stays the same."
- [ ] Someone is at the POS for the drawer and printer test.

## The window

1. **Maintenance on.** Publish the "maintenance" broadcast so open screens show the upgrade screen.
2. **Deploy the function in maintenance mode** (nothing uses it yet, so this is harmless):
   ```
   npx supabase secrets set SC_MAINTENANCE=1 --project-ref lakusziubvqhqhrlkdhd
   npx supabase functions deploy api --no-verify-jwt --project-ref lakusziubvqhqhrlkdhd
   ```
   Check: `ping` answers `{api: 2, maintenance: true}`.
3. **Back up.** Run `01_backup.sql`. The last query must show matching row counts for every table.
4. **Switch the database.** Run `02_switchover.sql` (one transaction; if it errors, nothing changed).
   From here the old app can no longer read or write.
5. **Publish the new frontend.** Merge `phase2-local` into `main` and push to `origin`. Wait for
   GitHub Pages to finish (1–2 min) and confirm `sw.js` shows `CACHE_DATE = '2026-09-27-p2'`.
6. **Maintenance off.**
   ```
   npx supabase secrets set SC_MAINTENANCE=0 --project-ref lakusziubvqhqhrlkdhd
   ```
   Open screens reload by themselves within ~20s and show the sign-in card.
7. **Smoke tests** (below). Then deactivate the maintenance broadcast.

## Smoke tests

Sign in as each role on a phone and on the POS.

- [ ] Wrong password shows "Incorrect…"; 5 wrong tries pause the username for 15 min.
- [ ] "Remember this device" survives closing the app; unticked sign-in ends with the tab.
- [ ] Manager: suspend a test user → that user's open screen returns to sign-in within ~45s.
- [ ] New job with 3 photos → photos show on the job; `audit_log` has `JOB_CREATE` + `PHOTO_UPLOAD`.
- [ ] Claim / unclaim; a technician can't edit a job claimed by someone else.
- [ ] Delete: button only shows for manager, creator, or claimer; `JOB_DELETE` is logged.
- [ ] Sale with receipt print + drawer; edit the sale (`SALE_EDIT` logged); reverse it.
- [ ] Payout, bill, day close; inventory stock adjust; special order create + status.
- [ ] Customer tracker page still finds a repair (uses `track_repair`).
- [ ] Settings: change password → other devices of that user are signed out.
- [ ] Direct database check (must fail): the anon key can't read `users` or `jobs`, and can't
      upload to `repair-photos`. Photo links still open.

## Rollback (if a smoke test fails and can't be fixed in the window)

1. `npx supabase secrets set SC_MAINTENANCE=1 --project-ref lakusziubvqhqhrlkdhd`
2. Run `90_rollback.sql` (restores passwords, grants, policies; ends all new sessions).
3. `git revert` the merge on `main`, push to `origin`, wait for Pages.
4. Deactivate the maintenance broadcast. Old app works as before; the function sits unused.

Anything written through the new app during the window stays in the tables (rollback only
restores access and passwords, not rows).

## After

- A few days of normal use, then the owner confirms → run `99_cleanup_after_confirm.sql`
  (drops the backup schema, which holds the old plain-text passwords).
- Watch Edge Function invocations in the Supabase dashboard for the first week (free plan: 500k/month).
