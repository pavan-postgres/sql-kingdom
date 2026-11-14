import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const t0 = Date.now();
await db.exec(fs.readFileSync('../../site/downloads/day01/practice.sql', 'utf8'));
console.log('Day 1 practice.sql loaded; toys rows =', (await db.query('select count(*)::int as n from toys')).rows[0].n);
// real planner output for the join-algorithm days (Day 47-49)
await db.exec(`create table a as select g as id from generate_series(1,20) g;
               create table b as select g as id, g%20+1 as a_id from generate_series(1,200000) g;
               create index on b(a_id); analyze a; analyze b;`);
for (const q of ['explain select * from a join b on b.a_id = a.id where a.id = 3',
                 'explain select * from a join b on b.a_id = a.id',
                 'explain select count(*) from b where a_id = 5']) {
  console.log('\n' + q); (await db.query(q)).rows.forEach(r => console.log('  ' + r['QUERY PLAN']));
}
// validate the Phase B schema on real Postgres
await db.exec(fs.readFileSync('../../docs/phase-b/schema.sql', 'utf8'));
console.log('\nphase-b schema.sql OK; tables:', (await db.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('learners','enrollments','day_releases','progress_events','day_progress','doubts','doubt_replies','feedback')")).rows[0].n);
console.log('elapsed ms', Date.now() - t0);
