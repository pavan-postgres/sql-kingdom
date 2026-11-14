/* The playroom database used by the practice sandbox (Days 1-10). */
(function(){
'use strict';
var SK = window.SK;
SK.DB = {
  toys:  { cols: ['id', 'name', 'color', 'size'], rows: [
    { id: 1, name: 'Teddy',   color: 'brown',  size: 'big' },
    { id: 2, name: 'Red Car', color: 'red',    size: 'small' },
    { id: 3, name: 'Duck',    color: 'yellow', size: 'small' },
    { id: 4, name: 'Blocks',  color: 'blue',   size: 'medium' },
    { id: 5, name: 'Dino',    color: 'green',  size: 'big' },
    { id: 6, name: 'Ball',    color: 'red',    size: 'medium' } ] },
  kids:  { cols: ['id', 'name', 'age'], rows: [
    { id: 1, name: 'Mia', age: 6 }, { id: 2, name: 'Sam', age: 5 }, { id: 3, name: 'Zoya', age: 7 } ] },
  books: { cols: ['id', 'title', 'pages'], rows: [
    { id: 1, title: 'Sleepy Moon', pages: 24 }, { id: 2, title: 'Big Red Truck', pages: 18 }, { id: 3, title: 'Ocean Friends', pages: 30 } ] }
};
})();
