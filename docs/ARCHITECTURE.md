# SQL Kingdom – architecture

```
sql-kingdom (PUBLIC)                         sql-kingdom-teacher (PRIVATE, never deployed)
  site/  static learner site (Pages/CDN)       teacher/dayNN.md          speaker notes
    days/dayNN/        one folder per day       teacher/dayNN-linkedin.md caption
    days/released.js  what learners can see    tools/present/            local presenter (site + notes + clock)
                                              tools/reel/record.py      private MP4 reel generator
  scripts/release.sh  release a day            tools/progress/decode.py  read learners' progress codes
  docs/phase-b/       API + Postgres schema
```
**Boundary:** anything inside `site/` is public by definition. Speaker notes, reels, captions and learner data never go there.
**Release = git:** add `days/dayNN/`, run `scripts/release.sh N`, push, tag. Learners see the day on the next load.
**Progress today:** browser storage + copy/paste progress code (`SK.storage` is the seam).  **Progress in Phase B:** the same seam backed by the API, so lessons don't change.
**Engines:** friendly mini engine (Days 1–~28) → PGlite real Postgres (Day 39+, see `spikes/pglite`).
