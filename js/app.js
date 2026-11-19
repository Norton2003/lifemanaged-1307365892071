// LifeManaged — main app. Everything stays on this device (IndexedDB). No network calls.
import { db, uid } from './db.js';
import { parse, CATEGORIES, detectCategory } from './parser.js';
import { occurrences, startOfDay, addDays, dayKey, fromDayKey, fmtDate, fmtTime, describeRecur, toInputDate, toInputTime, MONTHS_LONG, WD_SHORT, DAY } from './dates.js';
import { parseICS, toICS } from './ics.js';
import { makeBackup, readBackup, isEncrypted } from './backup.js';

export const APP_VERSION = '1.0.1';

// ---------------- state ----------------
const S = {
  items: [], chat: [], meta: {}, view: 'chat', undo: [],
  cal: { y: new Date().getFullYear(), m: new Date().getMonth(), sel: dayKey(Date.now()) },
  listTab: 'tasks', taskCat: 'all', noteCat: 'all', noteQ: '', notified: {},
};
const LISTS = { tasks: 'Tasks', groceries: 'Groceries', shopping: 'Shopping', books: 'Books' };
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = (id) => S.items.find(i => i.id === id);
const cat = (c) => CATEGORIES[c] || CATEGORIES.personal;

// ---------------- persistence ----------------
async function saveItem(item, { silent } = {}) {
  item.updated = Date.now();
  const i = S.items.findIndex(x => x.id === item.id);
  if (i >= 0) S.items[i] = item; else S.items.push(item);
  await db.putItem(item);
  if (!silent) refresh();
}
async function removeItem(id) {
  S.items = S.items.filter(i => i.id !== id);
  await db.deleteItem(id); refresh();
}
async function saveChat() { S.chat = S.chat.slice(-300); await db.setMeta('chat', S.chat); }
async function setMeta(k, v) { S.meta[k] = v; await db.setMeta(k, v); }

function newItem(spec, source = 'chat') {
  const now = Date.now();
  const it = { id: uid(), created: now, updated: now, source, done: false, notes: '', ...spec };
  if (it.type === 'note') { it.body = it.body || ''; delete it.title; }
  return it;
}

// ---------------- agenda helpers ----------------
function agenda(from, to, { includeTasks = true } = {}) {
  const out = [];
  for (const it of S.items) {
    if (it.type === 'event') for (const o of occurrences(it, from, to)) out.push({ it, start: o.start, end: o.end, allDay: it.allDay });
    else if (includeTasks && (it.type === 'task' || (it.type === 'list' && it.due)) && it.due != null && !it.done) {
      if (it.recur) for (const o of occurrences({ start: it.due, recur: it.recur, exdates: it.exdates }, from, to)) out.push({ it, start: o.start, allDay: !it.hasTime, task: true });
      else if (it.due >= from && it.due < to) out.push({ it, start: it.due, allDay: !it.hasTime, task: true });
    }
  }
  return out.sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || a.start - b.start);
}
function overdue() {
  const sod = startOfDay(Date.now());
  return S.items.filter(i => (i.type === 'task' || (i.type === 'list' && i.due)) && !i.done && i.due != null && (i.hasTime ? i.due < Date.now() : i.due < sod)).sort((a, b) => a.due - b.due);
}

// ---------------- rendering: shared bits ----------------
function whenText(it, occStart) {
  if (it.type === 'event') {
    const s = occStart ?? it.start;
    const dur = it.end ? it.end - it.start : 0;
    let t = fmtDate(s);
    if (!it.allDay) t += ' · ' + fmtTime(s) + (dur ? '–' + fmtTime(s + dur) : '');
    else if (it.end && it.end - it.start >= DAY) t += ' → ' + fmtDate(s + dur);
    if (it.recur) t += ' · ↻ ' + describeRecur(it.recur);
    return t;
  }
  if (it.due != null) {
    let t = (it.type === 'task' ? 'Due ' : '') + fmtDate(occStart ?? it.due) + (it.hasTime ? ' · ' + fmtTime(occStart ?? it.due) : '');
    if (it.recur) t += ' · ↻ ' + describeRecur(it.recur);
    if (it.remind && it.hasTime) t += ' · 🔔';
    return t;
  }
  return '';
}
const TYPE_LABEL = { event: '📅 Event', task: '✅ Task', note: '📝 Note', list: '🧾 List' };
function itemTitle(it) { return it.type === 'note' ? (it.body || '').split('\n')[0].slice(0, 80) || 'Note' : it.title; }

function card(it, { occ, compact, actions = true } = {}) {
  if (!it) return `<div class="card gone">Removed</div>`;
  const c = cat(it.category);
  const lbl = it.type === 'list' ? `🧾 ${LISTS[it.list] || 'List'}` : TYPE_LABEL[it.type];
  const check = (it.type === 'task' || it.type === 'list') ? `<button class="chk ${it.done ? 'on' : ''}" data-action="toggle" data-id="${it.id}" aria-label="Mark done">${it.done ? '✓' : ''}</button>` : '';
  const body = it.type === 'note' ? `<div class="note-body">${esc((it.body || '').slice(0, compact ? 140 : 600))}</div>` : `<div class="ttl ${it.done ? 'done' : ''}">${esc(it.title)}</div>`;
  const w = whenText(it, occ);
  return `<div class="card" data-c="${c.color}" data-action="edit" data-id="${it.id}"${occ != null ? ` data-occ="${occ}"` : ''}>
    ${check}<div class="card-main">${body}
    <div class="meta">${w ? `<span>${esc(w)}</span>` : ''}<span class="tag">${c.icon} ${esc(c.label)}</span>${compact ? '' : `<span class="muted">${lbl}</span>`}</div></div></div>`;
}
// Colors are passed as data-c and applied via CSSOM (the strict CSP forbids inline style attributes).
function applyVars(root) { root.querySelectorAll('[data-c]').forEach(el => el.style.setProperty('--c', el.dataset.c)); }
function setHTML(el, html) { el.innerHTML = html; applyVars(el); }

// ---------------- CHAT ----------------
const HELP = `<b>Just type like you'd text a friend.</b> Examples:
<ul>
<li>buddies want to hang out saturday at 7</li>
<li>thermo exam dec 3 at 9:30am</li>
<li>class MWF 10-10:50am</li>
<li>gym every mon wed fri at 6am</li>
<li>remind me to email Dr. Liu tomorrow at 9</li>
<li>turn in thermo hw by friday</li>
<li>buy eggs, milk and chicken</li>
<li>need a new calculator</li>
<li>want to read Atomic Habits</li>
<li>note: radiator inlet idea…</li>
<li>ran 3 miles in 24 min <span class="muted">(workout log)</span></li>
</ul>
<b>Ask:</b> today · tomorrow · this week · what's on saturday · overdue · groceries · tasks · search radiator<br>
<b>Fix:</b> undo · done thermo hw · bought eggs<br>
<b>Prefixes</b> force a type: <code>note:</code> <code>task:</code> <code>event:</code> <code>grocery:</code> <code>shop:</code> <code>book:</code> <code>workout:</code> <code>rrr:</code> <code>agc:</code> <code>school:</code><br>
Every item can be tapped to edit — nothing is final.`;

function renderChat() {
  const log = $('#chatLog');
  const html = S.chat.map(m => {
    if (m.who === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
    const cards = (m.refs || []).map(id => card(byId(id), { compact: true })).join('');
    const occCards = (m.occ || []).map(o => card(byId(o.id), { occ: o.start, compact: true })).join('');
    const btns = m.undoable && !m.undone ? `<div class="msg-actions"><button class="btn sm ghost" data-action="undo-msg" data-mid="${m.id}">Undo</button></div>` : '';
    return `<div class="msg bot">${m.html || esc(m.text)}${cards || occCards ? `<div class="cards">${cards}${occCards}</div>` : ''}${btns}</div>`;
  }).join('');
  setHTML(log, html || '');
  log.scrollTop = log.scrollHeight;
}
function botSay(o) { const m = { id: uid(), who: 'bot', t: Date.now(), ...o }; S.chat.push(m); saveChat(); return m; }

const LINE_SPLIT = /\r\n|\r|\n|\u2028|\u2029/;
async function handleInput(text) {
  text = text.trim(); if (!text) return;
  // A pasted list (several lines) goes to the brain-dump review instead of becoming one item.
  const lines = text.split(LINE_SPLIT).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    S.chat.push({ id: uid(), who: 'me', text: lines.length + ' lines pasted', t: Date.now() });
    botSay({ html: `📋 Got <b>${lines.length}</b> lines — review them below, uncheck anything wrong, then tap <b>Add checked items</b>.` });
    refresh(); previewDump(lines.join('\n')); return;
  }
  S.chat.push({ id: uid(), who: 'me', text, t: Date.now() });
  let r;
  try { r = parse(text); } catch (e) { console.error(e); r = null; }
  if (!r) { botSay({ html: "I couldn't read that — try rephrasing, or tap <b>Help</b>." }); return refresh(); }

  if (r.kind === 'help') botSay({ html: HELP });
  else if (r.kind === 'undo') await doUndo();
  else if (r.kind === 'search') {
    const q = r.q.toLowerCase();
    const hits = S.items.filter(i => (itemTitle(i) + ' ' + (i.body || '') + ' ' + (i.notes || '')).toLowerCase().includes(q)).slice(0, 10);
    botSay({ html: hits.length ? `Found ${hits.length} for “${esc(r.q)}”:` : `Nothing matches “${esc(r.q)}”.`, refs: hits.map(h => h.id) });
  }
  else if (r.kind === 'done') {
    const target = findOpen(r.q);
    if (!target) botSay({ html: `I couldn't find an open task or list item matching “${esc(r.q)}”.` });
    else { const before = structuredClone(target); await completeItem(target, true); botSay({ html: 'Checked off:', refs: [target.id], undoable: true, undo: { type: 'update', before: [before] } }); }
  }
  else if (r.kind === 'query') answerQuery(r);
  else if (r.kind === 'create') {
    const items = r.items.map(spec => newItem(spec));
    for (const it of items) await saveItem(it, { silent: true });
    let msg = items.length > 1 ? `Added ${items.length} items:` : `Added:`;
    const warn = [];
    for (const it of items) {
      if (it.needsTime) warn.push('No time given, so this can\'t alert you yet — tap it to set a time.');
      if (it.defaultedTime) warn.push('No time given — I set the reminder for 9 AM.');
      if (it.type === 'event' && !it.allDay) {
        const clash = agenda(it.start, it.end || it.start + 1, { includeTasks: false }).filter(a => a.it.id !== it.id && !a.allDay);
        if (clash.length) warn.push(`Heads up: overlaps “${esc(clash[0].it.title)}”.`);
      }
      delete it.needsTime; delete it.defaultedTime; await db.putItem(it);
    }
    if (warn.length) msg += `<div class="warn">${warn.join('<br>')}</div>`;
    botSay({ html: msg, refs: items.map(i => i.id), undoable: true, undo: { type: 'create', ids: items.map(i => i.id) } });
  }
  refresh();
}

function findOpen(q) {
  q = q.toLowerCase();
  const open = S.items.filter(i => (i.type === 'task' || i.type === 'list') && !i.done);
  let best = null, score = 0;
  const qt = q.split(/\W+/).filter(w => w.length > 1);
  for (const i of open) {
    const t = i.title.toLowerCase();
    let s = t === q ? 3 : t.includes(q) || q.includes(t) ? 2 : 0;
    if (!s && qt.length) { const tt = t.split(/\W+/); const hit = qt.filter(w => tt.includes(w)).length; s = hit / qt.length >= 0.5 ? hit / qt.length : 0; }
    if (s > score) { score = s; best = i; }
  }
  return best;
}

function answerQuery(r) {
  if (r.target === 'agenda') {
    const list = agenda(r.range.from, r.range.to);
    const label = r.range.label || fmtDate(r.range.from);
    if (!list.length) return botSay({ html: `<b>${esc(label)}:</b> nothing scheduled. 🎉` });
    botSay({ html: `<b>${esc(label)}</b> — ${list.length} item${list.length > 1 ? 's' : ''}:`, occ: list.map(a => ({ id: a.it.id, start: a.start })) });
  } else if (r.target === 'overdue') {
    const o = overdue();
    botSay({ html: o.length ? `<b>Overdue (${o.length}):</b>` : 'Nothing overdue. Nice.', refs: o.map(i => i.id) });
  } else if (r.target === 'tasks') {
    const t = S.items.filter(i => i.type === 'task' && !i.done).sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15)).slice(0, 15);
    botSay({ html: t.length ? `<b>Open tasks:</b>` : 'No open tasks.', refs: t.map(i => i.id) });
  } else if (r.target === 'list') {
    const t = S.items.filter(i => i.type === 'list' && i.list === r.list && !i.done);
    botSay({ html: t.length ? `<b>${LISTS[r.list]} (${t.length}):</b>` : `Your ${LISTS[r.list].toLowerCase()} list is empty.`, refs: t.map(i => i.id) });
  } else if (r.target === 'notes') {
    const t = S.items.filter(i => i.type === 'note').sort((a, b) => b.created - a.created).slice(0, 8);
    botSay({ html: t.length ? '<b>Recent notes:</b>' : 'No notes yet.', refs: t.map(i => i.id) });
  }
}

async function doUndo(mid) {
  const m = mid ? S.chat.find(x => x.id === mid) : [...S.chat].reverse().find(x => x.undoable && !x.undone);
  if (!m) { botSay({ html: 'Nothing to undo.' }); return; }
  const u = m.undo;
  if (u.type === 'create') for (const id of u.ids) { S.items = S.items.filter(i => i.id !== id); await db.deleteItem(id); }
  if (u.type === 'update') for (const b of u.before) await saveItem(b, { silent: true });
  m.undone = true; m.refs = []; m.html = '<span class="muted">Undone.</span>';
  await saveChat();
  if (!mid) botSay({ html: 'Undone.' });
  refresh();
}

async function completeItem(it, done) {
  if (done && it.recur && it.due != null) {
    const next = occurrences({ start: it.due, recur: it.recur, exdates: it.exdates }, it.due + 60000, it.due + 400 * DAY)[0];
    if (next) { it.due = next.start; await saveItem(it); toast(`Done — next: ${fmtDate(next.start)}`); return; }
  }
  it.done = done; it.doneAt = done ? Date.now() : null; await saveItem(it);
}

// ---------------- TODAY ----------------
function renderToday() {
  const now = Date.now(), sod = startOfDay(now);
  const od = overdue();
  const today = agenda(sod, addDays(sod, 1));
  let html = backupBannerHTML();
  if (od.length) html += `<h3 class="sec danger">Overdue</h3>` + od.map(i => card(i)).join('');
  html += `<h3 class="sec">Today · ${esc(fmtDate(now, { noRelative: true }))}</h3>`;
  html += today.length ? today.map(a => card(a.it, { occ: a.start })).join('') : `<p class="empty">Nothing today. Add something in Chat.</p>`;
  for (let d = 1; d <= 6; d++) {
    const ds = addDays(sod, d); const list = agenda(ds, addDays(ds, 1));
    if (list.length) html += `<h3 class="sec">${esc(fmtDate(ds))}</h3>` + list.map(a => card(a.it, { occ: a.start, compact: true })).join('');
  }
  const undated = S.items.filter(i => i.type === 'task' && !i.done && i.due == null).length;
  const groc = S.items.filter(i => i.type === 'list' && i.list === 'groceries' && !i.done).length;
  html += `<div class="quick">${undated ? `<button class="btn ghost" data-action="goto-list" data-list="tasks">📋 ${undated} undated task${undated > 1 ? 's' : ''}</button>` : ''}${groc ? `<button class="btn ghost" data-action="goto-list" data-list="groceries">🛒 ${groc} grocer${groc > 1 ? 'ies' : 'y'}</button>` : ''}</div>`;
  setHTML($('#view-today'), html);
}
function backupBannerHTML() {
  if (S.items.length < 5) return '';
  const last = S.meta.lastBackup || 0;
  if (Date.now() - last < 7 * DAY) return '';
  return `<div class="banner-inline">💾 ${last ? `Last backup ${Math.floor((Date.now() - last) / DAY)} days ago.` : 'You haven\'t made a backup yet.'} If this phone is lost or the app is deleted, your data goes with it. <button class="btn sm" data-action="backup">Back up now</button></div>`;
}

// ---------------- CALENDAR ----------------
function renderCalendar() {
  const { y, m } = S.cal;
  const first = new Date(y, m, 1), gridStart = new Date(y, m, 1 - first.getDay()).getTime();
  const gridEnd = addDays(gridStart, 42);
  const all = agenda(gridStart, gridEnd);
  const map = {};
  for (const a of all) {
    // multi-day all-day events show on each day
    if (a.it.type === 'event' && a.allDay && a.it.end && a.it.end - a.it.start >= DAY) {
      for (let t = a.start; t <= a.start + (a.it.end - a.it.start); t = addDays(t, 1)) (map[dayKey(t)] ||= []).push(a);
    } else (map[dayKey(a.start)] ||= []).push(a);
  }
  let html = `<div class="cal-head"><button class="btn ghost" data-action="cal-prev" aria-label="Previous month">‹</button><b>${MONTHS_LONG[m]} ${y}</b><button class="btn ghost" data-action="cal-next" aria-label="Next month">›</button><button class="btn sm ghost" data-action="cal-today">Today</button></div>`;
  html += `<div class="cal-grid">${WD_SHORT.map(d => `<div class="cal-wd">${d[0]}</div>`).join('')}`;
  const tk = dayKey(Date.now());
  for (let i = 0; i < 42; i++) {
    const t = addDays(gridStart, i), k = dayKey(t), d = new Date(t);
    const dots = (map[k] || []).slice(0, 4).map(a => `<i data-c="${cat(a.it.category).color}"></i>`).join('');
    html += `<button class="cal-day ${d.getMonth() !== m ? 'out' : ''} ${k === tk ? 'today' : ''} ${k === S.cal.sel ? 'sel' : ''}" data-action="cal-sel" data-day="${k}"><span>${d.getDate()}</span><div class="dots">${dots}</div></button>`;
  }
  html += `</div>`;
  const selT = fromDayKey(S.cal.sel);
  const dayList = agenda(selT, addDays(selT, 1));
  html += `<div class="cal-list"><div class="row-between"><h3 class="sec">${esc(fmtDate(selT))}</h3><button class="btn sm" data-action="new-event" data-day="${S.cal.sel}">+ Add</button></div>`;
  html += dayList.length ? dayList.map(a => card(a.it, { occ: a.start })).join('') : `<p class="empty">Free day.</p>`;
  html += `</div>`;
  setHTML($('#view-calendar'), html);
}

// ---------------- LISTS ----------------
function renderLists() {
  const tab = S.listTab;
  let html = `<div class="seg">${Object.entries(LISTS).map(([k, v]) => `<button class="${k === tab ? 'on' : ''}" data-action="list-tab" data-list="${k}">${v}</button>`).join('')}</div>`;
  let items;
  if (tab === 'tasks') {
    html += catChips('taskCat', S.taskCat);
    items = S.items.filter(i => i.type === 'task' && (S.taskCat === 'all' || i.category === S.taskCat));
    items.sort((a, b) => (a.done - b.done) || ((a.due ?? 9e15) - (b.due ?? 9e15)) || (b.created - a.created));
  } else {
    items = S.items.filter(i => i.type === 'list' && i.list === tab).sort((a, b) => (a.done - b.done) || (b.created - a.created));
  }
  html += `<form class="quick-add" data-form="quick-add"><input name="q" autocomplete="off" enterkeyhint="done" placeholder="Add to ${LISTS[tab]}…"><button class="btn">Add</button></form>`;
  const open = items.filter(i => !i.done), done = items.filter(i => i.done);
  html += open.length ? open.map(i => card(i, { compact: true })).join('') : `<p class="empty">Nothing here.</p>`;
  if (done.length) html += `<div class="row-between"><h3 class="sec muted">Completed (${done.length})</h3><button class="btn sm ghost" data-action="clear-done">Clear</button></div>` + done.slice(0, 50).map(i => card(i, { compact: true })).join('');
  setHTML($('#view-lists'), html);
}
function catChips(stateKey, cur) {
  return `<div class="chips scroll">${[['all', 'All', '']].concat(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label, v.icon])).map(([k, l, ic]) => `<button class="chip ${cur === k ? 'on' : ''}" data-action="chip" data-key="${stateKey}" data-val="${k}">${ic} ${esc(l)}</button>`).join('')}</div>`;
}

// ---------------- NOTES ----------------
function renderNotes() {
  const q = S.noteQ.toLowerCase();
  const notes = S.items.filter(i => i.type === 'note' && (S.noteCat === 'all' || i.category === S.noteCat) && (!q || (i.body || '').toLowerCase().includes(q))).sort((a, b) => b.updated - a.updated);
  let html = `<div class="row-between"><input class="search" data-input="noteQ" type="search" placeholder="Search notes" value="${esc(S.noteQ)}"><button class="btn" data-action="new-note">+ Note</button></div>`;
  html += catChips('noteCat', S.noteCat);
  html += notes.length ? notes.map(n => card(n, { compact: true })).join('') : `<p class="empty">No notes yet. Type <code>note: …</code> in Chat or tap + Note.</p>`;
  const el = $('#view-notes'); const hadFocus = document.activeElement?.dataset?.input === 'noteQ';
  setHTML(el, html);
  if (hadFocus) { const i = $('[data-input="noteQ"]', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

// ---------------- SETTINGS ----------------
async function renderSettings() {
  const n = (t) => S.items.filter(i => i.type === t).length;
  let persisted = false; try { persisted = await navigator.storage?.persisted?.(); } catch { }
  let usage = ''; try { const e = await navigator.storage?.estimate?.(); if (e) usage = `${(e.usage / 1024).toFixed(0)} KB used`; } catch { }
  const notif = ('Notification' in window) ? Notification.permission : 'unsupported';
  const last = S.meta.lastBackup ? fmtDate(S.meta.lastBackup) : 'never';
  const html = `
  <div class="panel"><h3>🔒 Privacy</h3><p>Everything you enter is stored <b>only on this device</b>. LifeManaged has no server, no account, no analytics, and is blocked (by its security policy) from sending data anywhere. The only network traffic is your phone downloading the app's own code from GitHub Pages when it updates.</p>
  <p class="muted">${S.items.length} items · ${n('event')} events · ${n('task')} tasks · ${n('list')} list items · ${n('note')} notes · ${usage}</p>
  <p>${persisted ? '✅ Storage is marked persistent.' : `<button class="btn sm" data-action="persist">Protect storage from cleanup</button>`}</p></div>

  <div class="panel"><h3>🚀 Getting started</h3>
  <button class="btn full" data-action="braindump">🧠 Brain dump — add lots at once</button>
  <button class="btn full ghost" data-action="import-ics">📥 Import Google Calendar (.ics)</button></div>

  <div class="panel"><h3>💾 Backup</h3><p class="muted">Last backup: ${esc(last)}. Save the file to the Files app (or iCloud Drive). Add a password so the file is encrypted.</p>
  <button class="btn full" data-action="backup">Export backup</button>
  <button class="btn full ghost" data-action="restore">Restore from backup</button></div>

  <div class="panel"><h3>🔔 Reminders</h3>
  <p class="muted">iPhone web apps can only alert you while LifeManaged is open or was opened recently. For must-not-miss items, open the item and tap <b>Add to iPhone Calendar</b> — iOS will then alert you even when this app is closed.</p>
  <p>Notifications: <b>${esc(notif)}</b> ${notif === 'default' ? '<button class="btn sm" data-action="notif">Enable</button>' : ''}</p>
  <button class="btn full ghost" data-action="export-ics">Export upcoming events to iPhone Calendar</button></div>

  <div class="panel danger-zone"><h3>⚠️ Danger zone</h3><button class="btn full danger" data-action="erase">Erase all data…</button></div>
  <p class="muted center">LifeManaged v${APP_VERSION} · local-only</p>`;
  $('#view-settings').innerHTML = html;
}

// ---------------- view switching ----------------
const TITLES = { chat: 'LifeManaged', today: 'Today', calendar: 'Calendar', lists: 'Lists', notes: 'Notes', settings: 'Settings' };
function show(view) {
  S.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#viewTitle').textContent = TITLES[view];
  refresh();
  if (view !== 'chat') $('#views').scrollTop = 0;
}
function refresh() {
  const v = S.view;
  if (v === 'chat') renderChat();
  if (v === 'today') renderToday();
  if (v === 'calendar') renderCalendar();
  if (v === 'lists') renderLists();
  if (v === 'notes') renderNotes();
  if (v === 'settings') renderSettings();
  updateBadge();
}

// ---------------- bottom sheet (modal) ----------------
function openSheet(html, onMount) {
  const sh = $('#sheet');
  setHTML($('#sheetBody'), html);
  sh.classList.remove('hidden'); document.body.classList.add('sheet-open');
  onMount && onMount($('#sheetBody'));
}
function closeSheet() { $('#sheet').classList.add('hidden'); document.body.classList.remove('sheet-open'); $('#sheetBody').innerHTML = ''; }

const REPEAT_OPTS = [['', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Every weekday (Mon–Fri)'], ['weekly', 'Weekly (pick days)'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];
function recurToOpt(r) {
  if (!r) return '';
  if (r.freq === 'weekly' && r.interval === 2) return 'biweekly';
  if (r.freq === 'weekly' && r.byday && r.byday.slice().sort().join() === '1,2,3,4,5') return 'weekdays';
  return r.freq;
}

function openEditor(it, { occ, isNew } = {}) {
  const t = it.type;
  const catOpts = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${v.icon} ${esc(v.label)}</option>`).join('');
  const typeOpts = Object.entries({ event: 'Event', task: 'Task', note: 'Note', list: 'List item' }).map(([k, v]) => `<option value="${k}" ${t === k ? 'selected' : ''}>${v}</option>`).join('');
  const when = t === 'event' ? it.start : it.due;
  const dateV = when != null ? toInputDate(when) : '', timeV = when != null && (t === 'event' ? !it.allDay : it.hasTime) ? toInputTime(when) : '';
  const endV = t === 'event' && it.end && !it.allDay ? toInputTime(it.end) : '';
  const rOpt = recurToOpt(it.recur);
  const byday = it.recur?.byday || (when != null ? [new Date(when).getDay()] : []);
  const html = `
  <div class="sheet-head"><b>${isNew ? 'New' : 'Edit'} ${t === 'list' ? 'list item' : t}</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
  <form data-form="edit" class="form">
    <div class="grid2"><label>Type<select name="type">${typeOpts}</select></label><label>Category<select name="category">${catOpts}</select></label></div>
    ${t === 'note' ? `<label>Note<textarea name="body" rows="10">${esc(it.body || '')}</textarea></label>` : `<label>Title<input name="title" value="${esc(it.title || '')}" required></label>`}
    ${t === 'list' ? `<label>List<select name="list">${['groceries', 'shopping', 'books'].map(l => `<option value="${l}" ${it.list === l ? 'selected' : ''}>${LISTS[l]}</option>`).join('')}</select></label>` : ''}
    ${t === 'event' || t === 'task' ? `
      <div class="grid2"><label>${t === 'event' ? 'Date' : 'Due date'}<input type="date" name="date" value="${dateV}"></label>
      <label>${t === 'event' ? 'Start time' : 'Time'}<input type="time" name="time" value="${timeV}"></label></div>
      ${t === 'event' ? `<div class="grid2"><label>End time<input type="time" name="endTime" value="${endV}"></label>
        <label>Alert<select name="remindMins">${[['', 'None'], ['0', 'At start'], ['5', '5 min before'], ['15', '15 min before'], ['30', '30 min before'], ['60', '1 hour before'], ['1440', '1 day before']].map(([v, l]) => `<option value="${v}" ${String(it.remindMins ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <p class="muted small">Leave times blank for an all-day event.</p>` : `<label class="inline"><input type="checkbox" name="remind" ${it.remind ? 'checked' : ''}> Remind me at this time</label>`}
      <label>Repeat<select name="repeat">${REPEAT_OPTS.map(([v, l]) => `<option value="${v}" ${rOpt === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="wdays ${rOpt === 'weekly' || rOpt === 'biweekly' ? '' : 'hidden'}">${WD_SHORT.map((d, i) => `<label><input type="checkbox" name="wd" value="${i}" ${byday.includes(i) ? 'checked' : ''}><span>${d[0]}</span></label>`).join('')}</div>
      <label>Repeat until (optional)<input type="date" name="until" value="${it.recur?.until ? toInputDate(it.recur.until) : ''}"></label>` : ''}
    ${t === 'list' ? `<label>Needed by (optional)<input type="date" name="date" value="${dateV}"></label>` : ''}
    ${t !== 'note' ? `<label>Details<textarea name="notes" rows="3">${esc(it.notes || '')}</textarea></label>` : ''}
    ${t === 'task' || t === 'list' ? `<label class="inline"><input type="checkbox" name="done" ${it.done ? 'checked' : ''}> Completed</label>` : ''}
    <div class="sheet-actions">
      <button class="btn" type="submit">Save</button>
      ${(t === 'event' || (t === 'task' && it.due != null)) && !isNew ? `<button class="btn ghost" type="button" data-action="add-to-ical" data-id="${it.id}">📲 Add to iPhone Calendar</button>` : ''}
      ${!isNew && it.recur && occ != null ? `<button class="btn ghost" type="button" data-action="skip-occ" data-id="${it.id}" data-occ="${occ}">Skip just ${esc(fmtDate(+occ))}</button>` : ''}
      ${!isNew ? `<button class="btn danger ghost" type="button" data-action="delete" data-id="${it.id}">Delete${it.recur ? ' (all repeats)' : ''}</button>` : ''}
    </div>
  </form>`;
  openSheet(html, (root) => {
    const form = $('form', root);
    form._item = it; form._isNew = isNew;
    form.repeat?.addEventListener('change', () => $('.wdays', root).classList.toggle('hidden', !['weekly', 'biweekly'].includes(form.repeat.value)));
    form.type.addEventListener('change', () => {
      const draft = readEditForm(form, structuredClone(it)); draft.type = form.type.value;
      if (draft.type === 'note' && !draft.body) draft.body = draft.title || '';
      if (draft.type !== 'note' && !draft.title) draft.title = (draft.body || '').split('\n')[0].slice(0, 80);
      if (draft.type === 'list' && !draft.list) draft.list = 'shopping';
      if (draft.type === 'event' && draft.start == null) { draft.start = draft.due ?? startOfDay(Date.now()); draft.allDay = !draft.hasTime; }
      if (draft.type === 'task' && draft.due == null && draft.start != null) { draft.due = draft.start; draft.hasTime = !draft.allDay; }
      openEditor(draft, { occ, isNew });
    });
  });
}

function readEditForm(form, it) {
  const f = form.elements; const t = it.type;
  if (f.category) it.category = f.category.value;
  if (f.title) it.title = f.title.value.trim();
  if (f.body) it.body = f.body.value;
  if (f.notes) it.notes = f.notes.value;
  if (f.list) it.list = f.list.value;
  if (f.done) { it.done = f.done.checked; }
  const dv = f.date?.value, tv = f.time?.value;
  const mk = (d, tm) => { const [y, m, dd] = d.split('-').map(Number); if (!tm) return new Date(y, m - 1, dd).getTime(); const [h, mi] = tm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
  if (t === 'event') {
    if (dv) {
      const oldDur = it.end && it.start ? it.end - it.start : 3600000;
      it.start = mk(dv, tv); it.allDay = !tv;
      const ev = f.endTime?.value;
      if (tv && ev) { let e = mk(dv, ev); if (e <= it.start) e += DAY; it.end = e; }
      else if (tv) it.end = it.start + (oldDur > 0 && oldDur < DAY ? oldDur : 3600000);
      else it.end = null;
    }
    it.remindMins = f.remindMins?.value === '' ? null : Number(f.remindMins.value);
  } else if (t === 'task') {
    it.due = dv ? mk(dv, tv) : null; it.hasTime = !!(dv && tv); it.remind = !!(f.remind?.checked && it.hasTime);
  } else if (t === 'list') {
    it.due = dv ? mk(dv, '') : null; it.hasTime = false;
  }
  if (f.repeat) {
    const r = f.repeat.value; const untilV = f.until?.value;
    const wds = [...form.querySelectorAll('input[name="wd"]:checked')].map(x => +x.value);
    const base = t === 'event' ? it.start : it.due;
    if (!r || base == null) it.recur = null;
    else {
      const rec = r === 'weekdays' ? { freq: 'weekly', interval: 1, byday: [1, 2, 3, 4, 5] }
        : r === 'biweekly' ? { freq: 'weekly', interval: 2, byday: wds.length ? wds : [new Date(base).getDay()] }
        : r === 'weekly' ? { freq: 'weekly', interval: 1, byday: wds.length ? wds : [new Date(base).getDay()] }
        : { freq: r, interval: 1, ...(r === 'monthly' && it.recur?.nth ? { nth: it.recur.nth } : {}) };
      if (untilV) { const [y, m, d] = untilV.split('-').map(Number); rec.until = new Date(y, m - 1, d, 23, 59).getTime(); }
      it.recur = rec;
    }
  }
  return it;
}

// ---------------- file helpers (iOS-friendly) ----------------
async function saveFile(content, name, type) {
  const file = new File([content], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
function openCalendarFile(content, name) {
  // Opening a text/calendar file lets iOS show its "Add to Calendar" screen.
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function pickFile(inputId) {
  return new Promise(res => {
    const inp = $(inputId); inp.value = '';
    inp.onchange = () => res([...inp.files]); inp.click();
  });
}
const readText = (f) => f.text();

// ---------------- backup / restore ----------------
function backupFlow() {
  openSheet(`<div class="sheet-head"><b>Export backup</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
  <form data-form="backup" class="form"><p>Creates one file with everything. Save it to <b>Files → iCloud Drive or On My iPhone</b>.</p>
  <label>Password (recommended)<input type="password" name="pw" autocomplete="new-password" placeholder="Leave blank for an unencrypted file"></label>
  <label>Confirm password<input type="password" name="pw2" autocomplete="new-password"></label>
  <p class="muted small">There's no password recovery — if you forget it, that backup can't be opened.</p>
  <div class="sheet-actions"><button class="btn" type="submit">Create backup</button></div></form>`);
}
async function doBackup(pw) {
  const data = { app: 'LifeManaged', appVersion: APP_VERSION, exported: Date.now(), items: S.items, meta: (await db.allMeta()).filter(m => m.key !== 'notified') };
  const text = await makeBackup(data, pw);
  const d = new Date(); const name = `LifeManaged-backup-${dayKey(d)}${pw ? '-encrypted' : ''}.json`;
  const ok = await saveFile(text, name, 'application/json');
  if (ok) { await setMeta('lastBackup', Date.now()); toast('Backup created'); }
  closeSheet(); refresh();
}
async function restoreFlow() {
  const [f] = await pickFile('#fileBackup'); if (!f) return;
  const text = await readText(f);
  const go = async (pw) => {
    let data; try { data = await readBackup(text, pw); } catch (e) { return toast(e.message, true); }
    const count = data.items?.length || 0;
    openSheet(`<div class="sheet-head"><b>Restore backup</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
      <p>This backup has <b>${count}</b> items (from ${esc(fmtDate(data.exported || Date.now()))}).</p>
      <div class="sheet-actions"><button class="btn" data-action="restore-merge">Merge with what's here</button>
      <button class="btn danger ghost" data-action="restore-replace">Replace everything here</button></div>`);
    S._pendingRestore = data;
  };
  if (isEncrypted(text)) {
    openSheet(`<div class="sheet-head"><b>Password needed</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
      <form data-form="restore-pw" class="form"><label>Backup password<input type="password" name="pw" autocomplete="current-password"></label><div class="sheet-actions"><button class="btn" type="submit">Unlock</button></div></form>`,
      (root) => { $('form', root)._go = go; });
  } else go(null);
}
async function applyRestore(mode) {
  const data = S._pendingRestore; if (!data) return;
  if (mode === 'replace') {
    if (!confirm('Replace ALL current data with this backup? Current data will be lost.')) return;
    await db.replaceAll(data.items || [], data.meta || []);
  } else {
    const have = new Map(S.items.map(i => [i.id, i]));
    const merged = (data.items || []).filter(i => !have.has(i.id) || (have.get(i.id).updated || 0) < (i.updated || 0));
    await db.putItems(merged);
  }
  S._pendingRestore = null; closeSheet(); await loadAll(); toast('Restore complete'); show(S.view);
}

// ---------------- Google Calendar import ----------------
async function importIcsFlow() {
  const files = await pickFile('#fileIcs'); if (!files.length) return;
  let events = [], skipped = 0, total = 0;
  for (const f of files) {
    try { const r = parseICS(await readText(f), { skipOlderThanDays: 30 }); events = events.concat(r.events); skipped += r.skipped; total += r.total; }
    catch (e) { console.error(e); toast(`Couldn't read ${f.name}`, true); }
  }
  if (!events.length) return toast(total ? `All ${total} events were old or cancelled — nothing to import.` : 'No events found in that file.', true);
  S._pendingIcs = events;
  const catOpts = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v.icon} ${esc(v.label)}</option>`).join('');
  openSheet(`<div class="sheet-head"><b>Import calendar</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
    <form data-form="ics" class="form"><p>Found <b>${events.length}</b> current/upcoming events${skipped ? ` (skipped ${skipped} old or cancelled)` : ''} in ${files.length} file${files.length > 1 ? 's' : ''}.</p>
    <label class="inline"><input type="checkbox" name="auto" checked> Auto-sort into categories by keywords (thermo → School, AGC → AGC…)</label>
    <label>Everything else goes to<select name="cat">${catOpts.replace('value="personal"', 'value="personal" selected')}</select></label>
    <p class="muted small">Re-importing the same file updates events instead of duplicating them.</p>
    <div class="sheet-actions"><button class="btn" type="submit">Import ${events.length} events</button></div></form>`);
}
async function applyIcs(auto, fallbackCat) {
  const evs = S._pendingIcs || []; const byUid = new Map(S.items.filter(i => i.icsUid).map(i => [i.icsUid, i]));
  const toSave = [];
  for (const e of evs) {
    const category = (auto && detectCategory(e.title + ' ' + (e.notes || ''))) || fallbackCat;
    const existing = e.icsUid && byUid.get(e.icsUid);
    if (existing) toSave.push({ ...existing, ...e, id: existing.id, category: existing.category || category, updated: Date.now() });
    else toSave.push(newItem({ ...e, category }, 'ics'));
  }
  await db.putItems(toSave); S._pendingIcs = null; closeSheet(); await loadAll();
  toast(`Imported ${toSave.length} events`); botSay({ html: `📥 Imported <b>${toSave.length}</b> calendar events. Check the Calendar tab.` }); show('calendar');
}

// ---------------- brain dump ----------------
function brainDumpFlow() {
  openSheet(`<div class="sheet-head"><b>🧠 Brain dump</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
  <form data-form="dump" class="form"><p>One thing per line. Paste from Notes or use the keyboard mic 🎤. You'll review everything before it's saved.</p>
  <textarea name="dump" rows="12" placeholder="Thermo MWF 10-10:50am
Statics TTh 12:30-1:50pm
gym every mon wed fri at 6am
RRR meeting every thursday at 7pm
AGC meeting every other tuesday at 6pm
thermo exam dec 3 at 9:30am
buy eggs, rice, chicken
need a new calculator
want to read Atomic Habits
5 year plan: graduate, …"></textarea>
  <details><summary>Prompts to jog your memory</summary><ul class="small">
  <li>Every class + its days/times</li><li>Exams, project due dates</li><li>Workout schedule</li><li>Red Raider Racing meetings, build nights, deadlines</li>
  <li>AGC meetings / events</li><li>Work shifts, recurring commitments</li><li>Birthdays (add "every year")</li><li>Things to buy, groceries</li><li>Books to read</li><li>Big goals (1-year, 5-year)</li></ul></details>
  <div class="sheet-actions"><button class="btn" type="submit">Preview</button></div></form>`);
}
function previewDump(text) {
  const lines = text.split(LINE_SPLIT).map(l => l.replace(/^\s*(?:[-•*▪◦]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const specs = [];
  for (const l of lines) {
    const r = parse(l);
    if (r && r.kind === 'create') for (const s of r.items) specs.push(s);
    else specs.push({ type: 'note', body: l, category: detectCategory(l) || 'personal' });
  }
  S._pendingDump = specs.map(s => newItem(s, 'braindump'));
  const rows = S._pendingDump.map((it, i) => `<label class="dump-row"><input type="checkbox" name="keep" value="${i}" checked>${card(it, { compact: true, actions: false })}</label>`).join('');
  openSheet(`<div class="sheet-head"><b>Review ${S._pendingDump.length} items</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
    <form data-form="dump-save" class="form"><p class="muted small">Uncheck anything wrong. You can tap-edit items later.</p>${rows}
    <div class="sheet-actions"><button class="btn" type="submit">Add checked items</button></div></form>`);
}

// ---------------- erase all ----------------
function eraseFlow() {
  openSheet(`<div class="sheet-head"><b class="danger-text">Erase all data</b><button class="btn sm ghost" data-action="close-sheet">✕</button></div>
  <div class="form"><p>This permanently deletes <b>all ${S.items.length} items</b>, your chat history, and settings from this phone. <b>It cannot be undone.</b></p>
  <button class="btn full" data-action="backup">💾 Make a backup first</button>
  <label><span>Type <b>DELETE</b> to continue</span><input name="confirm" id="eraseConfirm" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
  <button class="btn full danger hold" id="eraseHold" disabled><span class="fill"></span><span class="lbl">Hold for 3 seconds to erase</span></button></div>`, (root) => {
    const inp = $('#eraseConfirm', root), btn = $('#eraseHold', root);
    inp.addEventListener('input', () => { btn.disabled = inp.value.trim() !== 'DELETE'; });
    let timer = null;
    const start = (e) => { if (btn.disabled) return; e.preventDefault(); btn.classList.add('holding'); timer = setTimeout(doErase, 3000); };
    const stop = () => { btn.classList.remove('holding'); clearTimeout(timer); };
    btn.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });
}
async function doErase() {
  await db.clearAll();
  S.items = []; S.chat = []; S.meta = {}; S.undo = [];
  closeSheet(); toast('All data erased'); welcome(); show('chat');
}

// ---------------- reminders (while app is open) ----------------
async function checkReminders() {
  const now = Date.now(); const due = [];
  for (const it of S.items) {
    if (it.type === 'task' && it.remind && it.hasTime && !it.done && it.due != null && it.due <= now && it.due > now - 2 * DAY) {
      const k = it.id + ':' + it.due; if (!S.notified[k]) { S.notified[k] = now; due.push({ it, msg: `⏰ ${it.title}` }); }
    }
    if (it.type === 'event' && it.remindMins != null && !it.allDay) {
      for (const o of occurrences(it, now - 3600000, now + 2 * DAY)) {
        const fire = o.start - it.remindMins * 60000;
        const k = it.id + ':' + o.start;
        if (fire <= now && o.start + 10 * 60000 > now && !S.notified[k]) { S.notified[k] = now; due.push({ it, msg: `📅 ${it.title} — ${fmtTime(o.start)}` }); }
      }
    }
  }
  if (!due.length) return;
  for (const k of Object.keys(S.notified)) if (S.notified[k] < now - 3 * DAY) delete S.notified[k];
  db.setMeta('notified', S.notified);
  for (const d of due) {
    toast(d.msg);
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker?.ready; reg?.showNotification('LifeManaged', { body: d.msg.replace(/^\W+/, ''), tag: d.it.id });
      }
    } catch { }
  }
  updateBadge();
}
function updateBadge() {
  try { const n = overdue().length; if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch { }
}

// ---------------- toast ----------------
let toastT;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', 3500);
}

// ---------------- events ----------------
function wire() {
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
  $('#settingsBtn').addEventListener('click', () => show(S.view === 'settings' ? 'chat' : 'settings'));

  const input = $('#chatInput');
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; autosize(); handleInput(v); });
  input.addEventListener('focus', () => document.body.classList.add('typing'));
  input.addEventListener('blur', () => setTimeout(() => document.body.classList.remove('typing'), 100));
  document.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => b.dataset.say === '__dump' ? brainDumpFlow() : handleInput(b.dataset.say)));

  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action, id = el.dataset.id;
    if (el.closest('.dump-row') && a !== 'toggle') return; // inside brain-dump preview, let the checkbox label work
    if (a === 'toggle') { e.stopPropagation(); const it = byId(id); if (it) await completeItem(it, !it.done); return; }
    if (a === 'edit') { const it = byId(id); if (it) openEditor(structuredClone(it), { occ: el.dataset.occ }); return; }
    switch (a) {
      case 'close-sheet': closeSheet(); break;
      case 'undo-msg': await doUndo(el.dataset.mid); break;
      case 'goto-list': S.listTab = el.dataset.list; show('lists'); break;
      case 'list-tab': S.listTab = el.dataset.list; renderLists(); break;
      case 'chip': S[el.dataset.key] = el.dataset.val; refresh(); break;
      case 'cal-prev': S.cal.m--; if (S.cal.m < 0) { S.cal.m = 11; S.cal.y--; } renderCalendar(); break;
      case 'cal-next': S.cal.m++; if (S.cal.m > 11) { S.cal.m = 0; S.cal.y++; } renderCalendar(); break;
      case 'cal-today': { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth(), sel: dayKey(n) }; renderCalendar(); break; }
      case 'cal-sel': S.cal.sel = el.dataset.day; renderCalendar(); break;
      case 'new-event': { const t = fromDayKey(el.dataset.day); openEditor(newItem({ type: 'event', title: '', category: 'personal', start: new Date(t).setHours(12), allDay: false, end: new Date(t).setHours(13), remindMins: 15 }, 'manual'), { isNew: true }); break; }
      case 'new-note': openEditor(newItem({ type: 'note', body: '', category: S.noteCat === 'all' ? 'personal' : S.noteCat }, 'manual'), { isNew: true }); break;
      case 'clear-done': {
        const tab = S.listTab; const ids = S.items.filter(i => i.done && (tab === 'tasks' ? i.type === 'task' : i.type === 'list' && i.list === tab)).map(i => i.id);
        if (ids.length && confirm(`Delete ${ids.length} completed item${ids.length > 1 ? 's' : ''}?`)) { for (const x of ids) await db.deleteItem(x); S.items = S.items.filter(i => !ids.includes(i.id)); refresh(); }
        break;
      }
      case 'delete': { const it = byId(id); if (it && confirm(`Delete “${itemTitle(it)}”?`)) { await removeItem(id); closeSheet(); toast('Deleted'); } break; }
      case 'skip-occ': { const it = byId(id); if (it) { it.exdates = [...(it.exdates || []), dayKey(+el.dataset.occ)]; await saveItem(it); closeSheet(); toast('Skipped that date'); } break; }
      case 'add-to-ical': { const it = byId(id); if (it) openCalendarFile(toICS([it]), `${(itemTitle(it) || 'event').replace(/[^\w\- ]+/g, '').slice(0, 40) || 'event'}.ics`); break; }
      case 'export-ics': {
        const now = Date.now();
        const up = S.items.filter(i => (i.type === 'event' && (i.recur ? (!i.recur.until || i.recur.until > now) : (i.end || i.start) > now)) || (i.type === 'task' && i.due && i.due > now && !i.done));
        if (!up.length) toast('No upcoming events to export', true); else openCalendarFile(toICS(up), 'LifeManaged-upcoming.ics');
        break;
      }
      case 'backup': backupFlow(); break;
      case 'restore': restoreFlow(); break;
      case 'restore-merge': applyRestore('merge'); break;
      case 'restore-replace': applyRestore('replace'); break;
      case 'import-ics': importIcsFlow(); break;
      case 'braindump': brainDumpFlow(); break;
      case 'erase': eraseFlow(); break;
      case 'persist': try { const ok = await navigator.storage.persist(); toast(ok ? 'Storage protected' : 'iOS decided this automatically — add the app to your Home Screen for best protection'); } catch { } renderSettings(); break;
      case 'notif': try { await Notification.requestPermission(); } catch { } renderSettings(); break;
      case 'reload-update': navigator.serviceWorker?.getRegistration().then(r => r?.waiting?.postMessage('SKIP_WAITING')); break;
    }
  });

  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.input; if (k === 'noteQ') { S.noteQ = e.target.value; renderNotes(); }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target; const kind = form.dataset.form; if (!kind || form.id === 'chatForm') return;
    e.preventDefault();
    if (kind === 'quick-add') {
      const v = form.q.value.trim(); if (!v) return; form.q.value = '';
      const tab = S.listTab;
      if (tab === 'tasks') {
        const r = parse(v); let spec = r?.kind === 'create' && r.items[0].type === 'task' ? r.items[0] : { type: 'task', title: v.charAt(0).toUpperCase() + v.slice(1), category: 'personal', due: null };
        if (S.taskCat !== 'all' && spec.category === 'personal') spec.category = S.taskCat;
        await saveItem(newItem(spec, 'manual'));
      } else {
        const parts = v.split(/\s*,\s*/).filter(Boolean);
        for (const p of parts) await saveItem(newItem({ type: 'list', list: tab, title: p.charAt(0).toUpperCase() + p.slice(1), category: tab === 'groceries' ? 'food' : tab }, 'manual'), { silent: true });
        refresh();
      }
      $('[data-form="quick-add"] input')?.focus();
    }
    if (kind === 'edit') {
      const it = readEditForm(form, form._item);
      if (it.type !== 'note' && !it.title) return toast('Give it a title', true);
      if (it.type === 'note' && !it.body.trim()) return toast('Note is empty', true);
      if (it.type === 'event' && it.start == null) return toast('Pick a date', true);
      await saveItem(it); closeSheet(); toast(form._isNew ? 'Added' : 'Saved');
    }
    if (kind === 'backup') {
      const pw = form.pw.value; if (pw !== form.pw2.value) return toast("Passwords don't match", true);
      await doBackup(pw || null);
    }
    if (kind === 'restore-pw') form._go(form.pw.value);
    if (kind === 'ics') applyIcs(form.auto.checked, form.cat.value);
    if (kind === 'dump') { const t = form.dump.value.trim(); if (t) previewDump(t); }
    if (kind === 'dump-save') {
      const keep = [...form.querySelectorAll('input[name="keep"]:checked')].map(x => +x.value);
      const items = keep.map(i => S._pendingDump[i]);
      await db.putItems(items); S.items.push(...items); S._pendingDump = null; closeSheet();
      botSay({ html: `🧠 Added <b>${items.length}</b> items from your brain dump.`, undoable: true, undo: { type: 'create', ids: items.map(i => i.id) } });
      toast(`Added ${items.length} items`); refresh();
    }
  });

  // keep layout correct when the iOS keyboard opens
  const vv = window.visualViewport;
  const fit = () => document.documentElement.style.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px');
  vv?.addEventListener('resize', fit); window.addEventListener('resize', fit); fit();
  vv?.addEventListener('resize', () => { if (S.view === 'chat') $('#chatLog').scrollTop = 1e9; window.scrollTo(0, 0); });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); refresh(); } });
  setInterval(checkReminders, 20000);
}

// ---------------- service worker (offline + updates) ----------------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = () => { const b = $('#banner'); b.innerHTML = `✨ Update ready. <button class="btn sm" data-action="reload-update">Restart app</button>`; b.classList.remove('hidden'); };
    if (reg.waiting && navigator.serviceWorker.controller) offer();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(); });
    });
  }).catch(err => console.warn('SW failed', err));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

// ---------------- boot ----------------
function welcome() {
  S.chat = [];
  botSay({ html: `👋 <b>Welcome to LifeManaged.</b> Everything you tell me stays on this phone — nothing is ever sent anywhere.<br><br>
  Fastest way to get set up:<br>1️⃣ Tap <b>🧠 Brain dump</b> below and list your classes, workouts, meetings, and to-dos, one per line.<br>2️⃣ (Optional) Import your Google Calendar in ⚙️ Settings.<br>3️⃣ Make a backup in ⚙️ Settings once you've added a bunch.<br><br>After that, just text me anything. Tap <b>Help</b> for examples.` });
}
async function loadAll() {
  S.items = await db.allItems();
  S.chat = await db.getMeta('chat', []);
  S.notified = await db.getMeta('notified', {});
  S.meta.lastBackup = await db.getMeta('lastBackup', 0);
}
async function boot() {
  wire();
  try { await loadAll(); } catch (e) { console.error(e); toast('Storage unavailable — is Private Browsing on?', true); }
  if (!S.chat.length) welcome();
  show('chat');
  checkReminders();
  registerSW();
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) navigator.storage.persist(); } catch { }
  if (!window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone && /iPhone|iPad/.test(navigator.userAgent) && !sessionStorage.getItem('a2hs')) {
    sessionStorage.setItem('a2hs', '1');
    setTimeout(() => toast('Tip: tap Share → “Add to Home Screen” to install LifeManaged'), 1500);
  }
}
boot();
