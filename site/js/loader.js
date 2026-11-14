/* Loads each released day (and its narration clips, if the day has them), then the app. Works from file:// and any static host. */
(function(){
  'use strict';
  var steps = [];
  function loadScript(src, ok, fail){ var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); }
  (window.SK.RELEASED || []).forEach(function(n){
    var p = (n < 10 ? '0' : '') + n;
    steps.push(function(done){
      loadScript('days/day' + p + '/day' + p + '.js', function(){
        var d = window.SK.DAYS[n];
        if (d && d.voice) loadScript('days/day' + p + '/audio/audio.js', done, done);   /* narration is optional: a missing clip list just means no voice */
        else done();
      }, function(){ console.error('Could not load days/day' + p + '/day' + p + '.js'); done(); });
    });
  });
  steps.push(function(){ loadScript('js/app.js', function(){}, function(){}); });
  (function next(i){ if (i < steps.length) steps[i](function(){ next(i + 1); }); })(0);
})();
