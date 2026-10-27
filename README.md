# Story Warz

A 3–10 player party game played on phones. Everyone writes true stories on a topic;
each round one is drawn and everyone guesses who wrote it. The host picks 4–15 rounds (default 8).

Play: open the site, tap **Host a game**, and have players scan the QR code.

- `src/game.html` – the game (edit this), `src/firebase-shim.js` – Firestore backend
- `python build.py` rebuilds `index.html` and `firebase-shim.js`
- `firestore.rules` – database security rules (paste into the Firebase console)
