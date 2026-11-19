// LifeManaged offline parser. Turns plain English into structured items.
// No network, no AI model: rules + date parsing. Edit KEYWORDS to tune categories.

export const CATEGORIES = {
  school:   { label: 'School',             icon: '🎓', color: '#4f8cff' },
  rrr:      { label: 'Red Raider Racing',  icon: '🏎️', color: '#e5383b' },
  agc:      { label: 'AGC',                icon: '🏗️', color: '#f4a261' },
  workouts: { label: 'Workouts',           icon: '💪', color: '#2ec4b6' },
  books:    { label: 'Books',              icon: '📚', color: '#a06cd5' },
  food:     { label: 'Food',               icon: '🛒', color: '#8ac926' },
  shopping: { label: 'Shopping',           icon: '🛍️', color: '#ff70a6' },
  personal: { label: 'Personal',           icon: '⭐', color: '#9aa0a6' },
};

// Order = priority when several match.
const KEYWORDS = {
  rrr: ['rrr', 'red raider racing', 'fsae', 'formula', 'race car', 'racecar', 'the car', 'radiator', 'cooling loop', 'cooling system', 'heat exchanger', 'chassis', 'weld', 'welding', 'design review', 'build night', 'comp', 'competition', 'ev car', 'battery pack', 'accumulator'],
  agc: ['agc', 'associated general contractors', 'construction club'],
  school: ['class', 'classes', 'lecture', 'lab', 'exam', 'test', 'quiz', 'midterm', 'final', 'finals', 'homework', 'hw', 'assignment', 'study', 'studying', 'professor', 'prof', 'office hours', 'thermo', 'statics', 'dynamics', 'fluids', 'heat transfer', 'calc', 'calculus', 'course', 'syllabus', 'tutoring', 'ttu', 'semester', 'individual study', 'lab report', 'project report', 'registration', 'advising', 'advisor', 'gpa', 'textbook'],
  workouts: ['workout', 'work out', 'working out', 'gym', 'lift', 'lifting', 'lifted', 'run', 'running', 'ran', 'jog', 'cardio', 'leg day', 'legs', 'push day', 'pull day', 'chest', 'back day', 'arms', 'bench', 'squat', 'squats', 'deadlift', 'deadlifts', 'yoga', 'swim', 'swimming', 'hike', 'miles', 'mile', 'pr', 'reps', 'sets', 'stretch', 'rec center', 'rec'],
  books: ['book', 'books', 'novel', 'audiobook', 'reading list', 'chapter of'],
  food: ['grocery', 'groceries', 'meal prep', 'recipe', 'cook', 'cooking'],
  shopping: ['buy', 'order', 'purchase', 'amazon', 'best buy', 'walmart', 'target'],
};

export const GROCERY_WORDS = ['milk', 'eggs', 'egg', 'bread', 'butter', 'cheese', 'yogurt', 'chicken', 'beef', 'steak', 'ground beef', 'turkey', 'pork', 'bacon', 'sausage', 'ham', 'fish', 'salmon', 'tuna', 'shrimp', 'rice', 'pasta', 'noodles', 'beans', 'tortillas', 'cereal', 'oats', 'oatmeal', 'flour', 'sugar', 'salt', 'pepper', 'oil', 'olive oil', 'spices', 'sauce', 'salsa', 'ketchup', 'mustard', 'mayo', 'peanut butter', 'jelly', 'honey', 'apples', 'apple', 'bananas', 'banana', 'oranges', 'berries', 'strawberries', 'blueberries', 'grapes', 'lemons', 'limes', 'avocado', 'avocados', 'potatoes', 'onions', 'onion', 'garlic', 'tomatoes', 'lettuce', 'spinach', 'broccoli', 'carrots', 'peppers', 'corn', 'vegetables', 'veggies', 'fruit', 'snacks', 'chips', 'crackers', 'cookies', 'coffee', 'tea', 'juice', 'water', 'soda', 'gatorade', 'protein', 'protein powder', 'creatine', 'protein bars', 'frozen pizza', 'pizza', 'ice cream', 'sour cream', 'cream cheese', 'bagels', 'deli meat', 'lunch meat', 'hot sauce', 'ranch', 'syrup', 'pancake mix', 'granola', 'nuts', 'almonds', 'jerky', 'food', 'groceries', 'paper towels', 'toilet paper', 'dish soap'];

const WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const WD_RE = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)';
const MON = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

const EVENT_WORDS = /\b(exam|test|quiz|midterm|final|finals|birthday|bday|party|game|trip|hang(?:ing)? out|hangout|hang|concert|meeting|mtg|interview|competition|comp|presentation|appointment|appt|dentist|doctor|dinner|lunch|breakfast|brunch|practice|class|lecture|lab|wedding|flight|event|banquet|career fair|office hours|tailgate|church|date|movie|show|recital|conference|tournament|scrimmage|shift)\b/i;
const TASK_CALL_WORDS = /^(call|text|email|e-mail|message|submit|turn in|pay|send|reply|respond|ask|tell|book|schedule|register|sign up|apply|cancel|return|renew|check)\b/i;

function re(src, flags = 'i') { return new RegExp(src, flags); }
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function detectCategory(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    for (const w of words) if (re(`(^|[^a-z0-9])${escapeRe(w)}([^a-z0-9]|$)`).test(t)) return cat;
  }
  if (/\bme\s?\d{4}\b/i.test(text) || /\b[a-z]{2,4}\s?\d{4}\b/i.test(text) && /\b(hw|exam|class|quiz|study|lab|project)\b/i.test(text)) return 'school';
  return null;
}

export function isGrocery(item) {
  const t = item.toLowerCase().trim();
  return GROCERY_WORDS.some(w => re(`(^|[^a-z])${escapeRe(w)}([^a-z]|$)`).test(t));
}

function splitItems(s) {
  return s.split(/\s*(?:,|;|\band\b|&|\+)\s*/i)
    .map(x => x.replace(/^(?:a|an|some|the|more|new|a new|another)\s+/i, (m) => /new/i.test(m) ? 'new ' : '').trim())
    .map(x => x.replace(/[.!?]+$/, '').trim())
    .filter(Boolean)
    .map(cap);
}

// ---------- date / time extraction ----------
function to24(h, m, ap, hint) {
  h = Number(h); m = Number(m || 0);
  if (h > 23 || m > 59) return null;
  if (ap) {
    ap = ap.toLowerCase().replace(/\./g, '');
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
  } else if (h <= 12) {
    if (hint === 'am') { if (h === 12) h = 0; }
    else if (hint === 'pm') { if (h < 12) h += 12; }
    else if (hint === 'amctx' && h >= 5 && h <= 11) { /* "gym at 6" -> 6 AM */ }
    else if (h >= 1 && h <= 6) h += 12;          // "at 3" -> 3 PM
    else if (h === 7 && hint !== 'amctx') h += 12; // "at 7" -> 7 PM unless morning-ish context
    else if (h >= 8 && h <= 11 && hint === 'pmctx') h += 12;
    else if (h === 12) { /* noon */ }
  }
  return { h, m };
}

const TIME_CORE = '(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?|am|pm|a|p)?';

export function extractWhen(input, nowMs = Date.now()) {
  let s = ' ' + input + ' ';
  const now = new Date(nowMs);
  const found = { date: null, time: null, endTime: null, durationMin: null, recur: null, by: false, rel: null, partOfDay: null };
  const cut = (m) => { s = s.replace(m, ' '); };
  const today = () => ({ y: now.getFullYear(), m: now.getMonth(), d: now.getDate() });
  const fromDate = (dt) => ({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() });
  const plus = (n) => fromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const upcoming = (wd, allowToday = true) => { let diff = (wd - now.getDay() + 7) % 7; if (diff === 0 && !allowToday) diff = 7; return plus(diff); };

  let mm;
  // --- recurrence ---
  if ((mm = s.match(re(`\\bevery\\s+other\\s+(day|week|month|year|${WD_RE})\\b`)))) {
    const u = mm[1].toLowerCase();
    if (u in WD) { found.recur = { freq: 'weekly', interval: 2, byday: [WD[u]] }; found.date = upcoming(WD[u]); }
    else found.recur = { freq: u === 'day' ? 'daily' : u + 'ly', interval: 2 };
    cut(mm[0]);
  } else if ((mm = s.match(/\b(?:every\s*day|daily|every\s+night|every\s+morning|nightly)\b/i))) {
    found.recur = { freq: 'daily', interval: 1 };
    if (/night/i.test(mm[0])) found.partOfDay = 'night'; if (/morning/i.test(mm[0])) found.partOfDay = 'morning';
    cut(mm[0]);
  } else if ((mm = s.match(/\b(?:every\s+weekday|weekdays|mon(?:day)?\s*-\s*fri(?:day)?)\b/i))) {
    found.recur = { freq: 'weekly', interval: 1, byday: [1, 2, 3, 4, 5] }; cut(mm[0]);
  } else if ((mm = s.match(/\b(?:on\s+)?(mwf|m\/w\/f)\b/i))) {
    found.recur = { freq: 'weekly', interval: 1, byday: [1, 3, 5] }; cut(mm[0]);
  } else if ((mm = s.match(/\b(?:on\s+)?(tth|t\/th|tuth|tues?\/thurs?)\b/i))) {
    found.recur = { freq: 'weekly', interval: 1, byday: [2, 4] }; cut(mm[0]);
  } else if ((mm = s.match(re(`\\b(?:every|on|each)\\s+(${WD_RE}s?(?:(?:\\s*(?:,|and|&|\\/)\\s*|\\s+)${WD_RE}s?)*)\\b`))) && (/^every|^each/i.test(mm[0].trim()) || /s\b/i.test(mm[1]))) {
    const days = mm[1].toLowerCase().split(/\s*(?:,|and|&|\/)\s*|\s+/).map(x => x.replace(/s$/, '')).map(x => WD[x] ?? WD[x + 's']).filter(x => x != null);
    if (days.length) { found.recur = { freq: 'weekly', interval: 1, byday: [...new Set(days)] }; cut(mm[0]); }
  } else if ((mm = s.match(/\b(every\s+week|weekly)\b/i))) {
    found.recur = { freq: 'weekly', interval: 1 }; cut(mm[0]);
  } else if ((mm = s.match(/\b(every\s+month|monthly)\b/i))) {
    found.recur = { freq: 'monthly', interval: 1 }; cut(mm[0]);
  } else if ((mm = s.match(/\b(every\s+year|yearly|annually)\b/i))) {
    found.recur = { freq: 'yearly', interval: 1 }; cut(mm[0]);
  }
  if (!found.recur && (mm = s.match(re(`\\b(${WD_RE})s\\b`)))) {
    // plural weekday alone ("mondays") => recurring
    const k = mm[1].toLowerCase(); if (k in WD) { found.recur = { freq: 'weekly', interval: 1, byday: [WD[k]] }; cut(mm[0]); }
  }

  // --- part of day words (hints) ---
  if ((mm = s.match(/\b(?:in the\s+|this\s+)?(morning|afternoon|evening|night)\b/i)) && !/\bnight out\b/i.test(s)) {
    found.partOfDay = mm[1].toLowerCase(); cut(mm[0]);
  }
  if ((mm = s.match(/\btonight\b/i))) { found.partOfDay = 'night'; found.date = today(); cut(mm[0]); }
  let hint = found.partOfDay === 'morning' ? 'am' : found.partOfDay ? 'pm' : null;
  if (!hint && /\b(gym|workout|lift|lifting|run|class|lecture|lab|breakfast|alarm|wake|office hours|exam|quiz|test)\b/i.test(s)) hint = 'amctx';
  else if (!hint && /\b(hang|hangout|dinner|party|game|movie|drinks|concert|show|date|study|studying|homework|hw|call|tailgate|night)\b/i.test(s)) hint = 'pmctx';

  // --- time range ---
  const T = `(?:${TIME_CORE}|(noon|midnight))`;
  if ((mm = s.match(re(`\\b(?:from\\s+|at\\s+|@\\s*)?${T}\\s*(?:-|–|to|until|till|til)\\s*${T}(?=\\W)`)))) {
    const a = { h: mm[1], m: mm[2], ap: mm[3], w: mm[4] }, b = { h: mm[5], m: mm[6], ap: mm[7], w: mm[8] };
    const strong = a.ap || b.ap || a.m || b.m || a.w || b.w || /^\s*(from|at|@)/i.test(mm[0]);
    if (strong) {
      const conv = (x, apFallback) => x.w ? { h: x.w.toLowerCase() === 'noon' ? 12 : 0, m: 0 } : to24(x.h, x.m, x.ap || apFallback, hint);
      let st = conv(a, !a.ap && b.ap && Number(a.h) <= Number(b.h) ? b.ap : null), en = conv(b, null);
      if (st && en) {
        if (!a.ap && !b.ap && !hint && en.h < st.h) en.h += 12;
        found.time = st; found.endTime = en; cut(mm[0]);
      }
    }
  }
  // --- single time ---
  if (!found.time) {
    const pats = [
      re(`\\b(?:at|@)\\s*${TIME_CORE}(?=\\W)`),
      re(`\\b(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?|am|pm)?(?=\\W)`),
      re(`\\b(\\d{1,2})()\\s*(a\\.m\\.|p\\.m\\.|am|pm)(?=\\W)`),
    ];
    for (const p of pats) {
      if ((mm = s.match(p))) { const t = to24(mm[1], mm[2], mm[3], hint); if (t) { found.time = t; cut(mm[0]); break; } }
    }
    if (!found.time && (mm = s.match(/\b(?:at\s+)?(noon|midnight)\b/i))) { found.time = { h: mm[1].toLowerCase() === 'noon' ? 12 : 0, m: 0 }; cut(mm[0]); }
  }
  // --- duration ---
  if ((mm = s.match(/\bfor\s+(an?|half an|\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i))) {
    let n = /half/i.test(mm[1]) ? 0.5 : /^an?$/i.test(mm[1]) ? 1 : parseFloat(mm[1]);
    found.durationMin = /^h/i.test(mm[2]) ? n * 60 : n; cut(mm[0]);
  }
  // --- relative "in 2 hours" ---
  if ((mm = s.match(/\bin\s+(an?|a few|a couple(?: of)?|\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\b/i))) {
    const n = /few/i.test(mm[1]) ? 3 : /couple/i.test(mm[1]) ? 2 : /^an?$/i.test(mm[1]) ? 1 : parseInt(mm[1], 10);
    const u = mm[2].toLowerCase();
    let t;
    if (u.startsWith('min')) t = new Date(nowMs + n * 60000);
    else if (u.startsWith('h')) t = new Date(nowMs + n * 3600000);
    else if (u.startsWith('d')) t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    else if (u.startsWith('w')) t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7 * n);
    else t = new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
    found.date = fromDate(t);
    if (/^(min|h)/.test(u)) { found.time = { h: t.getHours(), m: t.getMinutes() }; found.rel = true; }
    cut(mm[0]);
  }
  if (!found.date && !found.time && (mm = s.match(/\blater(?:\s+today)?\b/i))) {
    const t = new Date(nowMs + 3 * 3600000); t.setMinutes(0);
    found.date = fromDate(t); found.time = { h: t.getHours(), m: 0 }; cut(mm[0]);
  }

  // --- dates ---
  const byRe = '(?:(by|before|due|on|this|for)\\s+)?';
  const markBy = (w) => { if (w && /^(by|before|due)$/i.test(w)) found.by = true; };
  if (!found.date) {
    if ((mm = s.match(re(`\\b${byRe}(?:the\\s+)?day\\s+after\\s+(?:tomorrow|tmrw|tmr)\\b`)))) { markBy(mm[1]); found.date = plus(2); cut(mm[0]); }
    else if ((mm = s.match(re(`\\b${byRe}(today|tomorrow|tmrw|tmr|tmw|tomorow|yesterday)\\b`)))) {
      markBy(mm[1]); const w = mm[2].toLowerCase();
      found.date = w === 'today' ? today() : w === 'yesterday' ? plus(-1) : plus(1); cut(mm[0]);
    }
    else if ((mm = s.match(re(`\\b(?:(by|before|due|on|this|for|next|this coming|coming)\\s+)?(?:(next)\\s+)?${WD_RE}\\b(?!\\s*s\\b)`)))) {
      const pre = (mm[1] || '').toLowerCase(), nxt = pre === 'next' || mm[2];
      markBy(pre); const wd = WD[mm[3].toLowerCase()];
      if (wd != null) {
        let d = upcoming(wd, true);
        if (nxt) d = fromDate(new Date(d.y, d.m, d.d + 7));
        found.date = d; cut(mm[0]);
      }
    }
    else if ((mm = s.match(re(`\\b${byRe}(?:the\\s+)?(next\\s+)?weekend\\b`)))) {
      markBy(mm[1]); let d = upcoming(6, true); if (mm[2]) d = fromDate(new Date(d.y, d.m, d.d + 7)); found.date = d; cut(mm[0]);
    }
    else if ((mm = s.match(/\b(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+)?(week|month)\b/i))) {
      found.by = true;
      if (mm[1].toLowerCase() === 'week') found.date = upcoming(5, true);
      else found.date = fromDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      cut(mm[0]);
    }
    else if ((mm = s.match(/\bnext\s+(week|month)\b/i))) {
      found.date = mm[1].toLowerCase() === 'week' ? upcoming(1, false) : fromDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
      cut(mm[0]);
    }
  }
  if (!found.date) {
    let y = null, mo = null, d = null;
    if ((mm = s.match(re(`\\b${byRe}${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`)))) {
      markBy(mm[1]); mo = MON[mm[2].toLowerCase().replace('.', '')]; d = +mm[3]; y = mm[4] ? +mm[4] : null; cut(mm[0]);
    } else if ((mm = s.match(re(`\\b${byRe}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}(?:,?\\s+(\\d{4}))?\\b`)))) {
      markBy(mm[1]); d = +mm[2]; mo = MON[mm[3].toLowerCase().replace('.', '')]; y = mm[4] ? +mm[4] : null; cut(mm[0]);
    } else if ((mm = s.match(re(`\\b${byRe}(\\d{1,2})[\\/](\\d{1,2})(?:[\\/](\\d{2,4}))?\\b`)))) {
      const a = +mm[2], b = +mm[3];
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) { markBy(mm[1]); mo = a - 1; d = b; y = mm[4] ? (+mm[4] < 100 ? 2000 + +mm[4] : +mm[4]) : null; cut(mm[0]); }
    } else if ((mm = s.match(re(`\\b${byRe}the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`)))) {
      markBy(mm[1]); d = +mm[2]; mo = now.getMonth(); if (d < now.getDate()) mo += 1; cut(mm[0]);
    }
    if (mo != null && d != null && mo !== undefined) {
      if (y == null) {
        y = now.getFullYear();
        const cand = new Date(y, mo, d);
        if (cand.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()) y += 1;
      }
      const dt = new Date(y, mo, d); found.date = fromDate(dt);
    }
  }

  // recurring with weekday but no date -> next matching day
  if (found.recur && !found.date) {
    if (found.recur.byday && found.recur.byday.length) {
      const diffs = found.recur.byday.map(wd => (wd - now.getDay() + 7) % 7);
      found.date = plus(Math.min(...diffs));
    } else found.date = today();
  }
  // part-of-day default time
  if (!found.time && found.partOfDay) {
    found.time = { morning: { h: 9, m: 0 }, afternoon: { h: 14, m: 0 }, evening: { h: 18, m: 0 }, night: { h: 20, m: 0 } }[found.partOfDay];
  }
  // time but no date: today, or tomorrow if already passed
  if (found.time && !found.date) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), found.time.h, found.time.m);
    found.date = t.getTime() < nowMs - 60000 ? plus(1) : today();
  }
  return { ...found, rest: s.replace(/\s+/g, ' ').trim() };
}

function cleanTitle(t) {
  let s = ' ' + t + ' ';
  const lead = /^\s*(?:hey\s+|ok(?:ay)?\s+|so\s+|um+\s+)?(?:please\s+)?(?:can you\s+)?(?:remind me (?:to|about|of|that)?|reminder(?: to)?:?|set a reminder (?:to|for)?|don'?t (?:let me )?forget (?:to|about)?|remember to|i (?:really )?(?:need|have|got|want|wanna|gotta|should|must) to|i need|need to|have to|got to|gotta|want to|wanna|i should|i'll|i will|i am going to|i'm going to|im going to|going to|gonna|i have an?|i have|i've got an?|i've got|ive got|there's an?|there is an?|todo:?|to do:?|task:?|event:?)\s+/i;
  for (let i = 0; i < 3; i++) s = s.replace(lead, ' ');
  s = s.replace(/\s+(?:on|at|by|from|for|this|next|in|the|due|before|starting|until|@|,)\s*$/i, ' ');
  s = s.replace(/\s+(?:on|at|by|from|for|this|next|in|the|due|before|starting|until|@|,)\s*$/i, ' ');
  s = s.replace(/^\s*(?:to|on|at|a|an)\s+/i, ' ');
  s = s.replace(/\s+([,.!?])/g, '$1').replace(/\s+/g, ' ').trim().replace(/^[,.;:\-\s]+|[,;:\-\s]+$/g, '').replace(/[.!]+$/, '');
  return cap(s);
}

function buildDate(when) {
  if (!when.date) return null;
  const { y, m, d } = when.date;
  if (when.time) return new Date(y, m, d, when.time.h, when.time.m).getTime();
  return new Date(y, m, d).getTime();
}

// ---------- main entry ----------
/**
 * parse(text) -> one of:
 *  { kind: 'help' } | { kind: 'undo' }
 *  { kind: 'query', range: {from,to,label} | null, target: 'agenda'|'tasks'|'list'|'notes', list? }
 *  { kind: 'search', q }
 *  { kind: 'done', q }
 *  { kind: 'create', items: [ ... ] }
 */
export function parse(raw, nowMs = Date.now()) {
  const text = raw.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  if (!text) return null;
  if (/^(help|\?|commands|what can you do\??|how do (i|you) use this\??)$/i.test(text)) return { kind: 'help' };
  if (/^(undo|undo that|oops|nevermind|never mind)$/i.test(text)) return { kind: 'undo' };

  // --- searches ---
  let m;
  if ((m = text.match(/^(?:search|find|look up|lookup)\s+(?:for\s+)?(.+)$/i))) return { kind: 'search', q: m[1].trim() };

  // --- complete ---
  if ((m = text.match(/^(?:done(?: with)?|finished|completed|complete|bought|got|check off|checked off|cross off|mark)\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete|off))?$/i)) && !/\b(at|on|tomorrow|today)\b/i.test(m[1])) {
    return { kind: 'done', q: m[1].replace(/^(?:the|my)\s+/i, '').trim() };
  }

  // --- list queries ---
  const listQ = lower.match(/^(?:show|open|view|see|what'?s on|whats on|what is on|list)?\s*(?:me\s+)?(?:my|the)?\s*(grocery|groceries|food|shopping|book|books|reading|task|tasks|to-?dos?|notes?)\s*(?:list)?\??$/);
  if (listQ) {
    const w = listQ[1];
    if (/^note/.test(w)) return { kind: 'query', target: 'notes' };
    if (/^(task|to)/.test(w)) return { kind: 'query', target: 'tasks' };
    return { kind: 'query', target: 'list', list: /groc|food/.test(w) ? 'groceries' : /shop/.test(w) ? 'shopping' : 'books' };
  }

  // --- agenda queries ---
  const isQuestion = /^(what|whats|what's|show|list|agenda|schedule|calendar|any|anything|do i have|am i|how'?s|hows|when)\b/i.test(text) || /^(today|tomorrow|tmrw|this week|week|next week|weekend|this weekend|upcoming|overdue)\??$/i.test(text);
  if (isQuestion && !/^when\s+(?:is|are|was)\s+/i.test(text)) {
    const now = new Date(nowMs); const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).getTime();
    if (/overdue|late|behind/i.test(text)) return { kind: 'query', target: 'overdue' };
    if (/\bnext week\b/i.test(text)) { const mon = day(((1 - now.getDay() + 7) % 7) || 7); return { kind: 'query', target: 'agenda', range: { from: mon, to: new Date(mon + 7.5 * 864e5).setHours(0, 0, 0, 0), label: 'Next week' } }; }
    if (/\b(this week|week|upcoming|coming up)\b/i.test(text)) return { kind: 'query', target: 'agenda', range: { from: sod, to: day(7), label: 'Next 7 days' } };
    if (/\bweekend\b/i.test(text)) { const sat = day((6 - now.getDay() + 7) % 7); return { kind: 'query', target: 'agenda', range: { from: sat, to: new Date(sat + 2.5 * 864e5).setHours(0, 0, 0, 0), label: 'This weekend' } }; }
    const w = extractWhen(text, nowMs);
    if (w.date) { const f = new Date(w.date.y, w.date.m, w.date.d).getTime(); return { kind: 'query', target: 'agenda', range: { from: f, to: new Date(w.date.y, w.date.m, w.date.d + 1).getTime(), label: null } }; }
    if (/^(what|whats|what's|show|agenda|schedule|calendar|anything|do i have)/i.test(text) && text.split(' ').length <= 6) return { kind: 'query', target: 'agenda', range: { from: sod, to: day(1), label: 'Today' } };
  }
  if ((m = text.match(/^when\s+(?:is|are|was|do i have)\s+(?:my\s+|the\s+)?(.+?)\??$/i))) return { kind: 'search', q: m[1] };

  // --- explicit prefixes ---
  let forcedType = null, forcedCat = null, forcedList = null, body = text;
  const pre = text.match(/^(note|notes|idea|thought|journal|log|workout|lift|grocery|groceries|food|shop|shopping|buy|book|books|read|task|todo|event|school|rrr|agc|personal)\s*:\s*(.+)$/i);
  if (pre) {
    const p = pre[1].toLowerCase(); body = pre[2];
    if (/^(note|notes|idea|thought|journal|log)$/.test(p)) forcedType = 'note';
    else if (/^(workout|lift)$/.test(p)) { forcedCat = 'workouts'; }
    else if (/^(grocery|groceries|food)$/.test(p)) { forcedType = 'list'; forcedList = 'groceries'; }
    else if (/^(shop|shopping|buy)$/.test(p)) { forcedType = 'list'; forcedList = 'shopping'; }
    else if (/^(book|books|read)$/.test(p)) { forcedType = 'list'; forcedList = 'books'; }
    else if (/^(task|todo)$/.test(p)) forcedType = 'task';
    else if (p === 'event') forcedType = 'event';
    else forcedCat = p;
  }
  // "add X to my grocery list"
  if (!forcedType && (m = body.match(/^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my\s+|the\s+)?(grocery|groceries|food|shopping|book|books|reading)\s*(?:list)?$/i))) {
    const l = m[2].toLowerCase();
    forcedType = 'list'; forcedList = /groc|food/.test(l) ? 'groceries' : /shop/.test(l) ? 'shopping' : 'books'; body = m[1];
  }

  if (forcedType === 'note') {
    return { kind: 'create', items: [{ type: 'note', title: '', body: body.trim(), category: forcedCat || detectCategory(body) || 'personal' }] };
  }
  if (forcedType === 'list') {
    const items = splitItems(body).map(t => ({ type: 'list', list: forcedList, title: t, category: forcedList === 'groceries' ? 'food' : forcedList }));
    return { kind: 'create', items };
  }

  // workout log ("did legs 45 min", "ran 3 miles")
  if (!forcedType && /^(?:i\s+)?(?:just\s+)?(did|ran|lifted|hit|benched|squatted|swam|biked|walked|finished my|worked out)\b/i.test(body) && !/\b(tomorrow|tonight|next|every|remind|at \d)\b/i.test(body) && (forcedCat === 'workouts' || detectCategory(body) === 'workouts' || /\b(miles?|reps?|sets?|lbs?|min|minutes|x\d)\b/i.test(body))) {
    return { kind: 'create', items: [{ type: 'note', title: '', body, category: 'workouts' }] };
  }

  const when = extractWhen(body, nowMs);
  const rest = when.rest;
  const hasDate = !!when.date, hasTime = !!when.time;
  const category = forcedCat || detectCategory(body) || null;
  const remindFlag = /\b(remind me|reminder|don'?t (?:let me )?forget|remember to)\b/i.test(body);

  if (!forcedType && forcedCat === 'workouts' && !hasDate) {
    return { kind: 'create', items: [{ type: 'note', title: '', body, category: 'workouts' }] };
  }
  if (!forcedType && /^(idea|ideas|thought|note to self|journal|random thought|reflection|goal|goals|\d+[- ]?(?:year|yr|month) (?:plan|goal)s?|long[- ]term|plan for|life plan)\b/i.test(rest)) {
    return { kind: 'create', items: [{ type: 'note', title: '', body: text, category: category || 'personal' }] };
  }

  // shopping / groceries ("buy a new calculator", "need eggs and milk", "pick up bread")
  if (!forcedType && !remindFlag && !hasTime) {
    const sm = rest.match(/^(?:i\s+)?(?:(?:really\s+)?(?:need|have|got|want)\s+to\s+|gotta\s+|should\s+|need\s+to\s+|have\s+to\s+|must\s+)?(buy|get|grab|pick up|order|purchase|need)\s+(.+)$/i);
    if (sm) {
      const verb = sm[1].toLowerCase();
      let what = sm[2].replace(/\s+(?:from|at)\s+(walmart|target|heb|h-e-b|united|market street|costco|sam'?s|aldi|kroger|amazon|best buy)\b.*$/i, '').trim();
      what = what.replace(/\s+(?:on|by|this|next|for|at)\s*$/i, '');
      const parts = splitItems(what);
      const groc = parts.length && parts.every(isGrocery) || (parts.some(isGrocery) && parts.length > 1);
      const looksTask = /\b(haircut|oil change|appointment|car washed|done|fixed|checked|ready|back to|started|signed)\b/i.test(what);
      if (!looksTask && (groc || ['buy', 'order', 'purchase'].includes(verb) || (verb === 'need' && parts.length >= 1 && what.split(' ').length <= 6))) {
        const list = groc ? 'groceries' : 'shopping';
        const due = hasDate ? buildDate(when) : null;
        return { kind: 'create', items: parts.map(t => ({ type: 'list', list, title: t, category: list === 'groceries' ? 'food' : (category && category !== 'shopping' ? category : 'shopping'), due })) };
      }
    }
  }
  // books ("want to read Dune", "read Atomic Habits")
  if (!forcedType && !hasDate && (m = rest.match(/^(?:i\s+)?(?:(?:want|need|have|plan)\s+to\s+|wanna\s+|should\s+|gotta\s+)?(?:start\s+|finish\s+)?read(?:ing)?\s+(?!for\b|chapter|ch\.?\s|pages?|the syllabus|notes)(.+)$/i)) && category !== 'school') {
    const title = m[1].replace(/^(?:the\s+book\s+|the\s+)/i, '').replace(/\s+by\s+/i, ' by ').trim();
    return { kind: 'create', items: [{ type: 'list', list: 'books', title: cap(title), category: 'books' }] };
  }

  const title = cleanTitle(rest) || cleanTitle(body) || 'Untitled';
  const start = buildDate(when);
  const longText = rest.split(' ').length > 22;

  let type = forcedType;
  if (!type) {
    if (remindFlag) type = 'task';
    else if (hasTime && TASK_CALL_WORDS.test(title) && !EVENT_WORDS.test(title)) type = 'task';
    else if (hasTime) type = 'event';
    else if (hasDate && (EVENT_WORDS.test(body) || when.recur) && !when.by) type = 'event';
    else if (hasDate) type = 'task';
    else if (longText) type = 'note';
    else type = 'task';
  }
  if (type === 'note') return { kind: 'create', items: [{ type: 'note', title: '', body: text, category: category || 'personal' }] };

  const item = { type, title, category: category || 'personal', recur: when.recur || null };
  if (type === 'event') {
    item.start = start; item.allDay = !hasTime;
    if (hasTime && when.endTime) {
      const { y, m: mo, d } = when.date; let e = new Date(y, mo, d, when.endTime.h, when.endTime.m).getTime();
      if (e <= start) e += 864e5; item.end = e;
    } else if (hasTime && when.durationMin) item.end = start + when.durationMin * 60000;
    else if (hasTime) item.end = start + 60 * 60000;
    item.remindMins = hasTime ? 15 : null;
  } else {
    item.due = start; item.hasTime = hasTime; item.remind = hasTime && (remindFlag || true);
    if (remindFlag && !hasTime && hasDate) { // remind me ... tomorrow => 9 AM
      const { y, m: mo, d } = when.date; item.due = new Date(y, mo, d, 9, 0).getTime(); item.hasTime = true; item.remind = true; item.defaultedTime = true;
    }
    if (remindFlag && !hasDate) item.needsTime = true;
  }
  return { kind: 'create', items: [item] };
}
