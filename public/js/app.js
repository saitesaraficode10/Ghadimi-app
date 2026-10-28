(function () {
  // Show/hide password (works for admin + user)
  function bindPwEyes() {
    document.querySelectorAll('[data-toggle-pw]').forEach(function (btn) {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute('data-toggle-pw');
        var inp = document.getElementById(id);
        if (!inp) return;
        if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
        else { inp.type = 'password'; btn.textContent = '👁'; }
      });
    });
  }
  bindPwEyes();
  document.addEventListener('DOMContentLoaded', bindPwEyes);
  setTimeout(bindPwEyes, 300);

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

  // Chatbot — multi-language (fa/en/ru/hy)
  var botBtn = document.getElementById('chatBotBtn');
  var botBox = document.getElementById('chatBotBox');
  var botClose = document.getElementById('chatBotClose');
  var botForm = document.getElementById('chatBotForm');
  var botInput = document.getElementById('chatBotInput');
  var botMsgs = document.getElementById('chatBotMsgs');
  var BOT_LANG = (document.documentElement.lang || 'fa').slice(0, 2);
  if (['fa','en','ru','hy'].indexOf(BOT_LANG) === -1) BOT_LANG = 'fa';

  var BOT = {
    fa: {
      hi: 'سلام! من دستیار املاک قدیمی هستم. درباره ثبت‌نام، بازدید، رزرو، قیمت و تماس بپرسید.',
      chips: ['ثبت‌نام', 'بازدید', 'رزرو', 'تماس'],
      fallback: 'متوجه نشدم. بپرسید: ثبت‌نام، ورود، بازدید، رزرو، قیمت، تماس.',
      answers: [
        { k: ['ثبت','عضویت','register','signup'], a: 'از منو «ثبت‌نام» را بزنید. نام، نام کاربری، تلفن، واتساپ و رمز (حداقل ۸ کاراکتر) را وارد کنید.' },
        { k: ['ورود','login'], a: 'از «ورود» با نام کاربری یا شماره تلفن و رمز وارد شوید.' },
        { k: ['بازدید','ویزیت','visit'], a: 'ملک را باز کنید → درخواست بازدید → تاریخ و تعداد نفرات را بفرستید. ادمین زمان را اعلام می‌کند.' },
        { k: ['رزرو','book'], a: 'در صفحه ملک «رزرو» را بزنید، نوع اجاره و پرداخت را انتخاب کنید. اگر کارت‌به‌کارت است، کارت را ببینید و رسید را به واتساپ پشتیبانی بفرستید.' },
        { k: ['قیمت','اجاره','price'], a: 'قیمت هر آگهی روی کارت ملک نوشته شده. با فیلتر قیمت می‌توانید محدود کنید.' },
        { k: ['تماس','واتساپ','contact','support'], a: 'از منو «تماس» شماره و QR واتساپ پشتیبانی را ببینید.' },
        { k: ['فیلتر','filter','جستجو'], a: 'در صفحه اصلی دسته خانه/مغازه را انتخاب کنید و شهر، قیمت و اتاق را فیلتر کنید.' }
      ]
    },
    en: {
      hi: 'Hi! I am the Ghadimi property assistant. Ask about signup, visits, booking, price or contact.',
      chips: ['Sign up', 'Visit', 'Booking', 'Contact'],
      fallback: 'I did not get that. Try: signup, login, visit, booking, price, contact.',
      answers: [
        { k: ['sign','register','signup','عضویت'], a: 'Open Register. Enter full name, username, phone, WhatsApp and a password (min 8 chars).' },
        { k: ['login','ورود'], a: 'Use Login with username or phone and your password.' },
        { k: ['visit','tour','بازدید'], a: 'Open a property → Request visit → send date and number of people. Admin will set the visit time.' },
        { k: ['book','reserv','رزرو'], a: 'On the property page tap Book, choose rent type and payment. For card transfer, send the receipt to support WhatsApp with your booking code.' },
        { k: ['price','rent','قیمت'], a: 'Each listing shows the price. Use the price filter on the home page.' },
        { k: ['contact','whatsapp','support','تماس'], a: 'Open Contact for support phone numbers and WhatsApp QR codes.' },
        { k: ['filter','search','فیلتر'], a: 'On the home page pick House or Shop, then filter by city, price and rooms.' }
      ]
    },
    ru: {
      hi: 'Здравствуйте! Я помощник Ghadimi. Спросите про регистрацию, визит, бронь, цену или контакт.',
      chips: ['Регистрация', 'Визит', 'Бронь', 'Контакт'],
      fallback: 'Не понял. Спросите: регистрация, вход, визит, бронь, цена, контакт.',
      answers: [
        { k: ['регистр','sign','register'], a: 'Откройте «Регистрация». Укажите имя, логин, телефон, WhatsApp и пароль (мин. 8 символов).' },
        { k: ['вход','login'], a: 'Войдите через «Вход» с логином или телефоном и паролем.' },
        { k: ['визит','visit','базд'], a: 'Откройте объект → запрос визита → укажите дату и число людей. Админ назначит время.' },
        { k: ['брон','book','reserv'], a: 'На странице объекта нажмите «Бронь», выберите тип и оплату. При переводе отправьте чек в WhatsApp поддержки с кодом брони.' },
        { k: ['цен','price','аренд'], a: 'Цена указана на карточке. Используйте фильтр цены на главной.' },
        { k: ['контакт','whatsapp','support'], a: 'В разделе «Контакт» есть телефоны и QR WhatsApp.' },
        { k: ['фильтр','filter','поиск'], a: 'На главной выберите Дом или Магазин и фильтруйте по городу, цене и комнатам.' }
      ]
    },
    hy: {
      hi: 'Բարև։ Ես Ghadimi օգնականն եմ։ Հարցրեք գրանցման, այցի, ամրագրման, գնի կամ կապի մասին։',
      chips: ['Գրանցում', 'Այց', 'Ամրագրում', 'Կապ'],
      fallback: 'Չհասկացա։ Հարցրեք՝ գրանցում, մուտք, այց, ամրագրում, գին, կապ։',
      answers: [
        { k: ['գրանց','sign','register'], a: 'Բացեք «Գրանցում»։ Լրացրեք անուն, օգտանուն, հեռախոս, WhatsApp և գաղտնաբառ (առնվազն 8 նիշ)։' },
        { k: ['մուտք','login'], a: 'Մուտք գործեք օգտանունով կամ հեռախոսով և գաղտնաբառով։' },
        { k: ['այց','visit'], a: 'Բացեք գույքը → հայց այցի → ուղարկեք ամսաթիվը և մարդկանց թիվը։ Ադմինը կսահմանի ժամը։' },
        { k: ['ամրագ','book','reserv'], a: 'Գույքի էջում սեղմեք ամրագրում, ընտրեք տեսակը և վճարումը։ Քարտից քարտի դեպքում անդորրագիրը ուղարկեք WhatsApp աջակցությանը՝ կոդով։' },
        { k: ['գին','price'], a: 'Գինը նշված է քարտի վրա։ Օգտագործեք գնի ֆիլտրը գլխավոր էջում։' },
        { k: ['կապ','whatsapp','contact'], a: '«Կապ» բաժնում կան հեռախոսներ և WhatsApp QR։' },
        { k: ['ֆիլտր','filter'], a: 'Գլխավոր էջում ընտրեք Տուն կամ Խանութ և ֆիլտրեք ըստ քաղաքի, գնի և սենյակների։' }
      ]
    }
  };

  function addMsg(text, who) {
    if (!botMsgs) return;
    var d = document.createElement('div');
    d.className = 'chat-msg ' + (who || 'bot');
    d.textContent = text;
    botMsgs.appendChild(d);
    botMsgs.scrollTop = botMsgs.scrollHeight;
  }
  function addQuick(labels) {
    if (!botMsgs) return;
    var wrap = document.createElement('div');
    wrap.className = 'chat-quick';
    (labels || []).forEach(function (lab) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-chip';
      b.textContent = lab;
      b.addEventListener('click', function () {
        addMsg(lab, 'user');
        setTimeout(function () { respond(lab); }, 200);
      });
      wrap.appendChild(b);
    });
    botMsgs.appendChild(wrap);
    botMsgs.scrollTop = botMsgs.scrollHeight;
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
  }
  function respond(raw) {
    var pack = BOT[BOT_LANG] || BOT.fa;
    var q = norm(raw);
    if (!q) return;
    var best = null, score = 0;
    (pack.answers || []).forEach(function (it) {
      var s = 0;
      (it.k || []).forEach(function (k) {
        if (q.indexOf(norm(k)) !== -1) s += 1;
      });
      if (s > score) { score = s; best = it; }
    });
    if (best && score > 0) addMsg(best.a, 'bot');
    else {
      addMsg(pack.fallback, 'bot');
      addQuick(pack.chips);
    }
  }
  if (botBtn && botBox) {
    botBtn.addEventListener('click', function () {
      botBox.classList.toggle('open');
      if (botBox.classList.contains('open') && botMsgs && !botMsgs.dataset.ready) {
        botMsgs.dataset.ready = '1';
        var pack = BOT[BOT_LANG] || BOT.fa;
        addMsg(pack.hi, 'bot');
        addQuick(pack.chips);
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
      setTimeout(function () { respond(v); }, 250);
    });
  }

  // Live notification badges (no full page refresh)
  function refreshBadges() {
    fetch('/api/notifications/unread', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        document.querySelectorAll('.badge-count[data-role="user"]').forEach(function (el) {
          var n = d.user || 0;
          el.style.display = n > 0 ? 'inline-flex' : 'none';
          el.textContent = n > 99 ? '99+' : String(n);
        });
        document.querySelectorAll('.badge-count[data-role="admin"]').forEach(function (el) {
          var n = d.admin || 0;
          el.style.display = n > 0 ? 'inline-flex' : 'none';
          el.textContent = n > 99 ? '99+' : String(n);
        });
      }).catch(function () {});
  }
  try {
    refreshBadges();
    setInterval(refreshBadges, 12000);
  } catch (e) {}

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
