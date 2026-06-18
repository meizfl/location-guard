// faq-new.js — accordion + hash navigation (MV3 CSP-safe, no inline scripts)
(function() {
  'use strict';

  document.querySelectorAll('.faq-q').forEach(function(q) {
    q.addEventListener('click', function() {
      var item = q.parentElement;
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function(i) {
        i.classList.remove('open');
      });
      if (!wasOpen) item.classList.add('open');
    });
  });

  function openFromHash() {
    var hash = location.hash.replace('#', '');
    if (!hash) return;
    var el = document.getElementById('faq-' + hash) || document.getElementById(hash);
    if (el && el.classList.contains('faq-item')) {
      document.querySelectorAll('.faq-item.open').forEach(function(i) {
        i.classList.remove('open');
      });
      el.classList.add('open');
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}());
