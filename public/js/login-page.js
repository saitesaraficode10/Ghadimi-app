(function () {
  var u = document.getElementById('modeUser');
  var p = document.getElementById('modePhone');
  var bu = document.getElementById('boxUser');
  var bp = document.getElementById('boxPhone');
  var lid = document.getElementById('loginId');
  var pl = document.getElementById('phoneLocal');
  var mode = document.getElementById('loginMode');
  if (!u || !p || !bu || !bp) return;

  function setActive(btn) {
    document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
  }
  function userMode() {
    bu.style.display = 'block';
    bp.style.display = 'none';
    if (pl) { pl.value = ''; pl.removeAttribute('required'); }
    if (lid) {
      lid.removeAttribute('disabled');
      lid.setAttribute('required', 'required');
      lid.focus();
    }
    if (mode) mode.value = 'user';
    setActive(u);
  }
  function phoneMode() {
    bu.style.display = 'none';
    bp.style.display = 'block';
    if (lid) {
      lid.value = '';
      lid.removeAttribute('required');
      lid.setAttribute('disabled', 'disabled');
    }
    if (pl) {
      pl.setAttribute('required', 'required');
      pl.focus();
    }
    if (mode) mode.value = 'phone';
    setActive(p);
  }
  u.addEventListener('click', function (e) { e.preventDefault(); userMode(); });
  p.addEventListener('click', function (e) { e.preventDefault(); phoneMode(); });
  userMode();
})();
