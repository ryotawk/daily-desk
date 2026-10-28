/* BOOX Daily Desk — 表示ロジック（DOMに依存しない純粋関数。テスト対象） */
(function (root) {
  'use strict';
  var JST = 9 * 3600 * 1000, HOUR = 3600 * 1000, DAY = 24 * HOUR;
  var NO_RAIN = 'このあとは雨の心配なし';
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parts(ms) {
    var d = new Date(ms + JST);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
             h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
  }
  function ymd(ms) { var p = parts(ms); return p.y + '-' + pad(p.mo) + '-' + pad(p.d); }
  function hm(ms) { var p = parts(ms); return p.h + ':' + pad(p.mi); }
  function dayStart(ymdStr) { return Date.parse(ymdStr + 'T00:00:00+09:00'); }
  function addDays(ymdStr, n) { return ymd(dayStart(ymdStr) + n * DAY + HOUR); }
  function hourFloor(ms) { return Math.floor((ms + JST) / HOUR) * HOUR - JST; }
  function md(ymdStr) { var a = ymdStr.split('-'); return (+a[1]) + '/' + (+a[2]); }
  function weekday(ms) { return WD[parts(ms).wd]; }

  function normalize(events) {
    var out = [];
    (events || []).forEach(function (e) {
      var s, en;
      if (e.allDay) {
        s = dayStart(e.start); en = dayStart(e.end);
        if (!(en > s)) en = s + DAY;
      } else {
        s = Date.parse(e.start); en = Date.parse(e.end);
        if (!(en >= s)) en = s;
      }
      if (isNaN(s)) return;
      out.push({ title: e.title || '（タイトルなし）', allDay: !!e.allDay, s: s, e: en,
                 startDate: e.allDay ? e.start : null, endDate: e.allDay ? e.end : null });
    });
    out.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
    return out;
  }

  /* 予定欄の表示内容を決める */
  function planSchedule(events, now) {
    var today = ymd(now), tomorrow = addDays(today, 1);
    var t0 = dayStart(today), t1 = t0 + DAY, t2 = t1 + DAY;
    var ev = normalize(events);
    var allDayToday = ev.filter(function (e) { return e.allDay && e.s < t1 && e.e > t0; });
    var timed = ev.filter(function (e) { return !e.allDay; });
    var ongoing = timed.filter(function (e) { return e.s <= now && e.e > now; })
      .sort(function (a, b) { return b.s - a.s || a.e - b.e; });
    var upcoming = timed.filter(function (e) { return e.s > now && e.s < t1; });
    var timedToday = timed.filter(function (e) { return e.s < t1 && e.e > t0; });

    var focus = null, mode, rest;
    if (ongoing.length) { focus = ongoing[0]; mode = 'ongoing'; rest = ongoing.slice(1).concat(upcoming); }
    else if (upcoming.length) { focus = upcoming[0]; mode = 'next'; rest = upcoming.slice(1); }
    else { mode = timedToday.length ? 'done' : 'none'; rest = []; }

    var tomorrowFirst = null;
    for (var i = 0; i < timed.length; i++) {
      if (timed[i].s >= t1 && timed[i].s < t2) { tomorrowFirst = timed[i]; break; }
    }
    var tomorrowAllDay = ev.filter(function (e) { return e.allDay && e.s < t2 && e.e > t1; });

    return {
      today: today, tomorrow: tomorrow, mode: mode, focus: focus,
      minutesToFocus: focus && mode === 'next' ? Math.ceil((focus.s - now) / 60000) : null,
      minutesLeft: focus && mode === 'ongoing' ? Math.ceil((focus.e - now) / 60000) : null,
      later: rest.slice(0, 2), moreCount: Math.max(0, rest.length - 2),
      allDay: allDayToday, tomorrowFirst: tomorrowFirst, tomorrowAllDay: tomorrowAllDay
    };
  }

  /* 時刻の表示：今日以外の日付をまたぐ場合だけ日付を付ける */
  function timeLabel(ms, today) {
    var d = ymd(ms);
    if (d === today) return hm(ms);
    return md(d) + ' ' + hm(ms);
  }
  function rangeLabel(e, today) {
    if (e.allDay) {
      var last = addDays(e.endDate, -1);
      return last === e.startDate ? '終日' : '終日（' + md(e.startDate) + '〜' + md(last) + '）';
    }
    if (e.s === e.e) return timeLabel(e.s, today);
    var ed = ymd(e.e - 1);
    var endLabel = (ed === ymd(e.s) || ed === today) ? hm(e.e) : md(ed) + ' ' + hm(e.e);
    return timeLabel(e.s, today) + '–' + endLabel;
  }
  function minutesText(m) {
    if (m < 60) return m + '分';
    var h = Math.floor(m / 60), r = m % 60;
    return h + '時間' + (r ? r + '分' : '');
  }

  /* 天気コード（WMO）→ 表示 */
  function weatherInfo(code) {
    var c = +code;
    if (c === 0) return { label: '快晴', icon: 'sun' };
    if (c === 1) return { label: '晴れ', icon: 'sun' };
    if (c === 2) return { label: '晴れ時々くもり', icon: 'partly' };
    if (c === 3) return { label: 'くもり', icon: 'cloud' };
    if (c === 45 || c === 48) return { label: '霧', icon: 'fog' };
    if (c >= 51 && c <= 57) return { label: '霧雨', icon: 'rain' };
    if (c >= 61 && c <= 67) return { label: c >= 65 ? '強い雨' : '雨', icon: 'rain' };
    if (c >= 71 && c <= 77) return { label: '雪', icon: 'snow' };
    if (c >= 80 && c <= 82) return { label: 'にわか雨', icon: 'rain' };
    if (c === 85 || c === 86) return { label: 'にわか雪', icon: 'snow' };
    if (c >= 95) return { label: '雷雨', icon: 'thunder' };
    return { label: '—', icon: 'cloud' };
  }
  function isWetCode(c) { c = +c; return (c >= 51 && c <= 67) || (c >= 71 && c <= 86) || c >= 95; }
  function isSnowCode(c) { c = +c; return (c >= 71 && c <= 77) || c === 85 || c === 86; }

  /* 「15時台は雨の予報」などのひとこと。hourly: [{t, temp, pop, code}] */
  function rainComment(hourly, now) {
    var today = ymd(now), h0 = hourFloor(now);
    var rest = (hourly || []).filter(function (h) { return h.t >= h0 && ymd(h.t) === today; });
    if (!rest.length) return '';
    var wet = function (h) { return (h.pop != null && h.pop >= 50) || isWetCode(h.code); };
    var i = 0;
    while (i < rest.length && !wet(rest[i])) i++;
    if (i < rest.length) {
      var j = i, maxPop = 0, snow = false;
      while (j < rest.length && wet(rest[j])) {
        maxPop = Math.max(maxPop, rest[j].pop || 0);
        if (isSnowCode(rest[j].code)) snow = true;
        j++;
      }
      var kind = snow ? '雪' : '雨';
      var a = parts(rest[i].t).h, b = parts(rest[j - 1].t).h;
      var when = rest[i].t === h0 ? (j - i > 1 ? '今から' + b + '時台まで' : '今の時間帯は')
                                  : (j - i > 1 ? a + '〜' + b + '時台は' : a + '時台は');
      var tail = maxPop ? '（降水確率' + maxPop + '%）' : '';
      if (when === '今の時間帯は') return '今の時間帯は' + kind + 'の予報' + tail;
      return when + kind + 'の予報' + tail;
    }
    var mx = null;
    rest.forEach(function (h) { if (h.pop != null && (!mx || h.pop > mx.pop)) mx = h; });
    if (mx && mx.pop >= 30) return parts(mx.t).h + '時台に降水確率' + mx.pop + '%。折りたたみ傘があると安心';
    return NO_RAIN;
  }

  /* 下段8時間の表示範囲 */
  function hourWindow(hourly, now, offset) {
    var base = hourFloor(now) + offset * 4 * HOUR;
    var map = {};
    (hourly || []).forEach(function (h) { map[h.t] = h; });
    var cells = [];
    for (var k = 0; k < 8; k++) {
      var t = base + k * HOUR;
      cells.push({ t: t, h: parts(t).h, data: map[t] || null, isNow: t === hourFloor(now),
                   newDay: k === 0 ? ymd(t) !== ymd(now) : parts(t).h === 0 });
    }
    var lastT = (hourly && hourly.length) ? hourly[hourly.length - 1].t : 0;
    return { cells: cells, canPrev: offset > 0, canNext: base + 12 * HOUR <= lastT };
  }

  /* 今月のカレンダー（日曜始まり）。holidays: {'2026-11-03': '文化の日', ...} */
  function monthGrid(now, holidays) {
    var p = parts(now), today = ymd(now);
    var first = p.y + '-' + pad(p.mo) + '-01';
    var startWd = parts(dayStart(first) + HOUR).wd;
    var days = new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate();
    var cells = [], i;
    for (i = 0; i < startWd; i++) cells.push(null);
    for (i = 1; i <= days; i++) {
      var ds = p.y + '-' + pad(p.mo) + '-' + pad(i), wd = (startWd + i - 1) % 7;
      var hol = holidays && holidays[ds] ? holidays[ds] : null;
      cells.push({ d: i, date: ds, wd: wd, holiday: hol, off: wd === 0 || wd === 6 || !!hol, today: ds === today });
    }
    while (cells.length % 7) cells.push(null);
    var weeks = [];
    for (i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { year: p.y, month: p.mo, weeks: weeks };
  }
  function nextHoliday(holidays, now) {
    var today = ymd(now), best = null;
    for (var k in holidays) if (holidays.hasOwnProperty(k) && k > today && (!best || k < best)) best = k;
    if (!best) return null;
    return { date: best, name: holidays[best], days: Math.round((dayStart(best) - dayStart(today)) / DAY) };
  }

  function cleanKey(k) { return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  var api = { pad: pad, parts: parts, ymd: ymd, hm: hm, md: md, weekday: weekday, dayStart: dayStart,
    addDays: addDays, hourFloor: hourFloor, normalize: normalize, planSchedule: planSchedule,
    timeLabel: timeLabel, rangeLabel: rangeLabel, minutesText: minutesText, weatherInfo: weatherInfo,
    rainComment: rainComment, hourWindow: hourWindow, cleanKey: cleanKey, monthGrid: monthGrid, NO_RAIN: NO_RAIN, nextHoliday: nextHoliday, HOUR: HOUR, DAY: DAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoardLogic = api;
})(this);
