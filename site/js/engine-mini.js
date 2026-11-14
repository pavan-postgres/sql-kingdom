/* Tiny, kid-friendly SQL engine for the early days. Later days use real Postgres (see spikes/pglite). */
(function(){
'use strict';
var SK = window.SK, DB = SK.DB;
function SqlError(msg){ this.message = msg; }
function tokenize(s){
  var toks = [], i = 0, n = s.length, m;
  var re = /(?:(--[^\n]*)|('(?:[^']|'')*')|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<>|!=|>=|<=|=|<|>|\*|,|\(|\)|;)|(\S))/y;
  var ws = /\s*/y;
  while (true){
    ws.lastIndex = i; ws.exec(s); i = ws.lastIndex; if (i >= n) break;
    re.lastIndex = i; m = re.exec(s); if (!m) break; i = re.lastIndex;
    if (m[1]) continue;
    if (m[2]) toks.push({ t: 'str', v: m[2].slice(1, -1).replace(/''/g, "'") });
    else if (m[3]) toks.push({ t: 'num', v: parseFloat(m[3]) });
    else if (m[4]) toks.push({ t: 'id', v: m[4], u: m[4].toUpperCase() });
    else if (m[5]) toks.push({ t: 'op', v: m[5], u: m[5] });
    else throw new SqlError('Pico doesn’t understand the symbol ‘' + m[6] + '’. For words, use single quotes like \'red\'.');
  }
  return toks;
}
function cmpv(a, b){
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  a = String(a); b = String(b);
  return a < b ? -1 : (a > b ? 1 : 0);
}
function runSql(sql){
  var T = tokenize(sql), p = 0, colMap = {}, tname = '';
  function isKw(k){ var t = T[p]; return !!(t && t.t === 'id' && t.u === k); }
  function eatKw(k){ if (isKw(k)){ p++; return true; } return false; }
  function isOp(o){ var t = T[p]; return !!(t && t.t === 'op' && t.u === o); }
  function eatOp(o){ if (isOp(o)){ p++; return true; } return false; }
  function colErr(c){ return new SqlError('The ‘' + tname + '’ cupboard has no label called ‘' + c + '’. Its labels are: ' + DB[tname].cols.join(', ') + '.'); }
  function lit(){
    var t = T[p];
    if (!t || (t.t !== 'str' && t.t !== 'num')) throw new SqlError('Pico expected a value here. Words need single quotes, like \'red\'. Numbers don’t.');
    p++; return t.v;
  }
  function and2(x, y){ return function(r){ return x(r) && y(r); }; }
  function or2(x, y){ return function(r){ return x(r) || y(r); }; }
  function not1(x){ return function(r){ return !x(r); }; }
  function parseOr(){ var a = parseAnd(); while (eatKw('OR')){ a = or2(a, parseAnd()); } return a; }
  function parseAnd(){ var a = parseNot(); while (eatKw('AND')){ a = and2(a, parseNot()); } return a; }
  function parseNot(){ if (eatKw('NOT')) return not1(parseNot()); return parseCmp(); }
  function parseCmp(){
    if (eatOp('(')){ var inner = parseOr(); if (!eatOp(')')) throw new SqlError('A bracket ( was opened but never closed with ).'); return inner; }
    var ct = T[p];
    if (!ct || ct.t !== 'id') throw new SqlError('After WHERE, name a label to check, like: WHERE color = \'red\'');
    var col = colMap[ct.v.toLowerCase()]; if (!col) throw colErr(ct.v);
    p++;
    var neg = false; if (isKw('NOT')){ p++; neg = true; }
    var f;
    if (eatKw('LIKE')){
      var pat = String(lit());
      var rx = new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
      f = function(r){ return rx.test(String(r[col])); };
    } else if (eatKw('IN')){
      if (!eatOp('(')) throw new SqlError('IN needs a bracketed list, like: IN (\'red\', \'blue\')');
      var vals = []; do { vals.push(lit()); } while (eatOp(','));
      if (!eatOp(')')) throw new SqlError('Close the list with ).');
      f = function(r){ return vals.some(function(v){ return cmpv(r[col], v) === 0; }); };
    } else if (eatKw('BETWEEN')){
      var lo = lit(); if (!eatKw('AND')) throw new SqlError('BETWEEN needs AND, like: BETWEEN 5 AND 7');
      var hi = lit();
      f = function(r){ return cmpv(r[col], lo) >= 0 && cmpv(r[col], hi) <= 0; };
    } else {
      var ot = T[p];
      if (!ot || ot.t !== 'op' || ['=', '<>', '!=', '<', '>', '<=', '>='].indexOf(ot.u) < 0) throw new SqlError('After ‘' + ct.v + '’ use a comparison like =, <, > or LIKE.');
      p++; var v = lit(); var o = ot.u;
      f = function(r){
        var c = cmpv(r[col], v);
        if (o === '=') return c === 0; if (o === '<>' || o === '!=') return c !== 0;
        if (o === '<') return c < 0; if (o === '>') return c > 0; if (o === '<=') return c <= 0; return c >= 0;
      };
    }
    return neg ? not1(f) : f;
  }
  if (!T.length) throw new SqlError('Write a sentence for Pico first. Try: SELECT * FROM toys;');
  if (!eatKw('SELECT')) throw new SqlError('Every question to Pico starts with the magic word SELECT.');
  var distinct = eatKw('DISTINCT'), star = false, count = false, items = [];
  if (eatOp('*')) star = true;
  else if (isKw('COUNT')){ p++; if (!(eatOp('(') && eatOp('*') && eatOp(')'))) throw new SqlError('To count, write COUNT(*).'); count = true; }
  else {
    do {
      var t = T[p];
      if (!t || t.t !== 'id' || t.u === 'FROM') throw new SqlError('After SELECT, tell Pico which labels (columns) you want, like: SELECT name FROM toys;');
      items.push(t.v); p++;
    } while (eatOp(','));
  }
  if (!eatKw('FROM')) throw new SqlError('Pico needs to know WHICH cupboard. Add FROM and a table name, like: FROM toys');
  var tt = T[p];
  if (!tt || tt.t !== 'id') throw new SqlError('After FROM, write the name of a cupboard (table): ' + Object.keys(DB).join(', ') + '.');
  p++; tname = tt.v.toLowerCase();
  var tbl = DB[tname];
  if (!tbl) throw new SqlError('Pico can’t find a cupboard called ‘' + tt.v + '’. Cupboards in this playroom: ' + Object.keys(DB).join(', ') + '.');
  tbl.cols.forEach(function(c){ colMap[c.toLowerCase()] = c; });
  var outCols;
  if (star) outCols = tbl.cols.slice();
  else if (count) outCols = ['count'];
  else outCols = items.map(function(c){ var k = colMap[c.toLowerCase()]; if (!k) throw colErr(c); return k; });
  var where = null;
  if (eatKw('WHERE')) where = parseOr();
  var order = [];
  if (eatKw('ORDER')){
    if (!eatKw('BY')) throw new SqlError('Write ORDER BY, then a label.');
    do {
      var ot2 = T[p]; if (!ot2 || ot2.t !== 'id') throw new SqlError('ORDER BY needs a label, like: ORDER BY name');
      var oc = colMap[ot2.v.toLowerCase()]; if (!oc) throw colErr(ot2.v);
      p++; var desc = false; if (eatKw('DESC')) desc = true; else eatKw('ASC');
      order.push({ c: oc, d: desc });
    } while (eatOp(','));
  }
  var limit = null;
  if (eatKw('LIMIT')){ var lt = T[p]; if (!lt || lt.t !== 'num') throw new SqlError('LIMIT needs a number, like: LIMIT 3'); limit = lt.v; p++; }
  eatOp(';');
  if (p < T.length) throw new SqlError('Pico got confused near ‘' + T[p].v + '’. Check spelling and order: SELECT … FROM … WHERE … ORDER BY … LIMIT …');
  var rows = tbl.rows.filter(function(r){ return !where || where(r); });
  if (order.length) rows = rows.slice().sort(function(a, b){
    for (var i = 0; i < order.length; i++){ var c = cmpv(a[order[i].c], b[order[i].c]); if (c) return order[i].d ? -c : c; }
    return 0;
  });
  var res;
  if (count) res = [[rows.length]];
  else {
    res = rows.map(function(r){ return outCols.map(function(c){ return r[c]; }); });
    if (distinct){ var seen = {}; res = res.filter(function(r){ var k = JSON.stringify(r); if (seen[k]) return false; seen[k] = 1; return true; }); }
    if (limit !== null) res = res.slice(0, limit);
  }
  return { cols: outCols, rows: res, scanned: tbl.rows.length, table: tname };
}

SK.runSql = runSql;
})();
