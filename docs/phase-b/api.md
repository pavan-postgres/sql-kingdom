# Phase B – API outline (small container + Postgres)
Auth: managed provider (GitHub, Google, email link). The API trusts only the provider's signed token; roles: `learner`, `teacher` (your account id in an env var).

| Endpoint | Who | Purpose |
|---|---|---|
| POST /v1/enroll | learner | create/refresh enrollment |
| GET  /v1/releases | anyone | released days (from `day_releases`) |
| PUT  /v1/progress/:day | learner | idempotent upsert of story/tasks/quiz (the adapter behind `SK.storage`) |
| POST /v1/doubts, GET /v1/doubts?mine=1 | learner | ask / list own doubts with replies |
| POST /v1/feedback/:day | learner | rating + comment |
| DELETE /v1/me | learner | delete my data (events cascade) |
| POST /v1/teacher/releases/:day | teacher | "Release Day N" |
| GET  /v1/teacher/board | teacher | `v_progress_board` |
| GET/POST /v1/teacher/doubts | teacher | triage and reply |
| GET  /v1/teacher/notes/:day | teacher | speaker notes, if you want them in the page instead of the local presenter |

Hardening: per-IP and per-user rate limits, comment length caps (schema already enforces), spam challenge on sign-up, no PII in event `value`, privacy notice + delete-my-data.
