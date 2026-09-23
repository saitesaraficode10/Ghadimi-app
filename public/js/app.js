(function () {
  // Theme
  var THEMES = {
    emerald: { accent: '#10b981', accent2: '#34d399', bg: '#0b1220' },
    ocean: { accent: '#0ea5e9', accent2: '#38bdf8', bg: '#0a1628' },
    violet: { accent: '#8b5cf6', accent2: '#a78bfa', bg: '#120b1f' },
    rose: { accent: '#f43f5e', accent2: '#fb7185', bg: '#1a0b12' },
    gold: { accent: '#f59e0b', accent2: '#fbbf24', bg: '#14100a' },
    midnight: { accent: '#64748b', accent2: '#94a3b8', bg: '#020617' }
  };
  function applyTheme(name) {
    var t = THEMES[name] || THEMES.emerald;
    var r = document.documentElement;
    r.style.setProperty('--accent', t.accent);
    r.style.setProperty('--accent2', t.accent2);
    r.style.setProperty('--bg', t.bg);
    try { localStorage.setItem('ghadimi_theme', name); } catch (e) {}
  }
  var saved = null;
  try { saved = localStorage.getItem('ghadimi_theme'); } catch (e) {}
  applyTheme(saved || 'emerald');
  document.querySelectorAll('[data-theme]').forEach(function (btn) {
    btn.addEventListener('click', function () { applyTheme(btn.getAttribute('data-theme')); });
  });

  // Country selects
  function fillCountrySelects() {
    if (!window.COUNTRY_CODES) return;
    document.querySelectorAll('select[data-country-code]').forEach(function (sel) {
      if (sel.options.length > 1) return;
      var prefer = sel.getAttribute('data-prefer') || '+374';
      window.COUNTRY_CODES.forEach(function (x) {
        var opt = document.createElement('option');
        opt.value = x.d;
        opt.textContent = x.n + ' (' + x.d + ')';
        if (x.d === prefer) opt.selected = true;
        sel.appendChild(opt);
      });
    });
  }
  fillCountrySelects();

  // Chatbot
  var botBtn = document.getElementById('chatBotBtn');
  var botBox = document.getElementById('chatBotBox');
  var botClose = document.getElementById('chatBotClose');
  var botForm = document.getElementById('chatBotForm');
  var botInput = document.getElementById('chatBotInput');
  var botMsgs = document.getElementById('chatBotMsgs');
  function addMsg(text, who) {
    if (!botMsgs) return;
    var d = document.createElement('div');
    d.className = 'chat-msg ' + (who || 'bot');
    d.textContent = text;
    botMsgs.appendChild(d);
    botMsgs.scrollTop = botMsgs.scrollHeight;
  }
  function reply(q) {
    q = (q || '').toLowerCase();
    if (/سلام|hello|hi|Բարև/.test(q)) return 'سلام 👋 به قدیمی خوش آمدید. چطور می‌توانم کمکتان کنم؟';
    if (/قیمت|اجاره|price|rent/.test(q)) return 'قیمت هر ملک در صفحه همان آگهی نوشته شده. برای بازدید از دکمه «درخواست بازدید» استفاده کنید.';
    if (/بازدید|visit|tour/.test(q)) return 'درخواست بازدید را از صفحه ملک ثبت کنید. تیم ما پس از بررسی، زمان و محل را اعلام می‌کند.';
    if (/ثبت.?نام|register|login|ورود/.test(q)) return 'از منوی بالا ثبت‌نام یا ورود را بزنید. کد مشتری به‌صورت خودکار داده می‌شود.';
    if (/واتساپ|whatsapp|تماس|contact|پشتیبانی/.test(q)) return 'از صفحه «تماس» می‌توانید واتساپ و QR را ببینید. پیام شما ثبت شد؛ لطفاً منتظر تماس همکاران ما بمانید.';
    if (/آدرس|address|ایروان|yerevan/.test(q)) return 'ملک‌ها عمدتاً در ایروان و اطراف هستند. آدرس دقیق هر آگهی در همان صفحه آمده است.';
    return 'پیام شما دریافت شد. لطفاً چند لحظه صبر کنید تا همکاران پشتیبانی با شما ارتباط بگیرند.از صفحه تماس هم می‌توانید واتساپ ما را بزنید.';
  }
  if (botBtn && botBox) {
    botBtn.addEventListener('click', function () {
      botBox.classList.toggle('open');
      if (botBox.classList.contains('open') && botMsgs && !botMsgs.dataset.ready) {
        botMsgs.dataset.ready = '1';
        addMsg('سلام! من دستیار آنلاین قدیمی هستم. سؤال کوتاه بپرسید یا منتظر پشتیبانی انسانی بمانید.', 'bot');
      }
    });
  }
  if (botClose && botBox) botClose.addEventListener('click', function () { botBox.classList.remove('open'); });
  if (botForm && botInput) {
    botForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = botInput.value.trim();
      if (!v) return;
      addMsg(v, 'user');
      botInput.value = '';
      setTimeout(function () { addMsg(reply(v), 'bot'); }, 450);
    });
  }

  // Presence heartbeat
  try {
    if (document.body.dataset.loggedIn === '1') {
      fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }).catch(function(){});
      setInterval(function () {
        fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }).catch(function(){});
      }, 60000);
    }
  } catch (e) {}
})();
