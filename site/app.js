/* BOOX Daily Desk — 画面制御（古いAndroid WebViewでも動くようES5で記述） */
(function () {
  'use strict';
  var L = window.BoardLogic;
  var WX_MS = 30 * 60000;
  var WX_STALE = 75 * 60000, NAV_RESET = 5 * 60000;
  var PLACES = [
    { id: 'tokyo', name: '東京', lat: 35.6812, lon: 139.7671 },
    { id: 'yokohama', name: '横浜', lat: 35.4437, lon: 139.6380 },
    { id: 'saitama', name: 'さいたま', lat: 35.8617, lon: 139.6455 },
    { id: 'chiba', name: '千葉', lat: 35.6074, lon: 140.1065 },
    { id: 'osaka', name: '大阪', lat: 34.6937, lon: 135.5023 },
    { id: 'nagoya', name: '名古屋', lat: 35.1815, lon: 136.9066 },
    { id: 'sapporo', name: '札幌', lat: 43.0618, lon: 141.3545 },
    { id: 'sendai', name: '仙台', lat: 38.2682, lon: 140.8694 },
    { id: 'fukuoka', name: '福岡', lat: 33.5904, lon: 130.4017 },
    { id: 'naha', name: '那覇', lat: 26.2124, lon: 127.6809 },
    { id: 'custom', name: '緯度・経度を指定' }
  ];

  /* ---------- 保存 ---------- */
  function load(k) { try { return JSON.parse(localStorage.getItem('bdd.' + k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem('bdd.' + k, JSON.stringify(v)); } catch (e) {} }

  var st = {
    settings: Object.assign({ place: 'tokyo', lat: 35.6812, lon: 139.7671, ghost: 1 }, load('settings') || {}),
    wx: load('wx'), wxErr: null, wxTry: 0, wxBusy: false,
    hol: load('hol'), holErr: null, holTry: 0,
    news: load('news'), newsErr: null, newsTry: 0,
    offset: 0, lastNav: 0, today: null, lastGhost: null
  };

  /* ---------- 描画ヘルパー：内容が変わった部分だけ書き換え（E Inkの無駄な再描画を防ぐ） ---------- */
  function $(id) { return document.getElementById(id); }
  function setHTML(el, html) { if (el.__h !== html) { el.innerHTML = html; el.__h = html; } }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setClass(el, cls, on) {
    var has = (' ' + el.className + ' ').indexOf(' ' + cls + ' ') >= 0;
    if (on && !has) el.className = (el.className + ' ' + cls).trim();
    if (!on && has) el.className = (' ' + el.className + ' ').replace(' ' + cls + ' ', ' ').trim();
  }

  var ICONS = {
    sun: '<circle cx="32" cy="32" r="11"/><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.7 5.7M44.7 44.7l5.7 5.7M13.6 50.4l5.7-5.7M44.7 19.3l5.7-5.7"/>',
    cloud: '<path d="M18 48h28a10 10 0 0 0 0-20 14 14 0 0 0-27-3A11.5 11.5 0 0 0 18 48z"/>',
    partly: '<circle cx="22" cy="22" r="8"/><path d="M22 5v5M5 22h5M10 10l3.5 3.5M34 10l-3.5 3.5"/><path d="M22 52h26a9 9 0 0 0 0-18 13 13 0 0 0-24.5-3A10.5 10.5 0 0 0 22 52z" fill="#fff"/>',
    rain: '<path d="M18 38h28a9 9 0 0 0 0-18 13 13 0 0 0-25-3A10.5 10.5 0 0 0 18 38z"/><path d="M22 45l-3 9M33 45l-3 9M44 45l-3 9"/>',
    snow: '<path d="M18 38h28a9 9 0 0 0 0-18 13 13 0 0 0-25-3A10.5 10.5 0 0 0 18 38z"/><circle cx="21" cy="48" r="2.4" fill="#000"/><circle cx="32" cy="54" r="2.4" fill="#000"/><circle cx="43" cy="48" r="2.4" fill="#000"/>',
    thunder: '<path d="M18 38h28a9 9 0 0 0 0-18 13 13 0 0 0-25-3A10.5 10.5 0 0 0 18 38z"/><path d="M34 40l-7 10h8l-5 10" />',
    fog: '<path d="M10 24h44M14 34h36M10 44h44"/>',
    moon: '<path d="M40 10a22 22 0 1 0 14 30A18 18 0 0 1 40 10z"/>'
  };
  function icon(name, inverted) {
    var c = inverted ? '#fff' : '#000';
    var body = ICONS[name] || ICONS.cloud;
    if (inverted) body = body.replace(/#fff/g, '#000').replace(/fill="#000"/g, 'fill="#fff"');
    return '<svg viewBox="0 0 64 64" fill="none" stroke="' + c + '" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  /* ---------- 上段 ---------- */
  function renderTop(now) {
    var p = L.parts(now);
    setHTML($('date-md'), p.mo + '月' + p.d + '日');
    setHTML($('date-wd'), L.weekday(now) + '曜日');
    setHTML($('clock'), p.h + ':' + L.pad(p.mi));
  }

  /* ---------- 天気 ---------- */
  function placeName() {
    var s = st.settings;
    for (var i = 0; i < PLACES.length; i++) if (PLACES[i].id === s.place && s.place !== 'custom') return PLACES[i].name;
    return '指定地点';
  }
  function renderWeather(now) {
    if (!st.wx) {
      setHTML($('weather'), '<div class="wx-text"><div class="wx-label">天気を取得中</div><div class="wx-now">' + esc(st.wxErr || '') + '</div></div>');
      setHTML($('weather-note'), '');
      return;
    }
    var today = L.ymd(now), d = null;
    for (var i = 0; i < st.wx.daily.length; i++) if (st.wx.daily[i].date === today) d = st.wx.daily[i];
    var cur = null, h0 = L.hourFloor(now);
    for (var j = 0; j < st.wx.hourly.length; j++) if (st.wx.hourly[j].t === h0) cur = st.wx.hourly[j];
    var info = L.weatherInfo(d ? d.code : (cur ? cur.code : -1));
    var html = icon(info.icon).replace('<svg', '<svg class="wx-icon"') +
      '<div class="wx-text"><span class="wx-label">' + esc(info.label) + '</span>' +
      (d ? '<span class="wx-temps"><span class="lab">最高</span><span class="hi">' + Math.round(d.max) + '°</span>' +
           '<span class="lab">最低</span><span class="lo">' + Math.round(d.min) + '°</span></span>' : '') + '</div>';
    setHTML($('weather'), html);
    // 今日の残りに雨（降水確率30%以上を含む）があれば雨のひとこと、なければ明日の天気を出す
    var note = L.rainComment(st.wx.hourly, now);
    if (note === L.NO_RAIN || note === '') {
      var tmDate = L.addDays(today, 1), tm = null;
      for (var k = 0; k < st.wx.daily.length; k++) if (st.wx.daily[k].date === tmDate) tm = st.wx.daily[k];
      if (tm) note = 'このあと雨なし／明日 ' + L.weatherInfo(tm.code).label + ' ' + Math.round(tm.max) + '°/' + Math.round(tm.min) + '°' +
        (tm.pop != null && tm.pop >= 30 ? ' 降水' + tm.pop + '%' : '');
    }
    setHTML($('weather-note'), esc(note));
  }
  function renderHours(now) {
    if (st.offset && Date.now() - st.lastNav > NAV_RESET) st.offset = 0;
    var w = L.hourWindow(st.wx ? st.wx.hourly : [], now, st.offset);
    if (!w.canNext && st.offset > 0 && !w.cells[0].data) { st.offset = 0; w = L.hourWindow(st.wx ? st.wx.hourly : [], now, 0); }
    var html = w.cells.map(function (c) {
      var d = c.data, inv = c.isNow;
      var lab = c.h + '時' + (c.newDay ? '<small>' + L.md(L.ymd(c.t)) + '</small>' : '');
      if (!d) return '<div class="hcell' + (inv ? ' now' : '') + '"><div class="h">' + lab + '</div><div class="pp">—</div></div>';
      var wi = L.weatherInfo(d.code), ic = wi.icon;
      if ((c.h < 6 || c.h >= 18) && (ic === 'sun' || ic === 'partly')) ic = ic === 'sun' ? 'moon' : 'cloud';
      return '<div class="hcell' + (inv ? ' now' : '') + '"><div class="h">' + lab + '</div>' + icon(ic, inv) +
        '<div class="tp">' + Math.round(d.temp) + '°</div><div class="pp' + (d.pop >= 50 ? ' wet' : '') + '">' +
        (d.pop == null ? '—' : d.pop + '%') + '</div></div>';
    }).join('');
    setHTML($('hours'), html);
    $('prev').disabled = !w.canPrev;
    $('next').disabled = !w.canNext;
  }

  /* ---------- 今月のカレンダー ---------- */
  function renderMonth(now) {
    var hol = st.hol ? st.hol.data : null;
    var g = L.monthGrid(now, hol);
    var head = ['日', '月', '火', '水', '木', '金', '土'].map(function (w, i) {
      return '<th class="' + (i === 0 || i === 6 ? 'off' : '') + '">' + w + '</th>';
    }).join('');
    var rows = g.weeks.map(function (w) {
      return '<tr>' + w.map(function (c) {
        if (!c) return '<td></td>';
        var cls = [];
        if (c.off) cls.push('off');
        if (c.holiday) cls.push('hol');
        if (c.today) cls.push('today');
        return '<td class="' + cls.join(' ') + '"><span>' + c.d + '</span></td>';
      }).join('') + '</tr>';
    }).join('');
    var note = '';
    if (hol) {
      var todayHol = hol[L.ymd(now)];
      var nx = L.nextHoliday(hol, now);
      if (todayHol) note = '今日は' + esc(todayHol);
      else if (nx) note = L.md(nx.date) + ' ' + esc(nx.name) + 'まであと' + nx.days + '日';
    } else note = '祝日データ未取得';
    setHTML($('month'), '<div class="month-head"><span class="month-m">' + g.month + '月</span><span class="month-note">' + note + '</span></div>' +
      '<table class="cal"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>');
  }

  /* ---------- ニュース ---------- */
  function renderNews(now) {
    var n = st.news;
    if (!n || !n.items || !n.items.length) {
      setHTML($('news'), '<div class="news-head">NHKニュース</div><div class="news-empty">' + esc(st.newsErr || 'ニュースを取得中') + '</div>');
      return;
    }
    var rows = n.items.slice(0, 5).map(function (it) {
      var t = it.published ? Date.parse(it.published) : NaN;
      var when = isNaN(t) ? '' : (L.ymd(t) === L.ymd(now) ? L.hm(t) : L.md(L.ymd(t)));
      return '<li><span class="nt">' + when + '</span><span class="nh">' + esc(it.title) + '</span></li>';
    }).join('');
    setHTML($('news'), '<div class="news-head">' + esc(n.source || 'ニュース') + '</div><ul class="news-list">' + rows + '</ul>');
    fitNews();
  }
  function fitNews() {   // 途中で切れる見出しは丸ごと隠す（欄の高さに入る件数だけ表示）
    var box = $('news'), lis = box.querySelectorAll('li'), bottom = box.getBoundingClientRect().bottom;
    for (var i = 0; i < lis.length; i++) {
      lis[i].style.display = '';
      if (lis[i].getBoundingClientRect().bottom > bottom + 1) {
        for (var j = i; j < lis.length; j++) lis[j].style.display = 'none';
        break;
      }
    }
  }

  /* ---------- 状態表示 ---------- */
  function renderStatus(now) {
    var parts = [], warn = false;
    if (st.wx) {
      var wxOld = now - st.wx.at > WX_STALE;
      parts.push('天気 ' + L.hm(st.wx.at) + ' 更新' + (wxOld ? '（古いデータ）' : ''));
      if (wxOld) warn = true;
    } else { parts.push('天気 未取得'); warn = true; }
    if (st.wxErr) parts.push('天気の取得失敗：' + st.wxErr);
    if (st.news && st.news.fetchedAt) {
      var nAt = Date.parse(st.news.fetchedAt), nOld = now - nAt > 3 * L.HOUR;
      parts.push('ニュース ' + L.hm(nAt) + ' 取得' + (nOld ? '（古いデータ）' : ''));
      if (nOld) warn = true;
    } else parts.push('ニュース 未取得');
    if (st.newsErr) parts.push('ニュースの取得失敗：' + st.newsErr);
    if (!st.hol) parts.push('祝日 未取得' + (st.holErr ? '（' + st.holErr + '）' : ''));
    if (!navigator.onLine) { parts.unshift('オフライン'); warn = true; }
    var errs = st.wxErr || st.newsErr || !navigator.onLine;
    var text = (warn || errs) ? '⚠ ' + parts.join('　／　') : (st.wx ? L.hm(st.wx.at) + ' 更新' : '');
    setHTML($('status-text'), esc(text));
    warn = warn || !!errs;
    setClass($('status'), 'warn', warn);
  }

  function renderAll() {
    var now = Date.now();
    renderTop(now); renderWeather(now); renderHours(now); renderMonth(now); renderNews(now); renderStatus(now);
  }

  /* ---------- 通信 ---------- */
  function getText(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('応答なし（タイムアウト）')); } }, ms);
      fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow' }).then(function (r) {
        if (!r.ok) throw new Error('サーバー応答 ' + r.status);
        return r.text();
      }).then(function (t) { if (!done) { done = true; clearTimeout(timer); resolve(t); } },
        function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    });
  }
  function netMsg(e) {
    var m = (e && e.message) || '';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return navigator.onLine ? '天気サービスに接続できません' : '通信できません';
    return m || '不明なエラー';
  }

  function currentLatLon() {
    var s = st.settings;
    for (var i = 0; i < PLACES.length; i++) if (PLACES[i].id === s.place && PLACES[i].lat) return PLACES[i];
    return { lat: +s.lat || 35.6812, lon: +s.lon || 139.7671 };
  }
  function fetchWeather() {
    if (st.wxBusy) return;
    st.wxTry = Date.now(); st.wxBusy = true;
    var p = currentLatLon();
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=Asia%2FTokyo&forecast_days=3';
    getText(url, 30000).then(function (t) {
      var d = JSON.parse(t);
      if (!d.hourly || !d.daily) throw new Error('天気データの形式が不正');
      var hourly = d.hourly.time.map(function (tm, i) {
        return { t: Date.parse(tm + ':00+09:00'), temp: d.hourly.temperature_2m[i],
                 pop: d.hourly.precipitation_probability[i], code: d.hourly.weather_code[i] };
      });
      var daily = d.daily.time.map(function (dt, i) {
        return { date: dt, code: d.daily.weather_code[i], max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i],
                 pop: d.daily.precipitation_probability_max ? d.daily.precipitation_probability_max[i] : null };
      });
      st.wx = { at: Date.now(), hourly: hourly, daily: daily, place: st.settings.place };
      save('wx', st.wx);
      st.wxErr = null;
    }).catch(function (e) { st.wxErr = netMsg(e); })
      .then(function () { st.wxBusy = false; renderAll(); });
  }

  function fetchNews() {   // GitHub Actions が30分ごとに更新する同じサイト内の news.json を読む
    st.newsTry = Date.now();
    getText('news.json?_=' + Date.now(), 30000).then(function (t) {
      var d = JSON.parse(t);
      if (d.ok && d.items && d.items.length) { st.news = d; save('news', d); st.newsErr = null; }
      else st.newsErr = 'ニュースの元データが空です';
    }).catch(function (e) { st.newsErr = netMsg(e); }).then(renderAll);
  }

  function fetchHolidays() {
    st.holTry = Date.now();
    getText('https://holidays-jp.github.io/api/v1/date.json', 30000).then(function (t) {
      var d = JSON.parse(t);
      if (!d || typeof d !== 'object') throw new Error('祝日データの形式が不正');
      st.hol = { at: Date.now(), data: d }; save('hol', st.hol); st.holErr = null;
    }).catch(function (e) { st.holErr = netMsg(e); }).then(renderAll);
  }

  /* ---------- 残像クリア（ソフトウェアによる黒→白の全面切り替え。BOOX本体の全画面リフレッシュとは別物） ---------- */
  function ghostFlash() {
    var el = $('flash');
    el.className = 'flash'; el.hidden = false;
    setTimeout(function () { el.className = 'flash white'; }, 700);
    setTimeout(function () { el.hidden = true; el.className = 'flash'; }, 1300);
  }

  /* ---------- 毎分の処理 ---------- */
  function tick() {
    var now = Date.now(), today = L.ymd(now);
    if (st.today !== today) {           // 日付が変わった：予定を即取得し、タスクを持ち越し判定
      var first = st.today === null;
      st.today = today;
      st.offset = 0;
      if (!first) fetchWeather();
    }
    if (now - st.wxTry >= WX_MS - 5000) fetchWeather();
    if (now - st.newsTry >= 10 * 60000 - 5000) fetchNews();
    var holAge = st.hol ? now - st.hol.at : Infinity;   // 祝日は1日1回（失敗時は1時間後に再試行）
    if (holAge > L.DAY && now - st.holTry > L.HOUR) fetchHolidays();
    var p = L.parts(now), g = +st.settings.ghost;
    var slot = today + ' ' + p.h;
    if (g && p.mi === 0 && p.h % g === 0 && st.lastGhost !== slot && $('settings').hidden) {
      st.lastGhost = slot; ghostFlash();
    }
    renderAll();
    setTimeout(tick, 60000 - (Date.now() % 60000) + 200);   // 次の「分」の境目に合わせる
  }

  /* ---------- 操作 ---------- */
  function bind() {
    $('prev').onclick = function () { if (st.offset > 0) { st.offset--; st.lastNav = Date.now(); renderAll(); } };
    $('next').onclick = function () { st.offset++; st.lastNav = Date.now(); renderAll(); };


    var sel = $('s-place');
    sel.innerHTML = PLACES.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
    sel.onchange = function () { $('s-custom').style.display = sel.value === 'custom' ? '' : 'none'; };
    $('open-settings').onclick = function () {
      var s = st.settings;
      sel.value = s.place; $('s-lat').value = s.lat; $('s-lon').value = s.lon; $('s-ghost').value = String(s.ghost);
      sel.onchange();
      $('s-info').textContent = '天気は30分ごと（Open-Meteo）、ニュースは10分ごと（元データは約30分ごとに更新）、祝日は1日1回（holidays-jp）取得します。設定はこの端末内に保存されます。';
      $('settings').hidden = false;
    };
    $('s-cancel').onclick = function () { $('settings').hidden = true; };
    $('s-save').onclick = function () {
      var s = st.settings, oldPlace = s.place + s.lat + s.lon;
      s.place = sel.value; s.lat = +$('s-lat').value || s.lat; s.lon = +$('s-lon').value || s.lon;
      s.ghost = +$('s-ghost').value;
      save('settings', s);
      $('settings').hidden = true;
      if (oldPlace !== s.place + s.lat + s.lon) { st.wx = null; save('wx', null); fetchWeather(); }
      renderAll();
    };
    $('s-refresh').onclick = function () { $('settings').hidden = true; fetchWeather(); fetchHolidays(); fetchNews(); };
    $('s-flash').onclick = function () { $('settings').hidden = true; ghostFlash(); };

    window.addEventListener('online', function () { fetchWeather(); fetchNews(); });
    window.addEventListener('offline', renderAll);
    document.addEventListener('visibilitychange', function () {   // スリープ復帰・アプリ復帰時
      if (!document.hidden) {
        var now = Date.now();
        if (now - st.wxTry > 10 * 60000) fetchWeather();
        renderAll();
      }
    });
  }

  window.addEventListener('resize', function () { if ($('news').querySelector('li')) fitNews(); });
  bind();
  if (st.wx && st.wx.place !== st.settings.place) st.wx = null;
  tick();
})();
