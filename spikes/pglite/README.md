# PGlite spike – real Postgres in the browser (Days 39+)
Result: works. Real planner output (Nested Loop, Hash Join, Bitmap scans) for `EXPLAIN`, ~2.7 s cold start, ~16 MB of files (wasm + data).
- Node check:    `cd spikes/pglite && npm i && node test-node.mjs`
- Browser check: copy `node_modules/@electric-sql/pglite/dist/*.{js,wasm,data}` into `web/pglite/`, serve `web/` over http, open `index.html`.
Not wired into the learner UI yet: the friendly mini engine stays for Days 1–~28; lessons on plans (Day 39+) load PGlite lazily so early days stay light.
License: Apache-2.0.
