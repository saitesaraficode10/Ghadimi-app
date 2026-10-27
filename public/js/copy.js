(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    e.preventDefault();
    var text = btn.getAttribute('data-copy') || '';
    if (!text) return;
    function ok() {
      var old = btn.textContent;
      btn.textContent = btn.getAttribute('data-copied-label') || 'OK';
      setTimeout(function () { btn.textContent = old; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {
        fallback();
      });
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });
})();
