(function () {
  // Minimal Gregorian -> Jalali
  function gregorianToJalali(gy, gm, gd) {
    var g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
    var jy, jm, jd, gy2, days;
    if (gy > 1600) { jy = 979; gy -= 1600; } else { jy = 0; gy -= 621; }
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
    else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
    return [jy, jm, jd];
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function attach() {
    document.querySelectorAll('input[type="date"], input[type="datetime-local"]').forEach(function (inp) {
      if (inp.dataset.jalaliBound) return;
      inp.dataset.jalaliBound = '1';
      var hint = document.createElement('div');
      hint.className = 'jalali-hint';
      inp.parentNode.insertBefore(hint, inp.nextSibling);
      function upd() {
        var v = inp.value;
        if (!v) { hint.textContent = ''; return; }
        var part = v.split('T')[0].split('-');
        if (part.length < 3) return;
        var j = gregorianToJalali(+part[0], +part[1], +part[2]);
        hint.textContent = 'شمسی / Jalali: ' + j[0] + '/' + pad(j[1]) + '/' + pad(j[2]);
      }
      inp.addEventListener('change', upd);
      inp.addEventListener('input', upd);
      upd();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
