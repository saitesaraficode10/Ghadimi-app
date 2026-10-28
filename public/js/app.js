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

  // Chatbot — smarter guide for Ghadimi Amlak
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

  function addQuick(labels) {
    if (!botMsgs) return;
    var wrap = document.createElement('div');
    wrap.className = 'chat-quick';
    labels.forEach(function (lab) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-chip';
      b.textContent = lab;
      b.addEventListener('click', function () {
        addMsg(lab, 'user');
        setTimeout(function () { respond(lab); }, 280);
      });
      wrap.appendChild(b);
    });
    botMsgs.appendChild(wrap);
    botMsgs.scrollTop = botMsgs.scrollHeight;
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[\u064B-\u065F]/g, '')
      .trim();
  }

  var INTENTS = [
    {
      keys: ['فیلتر', 'filter', 'جستجو', 'پیدا کردن', 'چطور پیدا', 'شهر'],
      a: 'راهنمای فیلتر ملک:\n۱) شهر را از لیست انتخاب کنید (ایروان، گیومری، وانادزور، ...).\n۲) دسته: خانه یا مغازه.\n۳) نوع اجاره: روزانه / ۱–۳ ماه / ۶–۱۲ ماه / سالیانه.\n۴) اتاق و قیمت از–تا را در صورت نیاز پر کنید.\n۵) وضعیت را «همه» بگذارید اگر ملک نمی‌بینید.\n۶) دکمه فیلتر را بزنید. اگر خالی بود فیلترها را پاک کنید و فقط شهر را بزنید.'
    },

    {
      keys: ['سلام', 'hello', 'hi', 'درود', 'بفرمایید', 'مرحبا', 'բարև'],
      a: 'سلام 👋 به املاک قدیمی خوش آمدید.\nمی‌توانم درباره ثبت‌نام، ورود، جستجوی خانه، درخواست بازدید، رزرو و تماس با پشتیبانی راهنمایی کنم.\nچه کاری دارید؟'
    },
    {
      keys: ['ثبت نام', 'ثبت‌نام', 'عضویت', 'register', 'signup', 'اکانت بسازم'],
      a: 'برای ثبت‌نام:\n۱) از منو «ثبت‌نام» را بزنید\n۲) نام کامل + یک نام کاربری انگلیسی (مثلاً aram2024)\n۳) شماره تماس با پیش‌شماره کشور + واتساپ\n۴) رمز (حداقل ۶ کاراکتر)\nبعد از ثبت‌نام با همان نام کاربری یا شماره وارد شوید.'
    },
    {
      keys: ['ورود', 'لاگین', 'login', 'sign in', 'رمز', 'فراموشی', 'نام کاربری'],
      a: 'ورود به حساب:\n• نام کاربری + رمز\n• یا شماره تماس (با پیش‌شماره، مثل +374...) + رمز\nاگر رمز را یادتان نیست، از صفحه «تماس» به پشتیبانی واتساپ پیام دهید تا راهنمایی‌تان کنند.'
    },
    {
      keys: ['بازدید', 'ویزیت', 'tour', 'visit', 'بیایم ببینم', 'وقت بازدید', 'زمان بازدید'],
      a: 'درخواست بازدید:\n۱) وارد حساب شوید\n۲) صفحه ملک را باز کنید\n۳) «درخواست بازدید» را پر کنید (از چه تاریخی نیاز دارید، مدت اجاره، تعداد نفرات)\n۴) تیم ما درخواست را بررسی می‌کند و تاریخ/ساعت/آدرس حضور را اعلام می‌کند.\nوضعیت را از «درخواست‌های من» ببینید.'
    },
    {
      keys: ['رزرو', 'book', 'booking', 'اجاره کنم', 'پیش پرداخت', 'پیش‌پرداخت', 'کارت'],
      a: 'رزرو ملک:\nاز صفحه ملک گزینه رزرو (روزانه/ماهانه/سالانه) را بزنید.\nاگر پرداخت آنلاین فعال باشد، کارت‌های اعلام‌شده (ایران / ارمنستان / Visa) در همان مسیر نشان داده می‌شود.\nبعد از واریز، وضعیت رزرو در «رزروهای من» قابل پیگیری است.'
    },
    {
      keys: ['قیمت', 'اجاره', 'چند', 'هزینه', 'price', 'rent', 'ماهانه', 'دلار', 'درام'],
      a: 'قیمت هر آگهی روی کارت ملک و صفحه جزئیات نوشته شده (معمولاً ماهانه و واحد پول).\nفیلتر شهر/اتاق/بودجه را در صفحه اصلی امتحان کنید. برای ملک خاص، کد یا عنوانش را بگویید تا مسیر بازدید را بگویم.'
    },
    {
      keys: ['عکس', 'تصویر', 'گالری', 'photo', 'image'],
      a: 'در صفحه هر ملک گالری عکس هست؛ روی عکس‌ها بزنید تا بزرگ‌تر ببینید. اگر عکسی لود نشد، اینترنت را چک کنید یا بعداً دوباره باز کنید.'
    },
    {
      keys: ['علاقه', 'مورد علاقه', 'favorites', 'ذخیره', 'قلب'],
      a: 'با ورود به حساب می‌توانید ملک را به «علاقه‌مندی‌ها» اضافه کنید و بعداً از منوی «علاقه‌مندی‌ها» ببینید.'
    },
    {
      keys: ['تماس', 'پشتیبانی', 'واتساپ', 'whatsapp', 'شماره', 'qr', 'کیو آر', 'contact', 'پشتیبان'],
      a: 'صفحه «تماس» را باز کنید — دو شماره پشتیبانی با QR جداگانه دارید.\nQR را اسکن کنید تا واتساپ باز شود، یا روی دکمه چت بزنید.\nلطفاً نام کاربری یا شماره ثبت‌نام را هم در پیام بنویسید.'
    },
    {
      keys: ['آدرس', 'کجا', 'لوکیشن', 'نقشه', 'ایروان', 'yerevan', 'address', 'map'],
      a: 'آدرس و موقعیت هر ملک در صفحه همان آگهی است (متن آدرس و در صورت وجود لینک نقشه).\nدفتر/پشتیبانی را از صفحه تماس ببینید.'
    },
    {
      keys: ['زبان', 'english', 'روسی', 'ارمنی', 'فارسی', 'language'],
      a: 'از گوشه منو می‌توانید زبان را عوض کنید: FA / EN / RU / HY.'
    },
    {
      keys: ['پروفایل', 'ویرایش', 'شماره عوض', 'profile', 'تغییر واتساپ'],
      a: 'بعد از ورود، «پروفایل من» را باز کنید تا مشخصات و شماره‌ها را در صورت فعال بودن ویرایش ببینید. اگر گزینه‌ای نبود، از پشتیبانی بخواهید.'
    },
    {
      keys: ['کد مشتری', 'کد پیگیری', 'کد من'],
      a: 'بعد از ثبت‌نام یک کد پیگیری نمایش داده می‌شود و در پروفایل هم هست. برای پیگیری با پشتیبانی همان کد یا نام کاربری را بفرستید.'
    },
    {
      keys: ['مشکل', 'ارور', 'کار نمیکنه', 'باز نمیشه', 'باگ', 'error', 'نمیشه'],
      a: 'لطفاً صفحه را یک‌بار رفرش کنید و با همان مرورگر دوباره وارد شوید.\nاگر باز هم مشکل بود: چه صفحه‌ای + چه دکمه‌ای + متن خطا را از «تماس» برای پشتیبانی بفرستید.'
    },
    {
      keys: ['ساعت کار', 'کی جواب', 'آنلاین', 'پاسخ'],
      a: 'دستیار خودکار ۲۴ ساعته است. پاسخ انسانی پشتیبانی معمولاً در ساعات کاری و از طریق واتساپ صفحه تماس انجام می‌شود.'
    },
    {
      keys: ['ممنون', 'مرسی', 'تشکر', 'thanks'],
      a: 'خواهش می‌کنم 🌿 اگر سؤال دیگری دارید بپرسید.'
    }
  ];

  var BOT_LANG = (document.documentElement.lang || 'fa').slice(0, 2);
  var BOT_I18N = {
    fa: {
      hi: 'سلام! من دستیار هوشمند املاک قدیمی هستم 🏠 از ثبت‌نام تا بازدید و رزرو راهنمایی می‌کنم.',
      fallback: 'جزئیات کافی نبود. بپرسید: ثبت‌نام، ورود، بازدید، رزرو، قیمت، تماس.',
      chips: ['ثبت‌نام', 'ورود', 'درخواست بازدید', 'رزرو ملک', 'تماس']
    },
    en: {
      hi: 'Hi! I am Ghadimi assistant 🏠 I can help with signup, visit requests and booking.',
      fallback: 'Need more detail. Ask about: signup, login, visit, booking, price, contact.',
      chips: ['Sign up', 'Login', 'Visit request', 'Booking', 'Contact']
    },
    ru: {
      hi: 'Здравствуйте! Я помощник Ghadimi 🏠 Помогу с регистрацией, визитом и бронью.',
      fallback: 'Нужно больше деталей. Спросите: регистрация, вход, визит, бронь, цена, контакт.',
      chips: ['Регистрация', 'Вход', 'Визит', 'Бронь', 'Контакт']
    },
    hy: {
      hi: 'Բարև։ Ես Ghadimi օգնականն եմ 🏠 Կօգնեմ գրանցման, այցի և ամրագրման հարցերում։',
      fallback: 'Ավելի շատ մանրամասներ են պետք։ Հարցրեք՝ գրանցում, մուտք, այց, ամրագրում, գին, կապ։',
      chips: ['Գրանցում', 'Մուտք', 'Այց', 'Ամրագրում', 'Կապ']
    }
  };
  function botT(key) {
    var pack = BOT_I18N[BOT_LANG] || BOT_I18N.fa;
    return pack[key] || BOT_I18N.fa[key] || key;
  }

  function respond(raw) {
    var q = norm(raw);
    if (!q) return;
    var best = null, score = 0;
    INTENTS.forEach(function (it) {
      var s = 0;
      it.keys.forEach(function (k) {
        if (q.indexOf(norm(k)) !== -1) s += (norm(k).length > 3 ? 2 : 1);
      });
      if (s > score) { score = s; best = it; }
    });
    if (best && score > 0) {
      addMsg(best.a, 'bot');
      return;
    }
    addMsg(botT('fallback'), 'bot');
    addQuick(botT('chips'));
  }

  if (botBtn && botBox) {
    botBtn.addEventListener('click', function () {
      botBox.classList.toggle('open');
      if (botBox.classList.contains('open') && botMsgs && !botMsgs.dataset.ready) {
        botMsgs.dataset.ready = '1';
        addMsg(botT('hi'), 'bot');
        addQuick(botT('chips'));
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
      setTimeout(function () { respond(v); }, 350);
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
