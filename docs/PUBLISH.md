# Publishing SQL Kingdom

Public repo `sql-kingdom` = what learners see (`pages/` is the only published folder). Private repo `sql-kingdom-teacher` = lesson sources and voice, speaker notes, reel recorder. Never mix them.

Site URL: `https://YOURNAME.github.io/sql-kingdom/`

## One-time setup
1. Create two empty GitHub repos: `sql-kingdom` (**Public**) and `sql-kingdom-teacher` (**Private**).
2. In `sql-kingdom/site/config.js` change `OWNER/sql-kingdom` to `YOURNAME/sql-kingdom`, then rebuild Day 1 (below) so the page picks it up.
3. Publish the public repo:
   ```
   cd sql-kingdom
   git init -b main && git add . && git status   # no teacher files, no .bak
   git commit -m "SQL Kingdom: Day 1"
   git remote add origin git@github.com:YOURNAME/sql-kingdom.git
   git push -u origin main
   ```
4. Repo **Settings → Pages → Source: GitHub Actions**. If the first run happened before you set this, re-run it from the **Actions** tab.
5. Open the site URL and check Day 1 plays with voice.
6. Publish the private repo the same way (check it says **Private**).

## Release a day
From `sql-kingdom-teacher`:
```
node tools/release/build-day.js N        # writes ../sql-kingdom/pages/dayNN.html and refreshes the home page
```
Then in `sql-kingdom`: `git add pages && git commit -m "Day N" && git push`. The home page unlocks Day N after the push. An existing day file is saved as `.bak` before it is rebuilt.

## Send it to a learner
Send the site link (or the `dayNN.html` file itself; it works offline). Her progress lives in her browser: **Recap → Progress code → Copy**, then you run `python3 tools/progress/decode.py CODE` in the teacher repo.
