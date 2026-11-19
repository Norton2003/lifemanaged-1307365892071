# LifeManaged — private, on-device life organizer (v1.0.0)

A home-screen app for iPhone. You text it things ("gym MWF 6am", "buy eggs", "thermo exam dec 3 at 9:30"), and it files them into your calendar, tasks, lists, and notes. **Everything is stored only on your phone.** There is no server, no account, and no analytics, and the app's security policy (`connect-src 'none'` in `index.html`) blocks it from sending data anywhere.

---

## 1. Put it on GitHub Pages (Windows, ~10 min, one time)

1. **Unzip:** right-click `lifemanaged.zip` → **Extract All**.
2. **Create the repo:** go to github.com → **+ → New repository**.
   - Name: `lifemanaged`
   - **Public** (free GitHub Pages needs public; only the *code* is public. Your data never touches GitHub.)
   - Click **Create repository**.
3. **Upload the files:** on the new repo page click **"uploading an existing file"**. Open the extracted `lifemanaged` folder, select **everything inside it** (`index.html`, `sw.js`, `manifest.webmanifest`, `README.md`, `package.json`, `.nojekyll`, and the folders `css`, `js`, `icons`, `tests`), and drag it into the browser. Click **Commit changes**.
   - Check that `index.html` sits at the top level of the repo, not inside a `lifemanaged/` subfolder.
   - `.nojekyll` is a hidden file. In File Explorer, turn on **View → Show → Hidden items** if you can't see it. It's optional, but helps.
4. **Turn on Pages:** repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → **Save**.
5. After 1–2 minutes the page shows your link: `https://YOUR-USERNAME.github.io/lifemanaged/`.

## 2. Install on your iPhone

1. Open the link in **Safari** (it has to be Safari).
2. Tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
3. **From now on, only open it from the home-screen icon.** iOS keeps a home-screen app's data separate from Safari's, so anything typed in the Safari tab won't show up in the app.
4. In the app: ⚙️ → **Enable** notifications, then tap **Protect storage** if the button appears.

## 3. Get your info in (fastest → slowest)

1. **🧠 Brain dump** (chip in Chat, or ⚙️ → Getting started): one item per line. Paste from Apple Notes or use the keyboard 🎤. You review everything before it's saved.
2. **Import Google Calendar** (one-time copy):
   - On the laptop: calendar.google.com → ⚙️ **Settings → Import & export → Export**. It downloads a `.zip`. Right-click → **Extract All**. You get one `.ics` file per calendar.
   - Move the `.ics` files to the iPhone: upload them at icloud.com → iCloud Drive (or OneDrive/Google Drive), or email them to yourself.
   - In LifeManaged: ⚙️ → **Import Google Calendar** → pick the files (you can select several). Events that ended more than 30 days ago are skipped. Repeating classes and meetings stay repeating.
   - **Delete the transfer copies afterward** (email, cloud upload, laptop Downloads).
   - Importing the same file again updates events instead of duplicating them.
3. **Just chat:** add things as they come up.

## 4. What you can type

| Type this | You get |
|---|---|
| `class MWF 10-10:50am` / `Statics TTh 12:30-1:50pm` | Repeating class |
| `gym every mon wed fri at 6am` | Repeating workout |
| `thermo exam dec 3 at 9:30am` | Event (School) |
| `turn in thermo hw by friday` | Task with a due date |
| `remind me to email Dr. Liu tomorrow at 9` | Task with a 🔔 reminder |
| `buddies want to hang out saturday at 7` | Event (7 PM) |
| `buy eggs, milk and chicken` | 3 grocery items |
| `need a new calculator` | Shopping list |
| `want to read Atomic Habits` | Books list |
| `note: radiator inlet idea…` | Note (auto-tagged RRR) |
| `ran 3 miles in 24 min` / `workout: bench 3x5 185` | Workout log (note) |
| `today` · `this week` · `what's on saturday` · `overdue` · `groceries` | Answers from your data |
| `bought eggs` · `done thermo hw` · `undo` · `search radiator` | Edits |

Prefixes force a type or category: `note:` `task:` `event:` `grocery:` `shop:` `book:` `workout:` `rrr:` `agc:` `school:`. Tap any item to edit it; nothing is final.

## 5. Reminders: the honest version

iPhone web apps **can't alert you while they're fully closed**. That would need a push server, which would break the "nothing leaves the phone" rule. LifeManaged alerts you while it's open or was recently opened, and puts an overdue count on its icon. For anything you **must not miss**, open the item → **📲 Add to iPhone Calendar**, and iOS will alert you on its own. (That copy lives in Apple Calendar, which syncs through iCloud if you have that turned on.)

## 6. Backups (do this weekly)

⚙️ → **Export backup** → set a password → **Save to Files**. The file is encrypted on the phone (AES-256). If the app gets deleted or the phone is lost, use **Restore from backup** on the new install. There is no password recovery. The Today screen nags you if you haven't backed up in 7 days.

## 7. Erase everything

⚙️ → **Erase all data…** → (optional backup) → type `DELETE` → **hold the button for 3 seconds**. Letting go early cancels.

## 8. Updating the app later

1. Replace the changed files in the repo: **Add file → Upload files**, drag them in, commit. To replace a file inside a folder, open that folder in GitHub first, then upload.
2. **Always change `VERSION` at the top of `sw.js`** (e.g. `lifemanaged-v1.0.1`). That's what tells phones a new version exists.
3. On the iPhone, open the app, close it, and open it again. A **"✨ Update ready → Restart app"** banner appears. Your data is untouched by updates.

## Files

```
index.html            app shell + privacy lock (CSP)
css/app.css           all styling (colors at the top)
js/app.js             screens, chat, reminders, backup, erase
js/parser.js          the offline "brain": categories, keywords, date parsing
js/dates.js           date helpers, repeating-event math
js/ics.js             Google Calendar import / Apple Calendar export
js/db.js              on-device storage (IndexedDB)
js/backup.js          encrypted backups
sw.js                 offline caching + updates (bump VERSION!)
tests/parser.test.js  parser tests: `node tests/parser.test.js`
```

To teach it new words (a new class name, a club), edit `KEYWORDS` near the top of `js/parser.js`.
