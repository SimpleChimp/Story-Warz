// Stand-in for the claude.ai runtime (db + user), backed by Firestore.
// Every game lives under rooms/<CODE>/. The device that creates a room is its host.
// Each browser is one player: anonymous auth is kept in localStorage, so a phone that reopens the
// link (new tab, QR scanned again, tab discarded by the OS) keeps its seat, and the host keeps host.
// Add &tab to the URL to make each tab its own player (for testing several players on one computer).
(function () {
  const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // no I/O, easy to read out loud
  const rid = () => Math.random().toString(36).slice(2, 10);
  const app = firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = app.auth(), fs = app.firestore();

  const err = e => ({
    code: e && e.code === "permission-denied" ? "invalid_argument"
      : e && e.code === "resource-exhausted" ? "resource_exhausted"
      : e && e.code === "unavailable" ? "unavailable" : (e && e.code) || "unavailable",
    message: (e && e.message) || "Connection error"
  });
  const clean = d => JSON.parse(JSON.stringify(d));   // Firestore refuses undefined values
  const pageLink = q => location.origin + location.pathname + q;

  // ---------- landing: host a new room or join one ----------
  function landing(msg) {
    return new Promise(resolve => {
      const box = document.createElement("div");
      box.id = "sw-landing";
      box.innerHTML = `<style>
        #sw-landing{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
          background:#111;color:#f4f1ea;font-family:"Anton",Impact,sans-serif;padding:16px}
        #sw-landing .w{width:100%;max-width:380px;text-align:center}
        #sw-landing h1{font-family:"Permanent Marker","Anton",sans-serif;font-size:56px;margin:0 0 4px;color:#ff3d7f;
          text-shadow:3px 3px 0 #00e5ff;letter-spacing:1px}
        #sw-landing p{font-family:system-ui,sans-serif;opacity:.8;margin:0 0 24px}
        #sw-landing button,#sw-landing input{width:100%;box-sizing:border-box;font:inherit;font-size:22px;padding:14px;
          border-radius:10px;border:3px solid #f4f1ea;margin:6px 0;letter-spacing:1px}
        #sw-landing button{background:#ffe600;color:#111;cursor:pointer}
        #sw-landing button.alt{background:transparent;color:#f4f1ea}
        #sw-landing input{background:#222;color:#f4f1ea;text-align:center;text-transform:uppercase}
        #sw-landing .or{margin:18px 0 8px;opacity:.6;font-family:system-ui,sans-serif}
        #sw-landing .msg{color:#ff6b6b;min-height:1.2em;font-family:system-ui,sans-serif}
      </style><div class="w"><h1>Story Warz</h1><p>Guess who wrote the story.</p>
        <button data-a="host">Host a game</button>
        <div class="or">or join with a room code</div>
        <input maxlength="4" placeholder="ABCD" autocomplete="off" aria-label="Room code">
        <button class="alt" data-a="join">Join</button>
        <p class="msg"></p></div>`;
      document.body.appendChild(box);
      const say = t => { box.querySelector(".msg").textContent = t; };
      say(msg || "");
      const input = box.querySelector("input");
      box.addEventListener("click", async e => {
        const a = e.target.dataset && e.target.dataset.a;
        if (!a) return;
        e.target.disabled = true;
        try {
          if (a === "host") resolve({ box, code: await createRoom() });
          else {
            const code = input.value.trim().toUpperCase();
            if (!/^[A-Z]{4}$/.test(code)) throw { message: "Enter the 4-letter room code." };
            if (!(await fs.doc("rooms/" + code).get()).exists) throw { message: "No room with that code." };
            resolve({ box, code });
          }
        } catch (x) { say(x.message || "Something went wrong."); e.target.disabled = false; }
      });
      input.addEventListener("keydown", e => { if (e.key === "Enter") box.querySelector('[data-a="join"]').click(); });
    });
  }
  async function createRoom() {
    for (let i = 0; i < 6; i++) {
      let code = "";
      for (let j = 0; j < 4; j++) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
      const ref = fs.doc("rooms/" + code);
      try {
        // Rules refuse to overwrite an existing room, so a taken code fails here and we try another.
        await ref.set({ host: auth.currentUser.uid, created: Date.now() });
        return code;
      } catch (e) { if (e.code !== "permission-denied") throw e; }
    }
    throw { message: "Couldn't make a room. Try again." };
  }

  let ROOM = null;
  const ready = (async () => {
    const perTab = new URLSearchParams(location.search).has("tab");
    await auth.setPersistence(perTab ? firebase.auth.Auth.Persistence.SESSION : firebase.auth.Auth.Persistence.LOCAL);
    if (!auth.currentUser) await new Promise(r => { const off = auth.onAuthStateChanged(() => { off(); r(); }); });
    if (!auth.currentUser) await auth.signInAnonymously();
    const uid = auth.currentUser.uid;

    let code = (new URLSearchParams(location.search).get("room") || "").trim().toUpperCase();
    let room = code ? await fs.doc("rooms/" + code).get().catch(() => null) : null;
    if (!room || !room.exists) {
      const r = await landing(code ? "No room with that code." : "");
      code = r.code;
      room = await fs.doc("rooms/" + code).get();
      r.box.remove();
      history.replaceState(null, "", pageLink("?room=" + code));
    }
    ROOM = code;
    window.claudeRoom = code;
    const host = room.data().host === uid;
    if (host) {
      const link = pageLink("?room=" + code);
      window.claudeLocalInvite = link;
      try {
        const qr = qrcode(0, "M"); qr.addData(link); qr.make();
        window.claudeLocalInviteQr = qr.createDataURL(6, 4);
      } catch { window.claudeLocalInviteQr = null; }
    }
    return { id: uid, host };
  })();

  // ---------- the db API, scoped to the room ----------
  const full = path => "rooms/" + ROOM + "/" + path;
  const PRIVATE = ["secret", "stories", "votes"];
  let isHost = false;
  ready.then(r => { isHost = r.host; });

  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = (id, d) => ({ id, exists: d !== null && d !== undefined, data: () => d ?? undefined, metadata: meta });
  const snapList = docs => {
    const list = docs.map(x => snapDoc(x.id, x.data));
    return { docs: list, size: list.length, empty: !list.length, docChanges: () => list.map((doc, i) => ({ type: "added", doc, oldIndex: -1, newIndex: i })), metadata: meta };
  };
  // Like the local server: a document you may not read looks missing.
  const getDoc = async path => {
    try { const s = await fs.doc(full(path)).get(); return s.exists ? s.data() : null; }
    catch (e) { if (e.code === "permission-denied") return null; throw err(e); }
  };

  function docRef(path) {
    const id = path.split("/").pop();
    const w = async p => { try { await p; } catch (e) { throw err(e); } };
    return {
      id, path,
      get: async () => snapDoc(id, await getDoc(path)),
      set: data => w(fs.doc(full(path)).set(clean(data))),
      update: async data => {
        // Deep merge, and like the local server: updating a missing document fails.
        if ((await getDoc(path)) === null) throw { code: "invalid_argument", message: "Document does not exist" };
        return w(fs.doc(full(path)).set(clean(data), { merge: true }));
      },
      delete: () => w(fs.doc(full(path)).delete()),
      acquire: async o => {
        const ref = fs.doc(full("lease/" + path.replace(/\//g, "_")));
        try {
          return await fs.runTransaction(async t => {
            const cur = (await t.get(ref)).data();
            if (cur && cur.until > Date.now() && cur.holder !== o.holder) return { acquired: false };
            t.set(ref, { holder: String(o.holder), until: Date.now() + Math.min(Math.max(o.ttlMs || 30000, 1000), 600000) });
            return { acquired: true, holder: o.holder };
          });
        } catch (e) { throw err(e); }
      },
      onSnapshot: (next, fail) => fs.doc(full(path)).onSnapshot(
        s => next(snapDoc(id, s.exists ? s.data() : null)),
        e => { if (e.code === "permission-denied") next(snapDoc(id, null)); else fail && fail(err(e)); }),
      collection: p => collRef(path + "/" + p)
    };
  }
  function collRef(path) {
    // Players may only see their own doc in a private collection; ask for just that one.
    const own = () => !isHost && PRIVATE.includes(path.split("/")[0]);
    const list = async () => {
      if (own()) { const d = await getDoc(path + "/" + auth.currentUser.uid); return d ? [{ id: auth.currentUser.uid, data: d }] : []; }
      try { return (await fs.collection(full(path)).get()).docs.map(d => ({ id: d.id, data: d.data() })); }
      catch (e) { throw err(e); }
    };
    return {
      path,
      doc: id => docRef(path + "/" + (id || rid())),
      get: async () => snapList(await list()),
      onSnapshot: (next, fail) => {
        if (own()) return docRef(path + "/" + auth.currentUser.uid).onSnapshot(s => next(snapList(s.exists ? [{ id: s.id, data: s.data() }] : [])), fail);
        return fs.collection(full(path)).onSnapshot(
          q => next(snapList(q.docs.map(d => ({ id: d.id, data: d.data() })))),
          e => fail && fail(err(e)));
      },
      add: async data => { const ref = docRef(path + "/" + rid()); await ref.set(data); return ref; }
    };
  }

  const db = Object.freeze({ doc: docRef, collection: collRef });
  const user = Object.freeze({
    id: async () => (await ready).id,
    isOwner: async () => (await ready).host,
    canEdit: async () => (await ready).host,
    can: async () => null
  });
  window.claude = { use: async name => { await ready; return name === "db" ? db : name === "user" ? user : null; } };
})();
