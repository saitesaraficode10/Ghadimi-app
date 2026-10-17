(function () {
  var sel = document.getElementById('payMethod');
  var box = document.getElementById('cardPick');
  if (!sel || !box) return;
  function sync() {
    if (sel.value === 'online') {
      box.style.display = 'flex';
      box.style.flexDirection = 'column';
    } else {
      box.style.display = 'none';
    }
  }
  sel.addEventListener('change', sync);
  sync();
})();
