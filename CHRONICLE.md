# AutoInstaPost — Build Chronicle

A chronological log of every user prompt since the start of this project.

---

## Session 1 — Initial Build

1. **Implement the following plan:** auto-schedule Instagram posts — Google Drive → Claude AI caption → Instagram, with APScheduler, schedule config, pending approvals queue, and a new Schedule tab in the UI.

2. **Install APScheduler and start the backend.**

3. **Why is this not loading?** *(screenshot: Schedule tab stuck on "Loading schedule settings…")* — diagnosed as missing `/schedule` proxy route in `vite.config.js`.

4. **Not able to post.** *(screenshot: 400 error with `your-server.com` URL)* — `PUBLIC_BASE_URL` was still the placeholder value; Instagram couldn't fetch the image.

5. **Same error.** *(screenshot: 400 error with Cloudflare URL)* — OAuthException code 190, Instagram access token was expired/invalid.

6. **This is the error.** *(screenshot: OAuthException invalid token)* — implemented token exchange endpoint and auto-refresh logic.

7. **Is this the correct way to get a token? And yes, add automatic token refresh to the backend.** *(screenshot: Graph API Explorer)* — added `POST /instagram/token-exchange` and long-lived token auto-refresh (60-day tokens, refresh at 7 days remaining).

8. **Is this correct now?** *(screenshot: 4 permissions selected in Graph API Explorer)*

9. **Give me the command to open the .env file.**

10. **.env is updated now. Please restart the app.**

11. **Getting this error again.** *(screenshot: Instagram publish failed 400 "Media not ready")* — race condition; fixed by polling container `status_code` until `FINISHED` before publishing.

12. **Commit and push.**

13. **Create an AGENTS.md file with some instructions while posting anything on Instagram. #1 Never reuse photos. #2 Captions should look more human-generated than AI-generated.**

14. **Instead of asking every time to enter the Drive folder ID, I want you to store it in the background and show the user the folder name for ease.**

15. **Also, within the selected folder, if a photo is used show it under "Already posted" and the rest under "To be posted". Make these sections better if you have other better names.** — renamed to "Fresh shots" and "Already shared".

16. **Why don't I see the Poppy photo that was posted on Instagram under the "Already shared" section?** — manual posts weren't being recorded in `posted_photos.json`; fixed by calling `record_posted_id()` after every successful manual post.

17. **Allow me to select multiple photos so I can post a carousel on Instagram.**

18. **What timezone is the time under "Schedule" in?** — added server timezone badge next to the time picker.

19. **After the last change, photos are not loading — the app says "Loading photos".** — bug: `loadPhotos()` called `setSelectedPhoto(null)` (deleted state) causing a crash before `finally { setLoadingPhotos(false) }` ran; fixed to `setSelectedIds([])`.

20. **Also show AM/PM while selecting time. For captions, add a default caption and show it on the UI — on the Schedule tab and also as a fallback when AI caption generation fails.**

21. **I used this schedule but it didn't post anything — what happened? Create another tab to show failed and successful posts from the app along with manual/scheduled tags.** *(screenshot: schedule set to 1:39 AM)* — diagnosed: schedule was saved mid-minute, cron had already passed for that minute; also all photos were already marked as posted. Started building the History tab.

---

## Session 2 — Debugging & History Tab

22. **Why did the scheduled post not do anything or fail?** — diagnosed: `posted_photos.json` was written at 01:33 with 1 photo already marked; job fired at 01:39, found no unused photos, skipped silently.

23. **There are 7 fresh photos and still I don't see any post again. Debug and fix it.** — added `POST /schedule/run-now` investigation; found the real error was Instagram rejecting the image URL because the Cloudflare tunnel had expired.

24. **Instagram container creation failed (400): "Media download has failed. The media URI doesn't meet our requirements." — getting this error on the History tab.** — Cloudflare quick tunnel URL had changed; `PUBLIC_BASE_URL` in `.env` was stale. Documented how to update it and how to set up a permanent named tunnel.

25. **Commit and push.**

26. **Restart the backend.**

27. **History tab should also show future scheduled posts with date and time. Also validate if everything looks good for the scheduled post once the schedule is set up.** — added `GET /schedule/status` endpoint (next run time + 5 pre-flight checks: schedule enabled, folder set, fresh photos, public URL, token valid); History tab now shows a Schedule Status card at the top.

28. **How is the token expiring so quickly? Can you fix it so I don't have to keep changing it every day?** — found two bugs: (1) `get_token_status()` returned `status: "ok"` but the check looked for `valid: true` — always false; (2) `get_valid_token()` skipped auto-refresh when `expires_at == 0` (token from env var). Fixed both; token now correctly shows 59.3 days remaining and will auto-refresh at 7 days.

29. **Rerun the app as I can't access the URL.** — restarted both backend (port 8000) and frontend (port 5173).

30. **Even on first-time load, make the Google Drive folder the default.** — on mount, if no `localStorage` entry exists, fall back to `folder_id` from the schedule config.

31. **Store all prompts since start in a chronicle file.** ← *you are here*
