// .ics (iCalendar) import/export — used for Google Calendar import and "Add to iPhone Calendar".
import { WD_SHORT } from './dates.js';

const ICS_WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const WD_ICS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unfold(text) { return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }
function unescape(v) { return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }

// Convert wall-clock time in an IANA zone to epoch ms.
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const off = (t) => {
      const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t;
    };
    let t = guess - off(guess);
    t = guess - off(t);
    return t;
  } catch { return new Date(y, mo, d, h, mi, s).getTime(); }
}

function parseDT(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, Y, M, D, h, mi, s, z] = m;
  if (h == null || params.VALUE === 'DATE') return { t: new Date(+Y, +M - 1, +D).getTime(), allDay: true };
  if (z) return { t: Date.UTC(+Y, +M - 1, +D, +h, +mi, +(s || 0)), allDay: false };
  if (params.TZID) return { t: zonedToUtc(+Y, +M - 1, +D, +h, +mi, +(s || 0), params.TZID.replace(/^"|"$/g, '')), allDay: false };
  return { t: new Date(+Y, +M - 1, +D, +h, +mi, +(s || 0)).getTime(), allDay: false };
}

function parseLine(line) {
  const i = line.indexOf(':'); if (i < 0) return null;
  const head = line.slice(0, i), value = line.slice(i + 1);
  const [name, ...ps] = head.split(';');
  const params = {};
  for (const p of ps) { const [k, v] = p.split('='); if (k) params[k.toUpperCase()] = v; }
  return { name: name.toUpperCase(), params, value };
}

function parseRRule(v) {
  const o = Object.fromEntries(v.split(';').map(kv => kv.split('=')).map(([k, x]) => [k.toUpperCase(), x]));
  const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[o.FREQ];
  if (!freq) return null;
  const r = { freq, interval: o.INTERVAL ? +o.INTERVAL : 1 };
  if (o.COUNT) r.count = +o.COUNT;
  if (o.UNTIL) { const u = parseDT(o.UNTIL, {}); if (u) r.until = u.allDay ? u.t + 86399999 : u.t; }
  if (o.BYDAY) {
    const parts = o.BYDAY.split(',');
    if (freq === 'monthly' && /^-?\d/.test(parts[0])) {
      const mm = parts[0].match(/^(-?\d)([A-Z]{2})$/); if (mm) r.nth = { n: +mm[1], wd: ICS_WD[mm[2]] };
    } else r.byday = parts.map(p => ICS_WD[p.replace(/^[-\d]+/, '')]).filter(x => x != null);
  }
  return r;
}

/** Parse .ics text into LifeManaged event objects (without ids). */
export function parseICS(text, { skipOlderThanDays = 30 } = {}) {
  const lines = unfold(text).split('\n');
  const events = []; let cur = null; let inAlarm = false;
  for (const raw of lines) {
    const line = raw.trimEnd(); if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (line === 'END:VALARM') { inAlarm = false; continue; }
    if (inAlarm) continue;
    const p = parseLine(line); if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.title = unescape(p.value); break;
      case 'DESCRIPTION': cur.notes = unescape(p.value); break;
      case 'LOCATION': cur.location = unescape(p.value); break;
      case 'STATUS': cur.status = p.value; break;
      case 'DTSTART': { const d = parseDT(p.value, p.params); if (d) { cur.start = d.t; cur.allDay = d.allDay; } break; }
      case 'DTEND': { const d = parseDT(p.value, p.params); if (d) cur.end = d.t; break; }
      case 'RRULE': cur.recur = parseRRule(p.value); break;
      case 'EXDATE': for (const v of p.value.split(',')) { const d = parseDT(v, p.params); if (d) cur.exdates.push(d.t); } break;
      case 'RECURRENCE-ID': { const d = parseDT(p.value, p.params); if (d) cur.recurrenceId = d.t; break; }
    }
  }
  // Moved/edited single instances: hide original instance on the master.
  const byUid = new Map();
  for (const e of events) if (e.uid && !e.recurrenceId) byUid.set(e.uid, e);
  for (const e of events) if (e.recurrenceId && byUid.has(e.uid)) byUid.get(e.uid).exdates.push(e.recurrenceId);

  const cutoff = Date.now() - skipOlderThanDays * 864e5;
  const out = []; let skipped = 0;
  const dk = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  for (const e of events) {
    if (e.start == null || e.status === 'CANCELLED') { skipped++; continue; }
    const endT = e.end || e.start;
    if (skipOlderThanDays != null) {
      if (!e.recur && endT < cutoff) { skipped++; continue; }
      if (e.recur && e.recur.until && e.recur.until < cutoff) { skipped++; continue; }
    }
    let end = e.end || null;
    if (e.allDay && end) end = end - 1; // DTEND is exclusive for all-day
    out.push({
      type: 'event', title: e.title || '(No title)', notes: [e.location ? '📍 ' + e.location : '', e.notes || ''].filter(Boolean).join('\n'),
      start: e.start, end: e.allDay ? (end && end - e.start > 864e5 ? end : null) : end, allDay: !!e.allDay,
      recur: e.recur || null, exdates: e.exdates.map(dk), category: 'personal', source: 'ics',
      icsUid: e.uid ? e.uid + (e.recurrenceId ? '#' + e.recurrenceId : '') : null,
      remindMins: e.allDay ? null : 15,
    });
  }
  return { events: out, skipped, total: events.length };
}

// ---------- export ----------
const pad = (n) => String(n).padStart(2, '0');
function fmtUTC(t) { const d = new Date(t); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; }
function fmtDay(t) { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }
function esc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
function fold(line) { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); }

function rruleOf(r) {
  if (!r) return null;
  let s = `RRULE:FREQ=${r.freq.toUpperCase()}`;
  if (r.interval > 1) s += `;INTERVAL=${r.interval}`;
  if (r.byday && r.byday.length) s += `;BYDAY=${r.byday.map(i => WD_ICS[i]).join(',')}`;
  if (r.nth) s += `;BYDAY=${r.nth.n}${WD_ICS[r.nth.wd]}`;
  if (r.count) s += `;COUNT=${r.count}`;
  if (r.until) s += `;UNTIL=${fmtUTC(r.until)}`;
  return s;
}

export function toICS(items) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LifeManaged//EN', 'CALSCALE:GREGORIAN'];
  for (const it of items) {
    const isTask = it.type === 'task';
    const start = isTask ? it.due : it.start; if (start == null) continue;
    const allDay = isTask ? !it.hasTime : it.allDay;
    L.push('BEGIN:VEVENT', `UID:${it.id}@lifemanaged.local`, `DTSTAMP:${fmtUTC(Date.now())}`);
    if (allDay) {
      L.push(`DTSTART;VALUE=DATE:${fmtDay(start)}`);
      const e = new Date(it.end || start); L.push(`DTEND;VALUE=DATE:${fmtDay(new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1))}`);
    } else {
      L.push(`DTSTART:${fmtUTC(start)}`, `DTEND:${fmtUTC(it.end && it.end > start ? it.end : start + (isTask ? 15 : 60) * 60000)}`);
    }
    L.push(fold(`SUMMARY:${esc(it.title)}`));
    if (it.notes) L.push(fold(`DESCRIPTION:${esc(it.notes)}`));
    const rr = rruleOf(it.recur); if (rr) L.push(rr);
    const mins = isTask ? (it.remind ? 0 : null) : it.remindMins;
    if (mins != null && !allDay) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(it.title)}`), `TRIGGER:-PT${mins}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
export { WD_SHORT };
