# 🧸 SQL Kingdom – learn SQL from zero, one hour a day

A 60-day, story-based SQL course. Each day is **one page** with a voiced 3D story, a practice box, a quiz and a scorecard. 30 minutes of story, 30 minutes of practice.

## Open it
- **Online:** go to `https://<OWNER>.github.io/sql-kingdom/` and open today's day.
- **Offline:** download `pages/day01.html` (or any `dayNN.html`) and double-click it. The voice, 3D scenes and practice box are all inside the file; no install, no internet.

Press **Play** and listen. Progress and scorecards are saved in your browser. Use the **Recap** tab to see them or copy your progress code.

## Practice on your own database (optional)
Each day's page has a **Take-home files** card with `practice.sql`. Run it in any of these:
- **SQLite:** `sqlite3 playroom.db < practice.sql`
- **PostgreSQL:** `psql -d scratch -f practice.sql`
- **PostgreSQL in Docker (nothing else installed):**
  ```bash
  docker run --rm -d --name kingdom -e POSTGRES_PASSWORD=kingdom -p 5432:5432 postgres:16
  docker exec -i kingdom psql -U postgres < practice.sql
  ```

`practice.sql` rebuilds the playroom from scratch each time, so experiment freely.

## What is in this repo
- `pages/` – the course: `index.html` (home) and one `dayNN.html` per released day. Only this folder is published.
- `site/` – the app's source code (used to build the day pages).
- `docs/` – the 60-day roadmap and publishing notes.

License: to be decided (content); code Apache-2.0 suggested. Three.js (MIT) is bundled inside each day page.
