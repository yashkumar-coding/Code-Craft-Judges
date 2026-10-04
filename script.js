
const CONFIG = {
  EVENT: "Codecraft Navodaya",
  SUBTITLE: "Build SD College 2030 – Digital Poster Competition",
  DATE: "5 October 2026, 11:00 AM",
  VENUE: "Seminar Hall-1, SD College",

  JUDGES: ["Dr. Girdhar Gopal", "Dr. Arti Arora", "Ms. Kavleen Bharej"],


  CRITERIA: [
    { name: "Originality and creativity", max: 20 },
    { name: "Innovation and Technology", max: 20 },
    { name: "Relevance to SD College", max: 15 },
    { name: "Impact and Feasibility", max: 10 },
    { name: "Visual Design and presentation", max: 10 },
    { name: "Clarity of problem and solution", max: 15 },
    { name: "Features and Working", max: 10 }
  ],

  FIREBASE_URL: "https://sd-codecraft-nvodhya-default-rtdb.firebaseio.com",


  ADMIN_PASSCODE: "sdcodecraft"
};


pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $app = document.getElementById("app");
const CRIT = CONFIG.CRITERIA;
const MAX = CRIT.reduce((a, c) => a + c.max, 0);
const S = { judge: "", list: [], scores: {}, cur: null, timer: null, cache: {} };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const jkey = n => n.replace(/[.#$\/\[\]]/g, "_");
const base = () => CONFIG.FIREBASE_URL.trim().replace(/\/$/, "");

/* ---------- database (Firebase REST) ---------- */
async function dbGet(path) {
  const r = await fetch(`${base()}/${path}.json`);
  if (!r.ok) throw new Error("Cannot reach the database");
  return r.json();
}
async function dbPut(path, data) {
  const r = await fetch(`${base()}/${path}.json`, { method: "PUT", body: JSON.stringify(data) });
  if (!r.ok) throw new Error("Could not save");
}
async function dbDel(path) {
  const r = await fetch(`${base()}/${path}.json`, { method: "DELETE" });
  if (!r.ok) throw new Error("Could not delete");
}

async function getList() {
  const idx = (await dbGet("index")) || {};
  return Object.entries(idx)
    .map(([id, v]) => ({ id, label: v.label, order: v.order }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
async function refresh() {
  S.list = await getList();
  S.scores = (await dbGet("scores")) || {};
}
const scoreOf = (j, id) => (S.scores[jkey(j)] || {})[id];
const nextPoster = () => S.list.find(p => !scoreOf(S.judge, p.id));
const doneCount = j => S.list.filter(p => scoreOf(j, p.id)).length;

async function getImage(id) {
  if (!S.cache[id]) {
    const d = await dbGet("posters/" + id);
    if (!d || !d.img) throw new Error("Poster image missing");
    S.cache[id] = d.img;
  }
  return S.cache[id];
}

function stopTimer() { clearInterval(S.timer); S.timer = null; }

function home(err) {
  stopTimer();
  $app.innerHTML = `
  <div class="hero">
    <h1>${esc(CONFIG.EVENT)}</h1>
    <p>${esc(CONFIG.SUBTITLE)}</p>
    <div class="facts"><span class="fact">📅 ${esc(CONFIG.DATE)}</span><span class="fact">📍 ${esc(CONFIG.VENUE)}</span></div>
  </div>
  <div class="card">
    <h2>Start judging</h2>
    <div class="startbar">
      <div><label for="jsel">Judge name</label>
        <select id="jsel"><option value="">Select your name</option>
        ${CONFIG.JUDGES.map(j => `<option>${esc(j)}</option>`).join("")}</select></div>
      <button class="btn" id="startBtn">Start judging</button>
    </div>
    <div class="msg" id="hmsg">${err ? esc(err) : ""}</div>
    <div class="row"><button class="btn ghost small" id="resBtn">View results</button>
    <button class="btn ghost small" id="admBtn">Organizer</button></div>
  </div>`;
  document.getElementById("startBtn").onclick = async () => {
    const j = document.getElementById("jsel").value;
    const m = document.getElementById("hmsg");
    if (!j) { m.textContent = "Please select your name first."; return; }
    m.textContent = "Loading…";
    const b = document.getElementById("startBtn");
    b.disabled = true; b.textContent = "Loading…";
    await begin(j);
  };
  document.getElementById("resBtn").onclick = results;
  document.getElementById("admBtn").onclick = adminLogin;
}

async function begin(judge) {
  S.judge = judge;
  try { await refresh(); next(); }
  catch (e) { home("Problem: " + e.message + ". Check the internet and the Firebase link."); }
}

function next() {
  const p = nextPoster();
  if (!p) return waiting();
  S.cur = p;
  judging();
}


function judging() {
  stopTimer();
  const p = S.cur, total = S.list.length, done = doneCount(S.judge);
  $app.innerHTML = `
  <div class="top"><b>${esc(p.label)}</b><span class="note">Poster ${done + 1} of ${total}</span></div>
  <div class="progress"><i style="width:${(done / total) * 100}%"></i></div>
  <div class="poster" id="posterBox"><p class="note">Loading poster…</p></div>
  <div class="card">
    <h2>Marks</h2>
    ${CRIT.map((c, k) => `
      <div class="crit"><span class="n">${esc(c.name)}</span>
        <span class="marks"><input type="number" min="0" max="${c.max}" step="1" inputmode="numeric" id="c${k}" aria-label="${esc(c.name)}"><small>/${c.max}</small></span>
      </div>`).join("")}
    <div class="totalrow"><span>Total</span><span id="tot">0/${MAX}</span></div>
  </div>
  <div class="card">
    <label for="jsel2">Judge name</label>
    <select id="jsel2">${CONFIG.JUDGES.map(j => `<option ${j === S.judge ? "selected" : ""}>${esc(j)}</option>`).join("")}</select>
    <div class="msg" id="msg"></div>
    <button class="btn" id="submit">Submit and next poster</button>
  </div>`;

  getImage(p.id).then(src => {
    const box = document.getElementById("posterBox");
    if (box && S.cur === p) box.innerHTML = `<img alt="${esc(p.label)}" src="${src}">`;
    const after = S.list.find(q => q.id !== p.id && !scoreOf(S.judge, q.id));
    if (after) getImage(after.id).catch(() => { });
  }).catch(() => {
    const box = document.getElementById("posterBox");
    if (box) box.innerHTML = "<p class='note'>Could not load this poster. Check the internet and try again.</p>";
  });

  const update = () => {
    let t = 0;
    CRIT.forEach((_, k) => { t += Number(document.getElementById("c" + k).value) || 0; });
    document.getElementById("tot").textContent = t + "/" + MAX;
  };
  CRIT.forEach((_, k) => document.getElementById("c" + k).addEventListener("input", update));
  document.getElementById("jsel2").onchange = e => begin(e.target.value);

  document.getElementById("submit").onclick = async () => {
    const msg = document.getElementById("msg");
    const vals = [];
    for (let k = 0; k < CRIT.length; k++) {
      const raw = document.getElementById("c" + k).value;
      const v = Number(raw);
      if (raw === "" || !Number.isFinite(v) || v < 0 || v > CRIT[k].max) { msg.textContent = `Enter marks from 0 to ${CRIT[k].max} for "${CRIT[k].name}".`; return; }
      vals.push(Math.round(v));
    }
    const btn = document.getElementById("submit");
    btn.disabled = true; msg.textContent = "Saving…";
    const data = { marks: vals, total: vals.reduce((a, b) => a + b, 0), at: Date.now() };
    try {
      await dbPut(`scores/${jkey(S.judge)}/${p.id}`, data);
      (S.scores[jkey(S.judge)] = S.scores[jkey(S.judge)] || {})[p.id] = data;
      try { await refresh(); } catch (e) { }
      next();
      window.scrollTo(0, 0);
    } catch (e) {
      msg.textContent = "Could not save: " + e.message + ". Try again.";
      btn.disabled = false;
    }
  };
}

function waiting() {
  stopTimer();
  const n = S.list.length;
  $app.innerHTML = `
  <div class="hero"><h1>${n ? "All caught up" : "No posters yet"}</h1>
    <p>${n ? `You have marked all ${n} poster${n === 1 ? "" : "s"} uploaded so far.` : "The organizer has not uploaded any posters yet."}</p></div>
  <div class="card center">
    <p>New posters appear here automatically when the organizer adds them.</p>
    <div class="msg ok" id="wmsg">Checking for new posters every few seconds…</div>
    <div class="row" style="justify-content:center">
      <button class="btn small" id="chk">Check now</button>
      <button class="btn ghost small" id="res">View results</button>
      <button class="btn ghost small" id="hm">Home</button>
    </div>
  </div>`;
  const check = async () => {
    try { await refresh(); if (nextPoster()) { next(); } } catch (e) { }
  };
  document.getElementById("chk").onclick = check;
  document.getElementById("res").onclick = results;
  document.getElementById("hm").onclick = () => home();
  S.timer = setInterval(check, 8000);
}

async function results() {
  stopTimer();
  $app.innerHTML = `<div class="hero"><h1>Results</h1><p>${esc(CONFIG.EVENT)} – ${esc(CONFIG.SUBTITLE)}</p></div><div id="resBody"><p class="note">Loading…</p></div>`;
  const paint = async () => {
    try { await refresh(); } catch (e) { document.getElementById("resBody").innerHTML = "<p class='note'>Could not load results.</p>"; return; }
    const rows = S.list.map(p => {
      let sum = 0, n = 0;
      CONFIG.JUDGES.forEach(j => { const m = scoreOf(j, p.id); if (m) { sum += m.total; n++; } });
      return { p, sum, n, avg: n ? sum / n : 0 };
    });
    rows.sort((a, b) => b.avg - a.avg || b.sum - a.sum);
    const status = CONFIG.JUDGES.map(j => ({ j, d: doneCount(j) }));
    const total = S.list.length;
    const allDone = total > 0 && status.every(s => s.d === total);
    const top = rows.slice(0, 3);
    const medals = ["🥇 1st", "🥈 2nd", "🥉 3rd"];
    document.getElementById("resBody").innerHTML = `
      <div class="card">
        <h2>Judge progress</h2>
        ${status.map(s => `<p style="margin:6px 0">${esc(s.j)} <span class="pill ${s.d === total && total ? "ok" : "wait"}">${s.d}/${total} posters</span></p>`).join("")}
        ${allDone ? "" : "<p class='note'>Waiting for all judges to finish. This page updates by itself. Ranks below are provisional.</p>"}
      </div>
      <div class="podium">
        ${top.map((r, k) => `
          <div class="pod r${k + 1}">
            <div class="rank">${medals[k]}${allDone ? "" : " (provisional)"}</div>
            <div class="who">${esc(r.p.label)}</div>
            <div class="avg">${r.avg.toFixed(2)}<small> / ${MAX}</small></div>
            <small>Total ${r.sum} from ${r.n} judge${r.n === 1 ? "" : "s"}</small>
          </div>`).join("")}
      </div>
      <div class="card">
        <h2>All posters</h2>
        <div style="overflow-x:auto"><table>
          <tr><th>Rank</th><th>Poster</th><th>Total of judges</th><th>Average</th></tr>
          ${rows.map((r, k) => `<tr><td>${k + 1}</td><td>${esc(r.p.label)}</td><td>${r.sum}</td><td>${r.avg.toFixed(2)} / ${MAX}</td></tr>`).join("")}
        </table></div>
      </div>
      <button class="btn ghost small" id="back">Back to home</button>`;
    document.getElementById("back").onclick = () => home();
  };
  await paint();
  S.timer = setInterval(paint, 8000);
}


function adminLogin() {
  const pass = prompt("Organizer passcode");
  if (pass === null) return;
  if (pass !== CONFIG.ADMIN_PASSCODE) { home("Wrong passcode."); return; }
  adminView();
}

function parseName(fname) {
  let b = fname.replace(/\.[^.]+$/, "");
  let order = null;
  const m = b.match(/^\s*(\d+)\s*[.\-_)]*\s*(.*)$/);
  if (m && m[2]) { order = parseInt(m[1], 10); b = m[2]; }
  return { label: b.trim() || fname, order };
}
function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function exportCanvas(c) {
  let q = 0.82, d = c.toDataURL("image/jpeg", q);
  while (d.length > 7000000 && q > 0.4) { q -= 0.1; d = c.toDataURL("image/jpeg", q); }
  return d;
}
function whiteCanvas(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
  return c;
}
async function pdfPageToJpeg(pdf, i) {
  const page = await pdf.getPage(i);
  const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(2, 1400 / v1.width) });
  const c = whiteCanvas(Math.round(vp.width), Math.round(vp.height));
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return exportCanvas(c);
}
async function fileToImages(file, allPages) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = allPages ? pdf.numPages : 1, out = [];
    for (let i = 1; i <= n; i++) out.push(await pdfPageToJpeg(pdf, i));
    return out;
  }
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1400 / bmp.width);
  const c = whiteCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return [exportCanvas(c)];
}

async function adminView(note) {
  stopTimer();
  let list = [];
  try { list = await getList(); } catch (e) { note = "Cannot reach the database."; }
  $app.innerHTML = `
  <div class="hero"><h1>Organizer</h1><p>Add posters here. Judges see new posters automatically.</p></div>
  <div class="card">
    <h2>Upload posters</h2>
    <label for="files">Choose poster files (images or PDF). You can select many at once.</label>
    <input type="file" id="files" multiple accept="image/*,application/pdf,.pdf">
    <p class="note">The file name becomes the poster name, for example "21.Pallavi Walia.pdf" becomes "Pallavi Walia". A leading number sets the order.</p>
    <label style="font-weight:400"><input type="checkbox" id="allp"> One PDF contains many posters (every page is a separate poster)</label>
    <div class="msg" id="amsg">${note ? esc(note) : ""}</div>
    <div class="row"><button class="btn small" id="up">Upload</button>
    <button class="btn ghost small" id="hm">Back to home</button></div>
    <button class="btn danger small" id="resetScores">
    Reset All Judgements
  </button>
  </div>
  <div class="card">
    <h2>Uploaded posters (${list.length})</h2>
    ${list.length ? `<ul class="plist">${list.map((p, i) => `
      <li><span>${i + 1}. ${esc(p.label)}</span>
        <button class="btn ghost small" data-ren="${p.id}">Rename</button>
        <button class="btn danger small" data-del="${p.id}">Delete</button></li>`).join("")}</ul>` : "<p class='note'>No posters yet.</p>"}
  </div>`;
  document.getElementById("hm").onclick = () => home();
  document.getElementById("resetScores").onclick = async () => {
    // reset code here/ STEP 6 — Ask for confirmation
  const confirmReset = confirm(
    "⚠️ RESET ALL JUDGEMENTS?\n\n" +
    "This will permanently delete all marks given by ALL judges.\n\n" +
    "Posters will NOT be deleted.\n\n" +
    "Do you want to continue?"
  );

  // STEP 7 — Stop if Cancel is clicked
  if (!confirmReset) return;

  // STEP 8 — Disable button while resetting
  const btn = document.getElementById("resetScores");
  btn.disabled = true;
  btn.textContent = "Resetting…";

  try {

    // STEP 9 — Delete all marks from Firebase
    await dbDel("scores");

    // STEP 10 — Clear scores stored in the browser
    S.scores = {};

    // STEP 11 — Show success message
    alert("All judgements have been reset successfully.");

    // STEP 12 — Reload organizer page
    await adminView(
      "All marks have been reset. Posters are ready for judging again."
    );

  } catch (e) {

    // If something goes wrong
    alert("Could not reset judgements: " + e.message);

    btn.disabled = false;
    btn.textContent = "Reset All Judgements";
  }
};
  document.getElementById("up").onclick = async () => {
    const files = [...document.getElementById("files").files];
    const msg = document.getElementById("amsg");
    if (!files.length) { msg.className = "msg"; msg.textContent = "Choose at least one file first."; return; }
    const allPages = document.getElementById("allp").checked;
    document.getElementById("up").disabled = true;
    msg.className = "msg ok";
    let count = 0, failed = [];
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      msg.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name} …`;
      try {
        const { label, order } = parseName(f.name);
        const imgs = await fileToImages(f, allPages);
        for (let k = 0; k < imgs.length; k++) {
          const id = newId();
          const lab = imgs.length > 1 ? `${label} (page ${k + 1})` : label;
          const ord = order !== null ? order + k / 1000 : Date.now() + k;
          await dbPut("posters/" + id, { img: imgs[k] });
          await dbPut("index/" + id, { label: lab, order: ord });
          count++;
        }
      } catch (e) { failed.push(f.name); }
    }
    await adminView(`Uploaded ${count} poster${count === 1 ? "" : "s"}.` + (failed.length ? ` Failed: ${failed.join(", ")}` : ""));
  };
  $app.querySelectorAll("[data-ren]").forEach(b => b.onclick = async () => {
    const p = list.find(x => x.id === b.dataset.ren);
    const nm = prompt("New name for this poster", p.label);
    if (!nm || !nm.trim()) return;
    try { await dbPut("index/" + p.id, { label: nm.trim(), order: p.order }); adminView("Renamed."); }
    catch (e) { adminView("Could not rename."); }
  });
  $app.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    const p = list.find(x => x.id === b.dataset.del);
    if (!confirm(`Delete "${p.label}"? This cannot be undone.`)) return;
    try { await dbDel("posters/" + p.id); await dbDel("index/" + p.id); adminView("Deleted."); }
    catch (e) { adminView("Could not delete."); }
  });
}

home();