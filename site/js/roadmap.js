/* The whole 60-day roadmap (titles are public; lessons ship only when released). */
(function(){
'use strict';
var SK = window.SK;
var TOTAL = 60;
var PHASES = [
  { name: 'Toy Playroom', sub: 'Reading data', from: 1, to: 10, color: '#6c5ce7' },
  { name: 'Counting Party', sub: 'Summaries & grouping', from: 11, to: 17, color: '#ff9f43' },
  { name: 'Friends Between Cupboards', sub: 'Keys & joins', from: 18, to: 28, color: '#00a99d' },
  { name: 'Super Powers', sub: 'Windows, views, transactions', from: 29, to: 38, color: '#ff6b9d' },
  { name: 'Inside the Engine', sub: 'How SQL really runs (plans, scans, join algorithms)', from: 39, to: 52, color: '#3b82f6' },
  { name: 'Hero Level', sub: 'Production-grade internals & tuning', from: 53, to: 60, color: '#d64545' }
];
var ROAD = [
  'Cupboards, shelves & labels|Tables · rows · columns · SELECT',
  'Asking for just the right toys|WHERE',
  'Combining wishes|AND · OR · NOT · IN · BETWEEN',
  'Fuzzy memories|LIKE & patterns',
  'Lining things up|ORDER BY · LIMIT',
  'The empty slot|NULL',
  'Nicknames & no repeats|AS · DISTINCT',
  'Adding new toys|INSERT',
  'Fixing & tidying (safely)|UPDATE · DELETE · undo safety',
  'Build your own cupboard|CREATE TABLE · data types · mini project',
  'Counting toys|COUNT · SUM · AVG · MIN · MAX',
  'Sorting into baskets|GROUP BY',
  'Only the big baskets|HAVING',
  'If this, then that|CASE WHEN',
  'Word tricks|String functions',
  'Calendar tricks|Dates & times',
  'Checkpoint|Recap + mini project',
  'Name tags that never repeat|Primary keys',
  'Pointing at a friend|Foreign keys',
  'Matching pairs|INNER JOIN',
  'Keep everyone|LEFT JOIN',
  'The other sides|RIGHT · FULL JOIN',
  'Every possible pair|CROSS JOIN',
  'Mirror, mirror|Self join',
  'Stacking lists|UNION · INTERSECT · EXCEPT',
  'Questions inside questions|Subqueries',
  'Sticky notes|CTEs (WITH)',
  'Checkpoint|Joins project',
  'The ranking race|Window functions: ROW_NUMBER · RANK',
  'Running totals & neighbours|SUM OVER · LAG · LEAD',
  'Rewind the clock|Recursive CTEs',
  'Saved questions|Views',
  'Rules of the house|Constraints',
  'All or nothing|Transactions · COMMIT · ROLLBACK',
  'ACID in a toy shop|Atomicity · Consistency · Isolation · Durability',
  'Who goes first?|Isolation levels',
  'Boxes inside boxes|JSON & arrays',
  'Checkpoint|Super powers project',
  'The kitchen behind the door|Parser → Planner → Executor',
  'Pages & the heap|How rows sit on disk',
  'Walking every shelf|Sequential scan',
  'The book index|B-tree indexes',
  'Jumping with the index|Index scan · index-only scan',
  'Collecting bookmarks|Bitmap scan',
  'The planner’s notebook|Statistics & cost',
  'Reading the plan|EXPLAIN · EXPLAIN ANALYZE',
  'Knock, knock, who’s there?|Nested Loop join',
  'The sorting hat & the sack|Hash join',
  'The zipper|Merge join',
  'Who joins whom first?|Join order',
  'Sorting & grouping inside|Sort · HashAggregate',
  'Checkpoint|Read and explain a real plan',
  'Many readers, no fights|MVCC',
  'The night janitor|VACUUM',
  'The diary that saves you|WAL & crash recovery',
  'Traffic lights|Locks',
  'Making slow fast|The tuning playbook',
  'Slicing giant cupboards|Partitioning',
  'Twin cupboards|Replication',
  'Hero capstone|Explain any query, inside out'
];
function phaseOf(n){ for (var i = 0; i < PHASES.length; i++){ if (n >= PHASES[i].from && n <= PHASES[i].to) return PHASES[i]; } return PHASES[0]; }

SK.TOTAL = TOTAL; SK.PHASES = PHASES; SK.ROAD = ROAD; SK.phaseOf = phaseOf;
})();
