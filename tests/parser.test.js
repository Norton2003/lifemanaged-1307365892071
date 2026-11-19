// Run: node tests/parser.test.js   (uses a fixed "now": Thu Nov 19 2026, 3:30 PM)
import { parse } from '../js/parser.js';
import { occurrences, dayKey } from '../js/dates.js';

const NOW = new Date(2026, 10, 19, 15, 30).getTime();
let pass = 0, fail = 0;
const D = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
function check(input, expect) {
  const r = parse(input, NOW);
  const it = r && r.items ? r.items[0] : r;
  const errs = [];
  for (const [k, v] of Object.entries(expect)) {
    let got = k === 'kind' ? r?.kind : k === 'count' ? r?.items?.length : k === 'titles' ? r?.items?.map(i => i.title) : k === 'byday' ? it?.recur?.byday : k === 'freq' ? it?.recur?.freq : it?.[k];
    if (JSON.stringify(got) !== JSON.stringify(v)) errs.push(`${k}: expected ${JSON.stringify(v)} got ${JSON.stringify(got)}`);
  }
  if (errs.length) { fail++; console.log('✗', input, '\n   ', errs.join('\n    '), '\n    full:', JSON.stringify(r)); }
  else pass++;
}

check('buddies invited me to hang out saturday at 7', { type: 'event', start: D(2026, 11, 21, 19), category: 'personal', title: 'Buddies invited me to hang out' });
check('i need to buy a new calculator', { type: 'list', list: 'shopping', title: 'New calculator' });
check('buy eggs, milk and bread', { type: 'list', list: 'groceries', count: 3, titles: ['Eggs', 'Milk', 'Bread'] });
check('remind me to email Dr. Liu tomorrow at 9am', { type: 'task', due: D(2026, 11, 20, 9), remind: true, title: 'Email Dr. Liu' });
check('remind me to call mom tomorrow', { type: 'task', due: D(2026, 11, 20, 9), remind: true });
check('thermo exam dec 3', { type: 'event', allDay: true, start: D(2026, 12, 3), category: 'school', title: 'Thermo exam' });
check('thermo exam on 12/3 at 9:30am', { type: 'event', start: D(2026, 12, 3, 9, 30), category: 'school' });
check('rrr design review friday 6-8pm', { type: 'event', start: D(2026, 11, 20, 18), end: D(2026, 11, 20, 20), category: 'rrr' });
check('gym every mon wed fri at 6am', { type: 'event', start: D(2026, 11, 20, 6), freq: 'weekly', byday: [1, 3, 5], category: 'workouts' });
check('leg day mwf 6am', { type: 'event', byday: [1, 3, 5], category: 'workouts' });
check('AGC meeting every tuesday at 7pm', { type: 'event', start: D(2026, 11, 24, 19), byday: [2], category: 'agc' });
check('turn in thermo hw by friday', { type: 'task', due: D(2026, 11, 20), category: 'school', title: 'Turn in thermo hw' });
check('note: radiator ducting idea - angle the inlet 15 deg', { type: 'note', category: 'rrr' });
check('idea for a 5 year plan: start a fab shop', { type: 'note' });
check('want to read Atomic Habits', { type: 'list', list: 'books', title: 'Atomic Habits' });
check('ran 3 miles in 24 min', { type: 'note', category: 'workouts' });
check('add chicken and rice to grocery list', { type: 'list', list: 'groceries', count: 2 });
check('what do i have tomorrow', { kind: 'query', target: 'agenda' });
check('this week', { kind: 'query', target: 'agenda' });
check('groceries', { kind: 'query', target: 'list', list: 'groceries' });
check('bought eggs', { kind: 'done', q: 'eggs' });
check('study for thermo tonight', { type: 'event', start: D(2026, 11, 19, 20), category: 'school' });
check('remind me in 2 hours to move laundry', { type: 'task', due: NOW + 2 * 3600000, remind: true, title: 'Move laundry' });
check('dentist appointment next tuesday at 2', { type: 'event', start: D(2026, 12, 1, 14) });
check('call mom at 5', { type: 'task', due: D(2026, 11, 19, 17), remind: true, title: 'Call mom' });
check('pay rent on the 1st', { type: 'task', due: D(2026, 12, 1) });
check('lunch with Jake at noon tomorrow', { type: 'event', start: D(2026, 11, 20, 12) });
check('class MWF 10-10:50am', { type: 'event', start: D(2026, 11, 20, 10), end: D(2026, 11, 20, 10, 50), byday: [1, 3, 5] });
check('mom birthday march 14 every year', { type: 'event', allDay: true, start: D(2027, 3, 14), freq: 'yearly' });
check('finish lab report', { type: 'task', category: 'school', due: null });
check('undo', { kind: 'undo' });
check('search radiator', { kind: 'search', q: 'radiator' });

check('gym at 6', { type: 'event', start: D(2026, 11, 20, 6) });
check('class at 3 tomorrow', { type: 'event', start: D(2026, 11, 20, 15) });
check('dinner with the team at 8 saturday', { type: 'event', start: D(2026, 11, 21, 20) });
check('meeting with advisor at 10 on monday', { type: 'event', start: D(2026, 11, 23, 10) });
check('need a new calculator', { type: 'list', list: 'shopping', title: 'New calculator' });
check('get my haircut friday', { type: 'task' });
check('workout: bench 3x5 185', { type: 'note', category: 'workouts' });
check('5 year plan: graduate, start fab shop, buy land', { type: 'note' });
// recurrence
const ev = { start: D(2026, 11, 20, 6), end: D(2026, 11, 20, 7), recur: { freq: 'weekly', interval: 1, byday: [1, 3, 5] }, exdates: ['2026-11-25'] };
const occ = occurrences(ev, D(2026, 11, 16), D(2026, 11, 30)).map(o => dayKey(o.start));
if (JSON.stringify(occ) === JSON.stringify(['2026-11-20', '2026-11-23', '2026-11-27'])) pass++; else { fail++; console.log('✗ weekly occurrences', occ); }
const m = occurrences({ start: D(2026, 1, 13, 18), recur: { freq: 'monthly', interval: 1, nth: { n: 2, wd: 2 } } }, D(2026, 12, 1), D(2027, 1, 1)).map(o => dayKey(o.start));
if (JSON.stringify(m) === JSON.stringify(['2026-12-08'])) pass++; else { fail++; console.log('✗ monthly nth', m); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
