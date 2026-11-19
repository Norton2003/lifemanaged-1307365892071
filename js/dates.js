// Date helpers + recurrence expansion. All local-time, DST-safe (uses Date(y,m,d,h,mi)).

export const DAY = 86400000;
export const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function startOfDay(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
export function addDays(t, n) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()).getTime(); }
export function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function fromDayKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
export function sameDay(a, b) { return dayKey(a) === dayKey(b); }

export function fmtTime(t) {
  const d = new Date(t); let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
}
export function fmtDate(t, opts = {}) {
  const d = new Date(t); const now = Date.now();
  if (!opts.noRelative) {
    if (sameDay(t, now)) return 'Today';
    if (sameDay(t, addDays(now, 1))) return 'Tomorrow';
    if (sameDay(t, addDays(now, -1))) return 'Yesterday';
  }
  const yr = d.getFullYear() !== new Date(now).getFullYear() ? `, ${d.getFullYear()}` : '';
  return `${WD_SHORT[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${yr}`;
}
export function toInputDate(t) { return dayKey(t); }
export function toInputTime(t) { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

export function describeRecur(r) {
  if (!r) return '';
  const every = r.interval > 1 ? `every ${r.interval} ` : 'every ';
  if (r.freq === 'daily') return r.interval > 1 ? `${every}days` : 'daily';
  if (r.freq === 'weekly') {
    const days = (r.byday && r.byday.length) ? r.byday.slice().sort().map(i => WD_SHORT[i]).join('/') : '';
    if (days === 'Mon/Tue/Wed/Thu/Fri') return 'weekdays';
    if (r.interval > 1) return `every ${r.interval} weeks${days ? ' on ' + days : ''}`;
    return days ? `every ${days}` : 'weekly';
  }
  if (r.freq === 'monthly') return r.interval > 1 ? `${every}months` : 'monthly';
  if (r.freq === 'yearly') return 'yearly';
  return '';
}

function nthWeekdayOfMonth(y, m, n, wd) {
  if (n > 0) {
    const first = new Date(y, m, 1).getDay();
    const day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
    const d = new Date(y, m, day);
    return d.getMonth() === m ? day : null;
  }
  const last = new Date(y, m + 1, 0);
  const day = last.getDate() - ((last.getDay() - wd + 7) % 7) + (n + 1) * 7;
  return day >= 1 ? day : null;
}

/** Expand an item (with .start, optional .end, .recur, .exdates) into occurrences overlapping [from, to). */
export function occurrences(item, from, to) {
  const start = item.start; if (start == null) return [];
  const dur = item.end && item.end > start ? item.end - start : 0;
  const r = item.recur;
  if (!r) return (start < to && (start + Math.max(dur, 1)) > from) ? [{ start, end: item.end || null }] : [];
  const ex = new Set(item.exdates || []);
  const s = new Date(start); const H = s.getHours(), Mi = s.getMinutes();
  const interval = Math.max(1, r.interval || 1);
  const out = []; let counted = 0; let guard = 0;
  const push = (t) => {
    if (t < start) return true;
    if (r.until && t > r.until) return false;
    if (r.count && counted >= r.count) return false;
    counted++;
    if (t >= to) return false;
    if (t + Math.max(dur, 1) > from && !ex.has(dayKey(t))) out.push({ start: t, end: dur ? t + dur : null });
    return true;
  };
  // Skip ahead when no COUNT (counting needs full history)
  let k0 = 0;
  if (!r.count && from > start) {
    const span = r.freq === 'daily' ? interval : r.freq === 'weekly' ? interval * 7 : 0;
    if (span) k0 = Math.max(0, Math.floor((from - start) / DAY / span) - 1);
  }
  if (r.freq === 'daily') {
    for (let k = k0; guard++ < 20000; k++) {
      const t = new Date(s.getFullYear(), s.getMonth(), s.getDate() + k * interval, H, Mi).getTime();
      if (!push(t)) break;
    }
  } else if (r.freq === 'weekly') {
    const days = (r.byday && r.byday.length ? r.byday.slice() : [s.getDay()]).sort((a, b) => a - b);
    const weekStart = new Date(s.getFullYear(), s.getMonth(), s.getDate() - s.getDay());
    outer: for (let w = k0; guard++ < 20000; w++) {
      for (const wd of days) {
        const t = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + w * interval * 7 + wd, H, Mi).getTime();
        if (t < start) continue;
        if (!push(t)) break outer;
      }
    }
  } else if (r.freq === 'monthly') {
    for (let k = 0; guard++ < 5000; k++) {
      const y = s.getFullYear(), m = s.getMonth() + k * interval;
      const first = new Date(y, m, 1);
      let day;
      if (r.nth) day = nthWeekdayOfMonth(first.getFullYear(), first.getMonth(), r.nth.n, r.nth.wd);
      else { day = s.getDate(); if (new Date(first.getFullYear(), first.getMonth(), day).getMonth() !== first.getMonth()) day = null; }
      if (day == null) continue;
      const t = new Date(first.getFullYear(), first.getMonth(), day, H, Mi).getTime();
      if (!push(t)) break;
    }
  } else if (r.freq === 'yearly') {
    for (let k = 0; guard++ < 500; k += interval) {
      const t = new Date(s.getFullYear() + k, s.getMonth(), s.getDate(), H, Mi);
      if (t.getMonth() !== s.getMonth()) continue;
      if (!push(t.getTime())) break;
    }
  }
  return out;
}
