(function () {
  var btn = document.getElementById('btnPrintReq');
  if (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      window.print();
    });
  }
})();
