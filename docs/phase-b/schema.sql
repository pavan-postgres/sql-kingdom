-- SQL Kingdom · Phase B schema (PostgreSQL). Validated on PGlite (real Postgres, WASM).
-- Principle: events are append-only; day_progress is the cheap read model the dashboard uses.

create table learners (
  id            uuid primary key default gen_random_uuid(),
  auth_provider text not null,                       -- 'github' | 'google' | 'email'
  auth_subject  text not null,                       -- provider's stable user id (never store passwords)
  display_name  text,
  email         text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,                         -- soft delete; hard-delete job purges events too
  unique (auth_provider, auth_subject)
);

create table enrollments (
  learner_id  uuid not null references learners(id) on delete cascade,
  cohort      text not null default 'open',
  status      text not null default 'active' check (status in ('active','paused','left')),
  enrolled_at timestamptz not null default now(),
  primary key (learner_id, cohort)
);

create table day_releases (                          -- the "Release Day N" button writes here
  day         int primary key check (day between 1 and 60),
  released_at timestamptz not null default now(),
  released_by text not null
);

create table progress_events (
  id         bigserial primary key,
  learner_id uuid not null references learners(id) on delete cascade,
  day        int  not null check (day between 1 and 60),
  kind       text not null check (kind in ('scene_seen','task_attempt','task_passed','quiz_done','day_complete')),
  ref        text,                                   -- scene index / task index
  value      jsonb,                                  -- e.g. {"score":3} or {"sql":"..."}
  at         timestamptz not null default now()
);
create index on progress_events (learner_id, day, at);

create table day_progress (
  learner_id   uuid not null references learners(id) on delete cascade,
  day          int  not null,
  story        boolean not null default false,
  tasks_done   int  not null default 0,
  quiz_score   int,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (learner_id, day)
);

create table doubts (
  id         bigserial primary key,
  learner_id uuid not null references learners(id) on delete cascade,
  day        int  not null,
  scene      int,
  body       text not null check (length(body) between 1 and 4000),
  status     text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now()
);
create index on doubts (status, created_at);

create table doubt_replies (
  id          bigserial primary key,
  doubt_id    bigint not null references doubts(id) on delete cascade,
  author_role text not null check (author_role in ('teacher','learner')),
  author_id   uuid,
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create table feedback (
  id         bigserial primary key,
  learner_id uuid not null references learners(id) on delete cascade,
  day        int  not null,
  rating     smallint check (rating between 1 and 5),
  body       text check (length(body) <= 4000),
  created_at timestamptz not null default now(),
  unique (learner_id, day)
);

-- Teacher dashboard: who is enrolled, how far, and who looks stuck.
create view v_progress_board as
select l.display_name, e.cohort,
       count(*) filter (where p.completed_at is not null)         as days_done,
       max(p.updated_at)                                          as last_active,
       (select min(r.day) from day_releases r
         where not exists (select 1 from day_progress x
                            where x.learner_id = l.id and x.day = r.day and x.completed_at is not null)) as next_day,
       case when max(p.updated_at) < now() - interval '3 days' then 'quiet 3d+' else 'active' end as state
from learners l
join enrollments e on e.learner_id = l.id and e.status = 'active'
left join day_progress p on p.learner_id = l.id
where l.deleted_at is null
group by l.id, l.display_name, e.cohort;
