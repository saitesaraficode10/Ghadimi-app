document.addEventListener('DOMContentLoaded', function () {
  var main = document.getElementById('mainPhoto');
  if (!main) return;

  // lightbox root
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = '<button type="button" class="lightbox-close" aria-label="close">×</button><img alt="">';
  document.body.appendChild(lb);
  var lbImg = lb.querySelector('img');
  var lbClose = lb.querySelector('.lightbox-close');
  function openLb(src) {
    lbImg.src = src;
    lb.classList.add('open');
  }
  function closeLb() { lb.classList.remove('open'); }
  lbClose.addEventListener('click', closeLb);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });

  main.style.cursor = 'zoom-in';
  main.addEventListener('click', function () { openLb(main.src); });

  document.querySelectorAll('[data-gallery-thumb]').forEach(function (thumb) {
    thumb.style.cursor = 'pointer';
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
    thumb.addEventListener('dblclick', function () {
      var src = thumb.getAttribute('data-gallery-thumb');
      if (src) openLb(src);
    });
  });
});
