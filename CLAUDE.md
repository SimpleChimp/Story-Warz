# Story Warz (web version): notes for Claude Code

This repo is the **web version** of Story Warz, hosted on GitHub Pages with Firebase (Firestore) as the backend.
It was split off from the original project, which is a local-server version with a Flutter phone-host app. That project
stays with its original owner and is **not** in this repo. You don't need it.

- Live site: https://simplechimp.github.io/Story-Warz/
- Repo: https://github.com/SimpleChimp/Story-Warz (branch `main`; Pages serves the repo root of `main`)
- Firebase project: `story-warz-da056` (Firestore + Anonymous Auth). Console: https://console.firebase.google.com/project/story-warz-da056

## If you were handed this file on its own (not inside a clone of the repo): set up first
The owner received this file separately. If the folder you're in has no `.git` folder with `origin` pointing at
`SimpleChimp/Story-Warz`, do the steps below yourself, without waiting to be asked. Explain each step in one line, and
pause only when the owner has to sign in.
1. **Tools:** you need `git`, `python` (3.x), `gh` (GitHub CLI), and Node.js for the Firebase CLI (`npm i -g firebase-tools`).
   Install anything missing (Windows: `winget install Git.Git Python.Python.3.12 GitHub.cli OpenJS.NodeJS.LTS`, then reopen the terminal).
2. **GitHub:** if `gh auth status` shows no login, run `gh auth login`; the owner signs in to the SimpleChimp account in the browser.
   Then run `gh auth setup-git`. If git has no name/email set, set it from the GitHub account with `gh api user`.
3. **Clone:** run `gh repo clone SimpleChimp/Story-Warz` into a sensible place (e.g. `~/Story-Warz`), or `git pull` if a clone already exists.
   If the clone has no `CLAUDE.md`, copy this file into its root, then commit and push it. That way it loads automatically
   from now on, and the owner can delete the loose copy.
4. Do all further work **inside the clone**, and tell the owner to open Claude Code in that folder next time.

## First session on a new machine (do this with the owner, once)
Check each step before moving on, and tell the owner exactly what to click when a step needs them.
1. **Tools and GitHub:** make sure steps 1–2 above are done.
2. **Clone:** make sure you're in the clone and `git pull` is clean.
3. **Firebase:** run `firebase login` (the owner signs in with the Google account that owns `story-warz-da056`). Then check
   that `firebase projects:list` shows `story-warz-da056`. If it isn't listed, that account isn't a member of the project:
   the project owner has to add it in Console → Project settings → Users and permissions.
4. **Sanity check:** open the live site, tap **Host a game**, and confirm a room code and QR code appear.

## What the game is
A 3–10 player party game played on phones. Each player writes 3–5 true stories on a topic. The host picks the number of
rounds with a slider (4–15, default 8). Each round, one random anonymous story is shown and everyone guesses who wrote it.
A right guess scores +2, and the author gets +1 for each player fooled. The second half of the rounds is double (+4/+2):
rounds 5–8 of 8, 8–15 of 15. A tie after the last round goes to a wager tie breaker. The device that creates the
room is the host and referee. Players join by QR code or by entering the 4-letter room code, then enter a name (which
takes a seat and shows them in the crew list right away) and then write their stories.

## Files
| Path | What |
|---|---|
| `src/game.html` | **The game. Edit this.** HTML + CSS + JS in one file, written in "claude.ai artifact" style (no html/head/body tags). It talks only to `window.claude.use("db")` / `use("user")`. |
| `src/firebase-shim.js` | **Edit this** to change the backend. It implements `window.claude.use(...)` on Firestore, plus the landing screen (host or join), room codes, anonymous auth and the host lease. |
| `index.html`, `firebase-shim.js` (root) | **Generated. Never hand-edit them.** Run `python build.py` after any change in `src/`, and commit both the src and the generated files. |
| `build.py` | Wraps `src/game.html` in a page (Firebase compat SDK 10.12.2 + QR library from CDNs) and copies the shim to the root. |
| `firebase-config.js` | Public Firebase web config. It's safe in a public repo: `firestore.rules` is what protects the data. |
| `firestore.rules` | Firestore security rules. Deploy them after any change (see below). |

## Everyday workflow
1. Edit `src/game.html` and/or `src/firebase-shim.js`.
2. `python build.py`
3. Test locally: `python -m http.server 8000`, then open http://localhost:8000/. Add `&tab` to a room URL
   (e.g. `?room=ABCD&tab`) so each browser tab acts as its own player, which lets you play a 3–5 player game on one PC.
   localhost is an authorized domain in Firebase by default.
4. Commit, then `git push`. GitHub Pages redeploys in about 1 minute. Check progress with `gh run list --limit 3`.
   Phones may hold a cached copy, so reload to pick up the new version.

## Firebase tasks
- **Deploy rules:** the repo has no `firebase.json` yet. On first use, create a minimal one
  (`{"firestore":{"rules":"firestore.rules"}}`) and `.firebaserc` (`{"projects":{"default":"story-warz-da056"}}`), then commit them.
  After that, use `firebase deploy --only firestore:rules`. Pasting the rules into Console → Firestore → Rules also works.
- **Look at live data:** Console → Firestore → `rooms/<CODE>`. Use the CLI only for read-only checks, unless the owner asks for changes.
- **If the site breaks with auth errors**, check these: Authentication → Sign-in method → **Anonymous** must be enabled;
  Authentication → Settings → Authorized domains must include `simplechimp.github.io` (and any custom domain).
- Old rooms aren't cleaned up automatically. Spark (free) plan limits apply. Ask the owner before deleting data or
  setting up TTL/cleanup.

## Data model and rules the code relies on
- Every game is `rooms/<CODE>`, and the creator's uid is stored as `host`. Sub-collections are `game/*` (host-only writes),
  `secret/*` (host-only read/write, holds the deck), `stories/<uid>` and `votes/<uid>` (private to that player + host),
  `seats/<uid>` (each player writes their own, everyone reads), and `lease/*` (host).
- Picks live on each player's seat (`lockedRound`, `pick`, `wager`) and are public by design.
- A seat is created as soon as a player enters a name (`ready: false`, `n: 0`); **Ready for War** saves the stories and
  sets `ready: true` and `n` (how many stories they wrote), which the host's lobby uses to show the story pool against
  the rounds picked. `game/state` holds `count` (3–10) and `rounds` (4–15); games without `rounds` default to 8.
- `tests/` beside the clone (not in the repo): `make_harness.py` builds a test page that runs `src/game.html` on a fake
  in-memory database and plays a full game, checking the join flow, player counts and rounds. Run it in headless Chrome.
- Every phase change goes through `transition()`, which re-reads `game/state` and aborts if it already moved. Only one host
  tab holds the lease, so a second host device can't double-reveal or rewind.
- The host validates everything players send: story count/length, picks must be another player, wager must be 1..score.
- Each browser keeps its anonymous identity in localStorage, so re-scanning the QR code or reloading keeps the
  same seat and host role.
- If you change what is stored where, update `firestore.rules` to match **and deploy them**. A mismatch shows up as
  "permission-denied" errors (the shim reports these as `invalid_argument`).
- Looks/themes (Graffiti base, Sex Pistols, Army, 8-Bit) are inlined in `src/game.html` and chosen per device (`localStorage sw_look`).

## Recent history
- 2026-10-24: ported from the local-server version to GitHub Pages + Firebase. Fixed the host getting stuck (identity is
  now kept per browser, the host can reveal without dropped players, and buttons unlock if a save hangs for 15 s). The `&tab`
  test flag is now kept in the room URL.
- 2026-10-26: players now join with just a name first (they appear in the crew list as "Writing"), then write stories.
  Player count is 3–10. The host sets the number of rounds with a slider (4–15, default 8); the second half scores double,
  and the lobby shows stories in the pool vs. needed and keeps Start disabled until there are enough.
  Backup of the code before this change: `E:\Programs\Story Warz\Backup 2026-10-26 (original)\` on the owner's PC.
- Ideas not done yet: hide everyone's picks until the last player locks in; clean up old rooms;
  a full 5-player test game on real phones over mobile data.

## Working rules
- Keep replies short. Ask before anything destructive or public-facing: force-push, deleting Firestore data, changing
  Firebase billing/auth settings.
- Commit in small steps with clear messages, and push only working builds (after `python build.py` and a local test).
- Fix small spelling/grammar mistakes in owner-supplied game text, and say so.
