document.addEventListener('DOMContentLoaded', function () {
  var main = document.getElementById('mainPhoto');
  if (!main) return;
  document.querySelectorAll('[data-gallery-thumb]').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      var src = thumb.getAttribute('data-gallery-thumb');
      if (src) main.src = src;
      document.querySelectorAll('[data-gallery-thumb]').forEach(function (t) {
        t.style.outline = 'none';
        t.style.opacity = '0.75';
      });
      thumb.style.outline = '2px solid #34d399';
      thumb.style.opacity = '1';
    });
  });
});
