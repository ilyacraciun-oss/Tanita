/* ============================================================
   TANITA BC-545N · Body Composition Log — application logic
   Vanilla JS · localStorage · hand-built SVG charts
   ============================================================ */
(() => {
  "use strict";

  const STORE_KEY = "tanita.bc545n.entries.v1";
  const FOCUS_KEY = "tanita.bc545n.focus";

  /* ---------- metric definitions ----------
     dir: "up" = higher is favorable, "down" = lower is favorable,
          "flat" = no health judgement (color by direction only, neutral). */
  const METRICS = [
    { key: "weight",   label: "Weight",        unit: "kg",       dec: 1, dir: "flat",  color: "var(--amber)" },
    { key: "bmi",      label: "BMI",           unit: "",         dec: 1, dir: "flat",  color: "var(--amber)" },
    { key: "fat",      label: "Body Fat",      unit: "%",        dec: 1, dir: "down",  color: "var(--coral)" },
    { key: "water",    label: "Body Water",    unit: "%",        dec: 1, dir: "up",    color: "var(--teal)"  },
    { key: "muscle",   label: "Muscle Mass",   unit: "kg",       dec: 1, dir: "up",    color: "var(--teal)"  },
    { key: "bone",     label: "Bone Mass",     unit: "kg",       dec: 1, dir: "up",    color: "var(--violet)"},
    { key: "bmr",      label: "Energy / BMR",  unit: "kcal",     dec: 0, dir: "up",    color: "var(--amber)" },
    { key: "bioage",   label: "Metabolic Age", unit: "yr",       dec: 0, dir: "down",  color: "var(--teal)"  },
    { key: "fitness",  label: "Fitness Level", unit: "/10",      dec: 0, dir: "up",    color: "var(--teal)"  },
    { key: "visceral", label: "Visceral Fat",  unit: "lvl",      dec: 0, dir: "down",  color: "var(--coral)" },
  ];
  const METRIC_BY_KEY = Object.fromEntries(METRICS.map(m => [m.key, m]));

  const SEGMENTS = [
    { key: "armRight", label: "Right Arm" },
    { key: "armLeft",  label: "Left Arm"  },
    { key: "trunk",    label: "Trunk"     },
    { key: "legRight", label: "Right Leg" },
    { key: "legLeft",  label: "Left Leg"  },
  ];

  const ALL_FIELDS = [
    ...METRICS.map(m => m.key),
    ...SEGMENTS.map(s => s.key),
  ];

  /* ---------- state ---------- */
  let entries = load();
  let focusKey = localStorage.getItem(FOCUS_KEY) || "weight";
  let focusRange = "all";

  /* ---------- storage ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.sort(byDate) : [];
    } catch { return []; }
  }
  function save() {
    entries.sort(byDate);
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

  /* ---------- helpers ---------- */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function fmt(v, dec) {
    if (v == null || v === "" || isNaN(v)) return "—";
    return Number(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtDate(iso, opts) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, opts || { year: "numeric", month: "short", day: "numeric" });
  }
  function num(v) { return v === "" || v == null || isNaN(v) ? null : Number(v); }

  // classify a change as good / bad / flat given a metric direction
  function deltaClass(diff, dir) {
    if (diff === 0 || diff == null) return "delta-flat";
    if (dir === "flat") return "delta-flat";
    const favorable = dir === "up" ? diff > 0 : diff < 0;
    return favorable ? "delta-good" : "delta-bad";
  }
  function arrow(diff) { return diff > 0 ? "▲" : diff < 0 ? "▼" : "■"; }

  // find latest two entries that both have a value for `key`
  function pairFor(key) {
    const withVal = entries.filter(e => num(e[key]) != null);
    const last = withVal[withVal.length - 1] || null;
    const prev = withVal[withVal.length - 2] || null;
    return { last, prev };
  }

  /* ============================================================ RENDER */
  function render() {
    renderStatus();
    renderHero();
    renderSegments();
    renderTiles();
    renderFocus();
    renderTable();
  }

  function renderStatus() {
    const el = $("#statusline");
    if (!entries.length) { el.textContent = "Body Composition Monitor · no readings yet"; return; }
    const last = entries[entries.length - 1];
    el.textContent = `Body Composition Monitor · ${entries.length} reading${entries.length>1?"s":""} · last ${fmtDate(last.date)}`;
  }

  /* ---------- HERO ---------- */
  function renderHero() {
    const hero = $("#hero");
    if (!entries.length) {
      hero.classList.remove("hero");
      hero.innerHTML = `
        <div class="hero-main empty-hero">
          <div class="hero-tag">NO DATA ON RECORD</div>
          <h2>Step on the scale.</h2>
          <p>Log your first Tanita BC-545N reading and this console comes alive — live deltas, segmental muscle map, and trend charts across every metric.</p>
          <button class="btn primary" id="empty-new">+ Log first reading</button>
          <div style="margin-top:14px"><button class="link-btn" id="empty-seed">or load sample data to explore</button></div>
        </div>`;
      $("#empty-new").onclick = () => openModal();
      $("#empty-seed").onclick = seed;
      return;
    }
    hero.classList.add("hero");
    const { last, prev } = pairFor("weight");
    const wDiff = last && prev ? +(last.weight - prev.weight).toFixed(1) : null;
    const wCls = deltaClass(wDiff, "flat") === "delta-flat" && wDiff
      ? (wDiff > 0 ? "delta-bad" : "delta-good") : deltaClass(wDiff, "flat");
    // for weight (flat metric) still hint color by direction so it reads visually; keep neutral wording
    const deltaTxt = wDiff == null ? "first reading"
      : wDiff === 0 ? "no change"
      : `${arrow(wDiff)} ${Math.abs(wDiff).toFixed(1)} kg vs. previous`;

    const sideMetrics = ["fat", "muscle", "visceral"];
    const sideHtml = sideMetrics.map(k => {
      const m = METRIC_BY_KEY[k];
      const p = pairFor(k);
      const val = p.last ? num(p.last[k]) : null;
      const diff = p.last && p.prev ? +(num(p.last[k]) - num(p.prev[k])).toFixed(m.dec) : null;
      const cls = deltaClass(diff, m.dir);
      const dTxt = diff == null ? "—" : diff === 0 ? "0" : `${arrow(diff)} ${Math.abs(diff).toFixed(m.dec)}`;
      return `<div class="minicard">
        <div>
          <div class="mk-label">${m.label}</div>
          <div class="mk-val">${fmt(val, m.dec)}<small>${m.unit}</small></div>
        </div>
        <div class="mk-delta ${cls}">${dTxt}</div>
      </div>`;
    }).join("");

    hero.innerHTML = `
      <div class="hero-main">
        <div class="hero-tag">LATEST WEIGHT · ${fmtDate(last.date).toUpperCase()}</div>
        <div class="hero-weight">
          <span class="val">${fmt(num(last.weight), 1)}</span>
          <span class="unit">kg</span>
        </div>
        <span class="hero-delta ${wCls}">${deltaTxt}</span>
        <div class="hero-date">BMI ${fmt(num(last.bmi),1)} · Metabolic age ${fmt(num(last.bioage),0)} yr · ${entries.length} sessions logged</div>
      </div>
      <div class="hero-side">${sideHtml}</div>`;
  }

  /* ---------- SEGMENTAL MUSCLE / BODY MAP ---------- */
  function renderSegments() {
    const panel = $("#segment-panel");
    const last = entries[entries.length - 1];
    const hasSeg = last && SEGMENTS.some(s => num(last[s.key]) != null);
    if (!hasSeg) { panel.style.display = "none"; return; }
    panel.style.display = "";

    const vals = SEGMENTS.map(s => ({ ...s, v: num(last[s.key]) }));
    const max = Math.max(...vals.map(v => v.v || 0), 0.0001);

    // colour intensity by share of max
    const colorFor = v => {
      if (v == null) return "#1c2025";
      const t = Math.max(0.15, (v || 0) / max); // 0.15..1
      // interpolate teal-2 -> amber as proportion grows
      return `color-mix(in srgb, var(--teal-2) ${(1-t)*100}%, var(--amber) ${t*100}%)`;
    };

    // build legend
    $("#segment-legend").innerHTML = vals.map(v => {
      const pct = v.v ? Math.round((v.v / max) * 100) : 0;
      const prev = pairFor(v.key);
      const diff = prev.last && prev.prev ? +(num(prev.last[v.key]) - num(prev.prev[v.key])).toFixed(2) : null;
      const cls = deltaClass(diff, "up");
      const dTxt = diff == null || diff === 0 ? "" : `<span class="${cls}" style="font-size:11px"> ${arrow(diff)}${Math.abs(diff).toFixed(2)}</span>`;
      return `<div class="leg-row" data-seg="${v.key}">
        <span class="leg-name">${v.label}</span>
        <span class="leg-bar"><span style="width:${pct}%"></span></span>
        <span class="leg-val">${fmt(v.v,2)}<small> kg</small>${dTxt}</span>
      </div>`;
    }).join("");

    // body map svg — stylised human figure, 5 regions
    const g = k => colorFor(vals.find(v => v.key === k).v);
    $("#bodymap").innerHTML = `
      <svg viewBox="0 0 220 380" role="img" aria-label="Body muscle map">
        <!-- head -->
        <circle cx="110" cy="32" r="22" fill="#171b20" stroke="var(--line)" stroke-width="1.2"/>
        <!-- trunk -->
        <path class="seg-shape" data-seg="trunk" fill="${g('trunk')}" d="M83 62 q27 -10 54 0 l8 96 q-35 14 -70 0 z"/>
        <!-- right arm (viewer left) -->
        <path class="seg-shape" data-seg="armRight" fill="${g('armRight')}" d="M83 64 q-20 4 -26 26 l-10 78 q10 5 18 0 l14 -72 z"/>
        <!-- left arm -->
        <path class="seg-shape" data-seg="armLeft" fill="${g('armLeft')}" d="M137 64 q20 4 26 26 l10 78 q-10 5 -18 0 l-14 -72 z"/>
        <!-- right leg -->
        <path class="seg-shape" data-seg="legRight" fill="${g('legRight')}" d="M76 160 q14 8 32 4 l-2 100 -6 96 q-10 4 -18 0 l-4 -96 z"/>
        <!-- left leg -->
        <path class="seg-shape" data-seg="legLeft" fill="${g('legLeft')}" d="M144 160 q-14 8 -32 4 l2 100 6 96 q10 4 18 0 l4 -96 z"/>
      </svg>`;

    // link legend hover <-> body shape highlight
    const link = (seg, on) => {
      $$(`.seg-shape[data-seg="${seg}"]`).forEach(n => n.classList.toggle("is-active", on));
      $$(`.leg-row[data-seg="${seg}"]`).forEach(n => n.style.color = on ? "var(--ink)" : "");
    };
    $$(".seg-shape, .leg-row", panel).forEach(n => {
      const seg = n.dataset.seg;
      n.addEventListener("mouseenter", () => link(seg, true));
      n.addEventListener("mouseleave", () => link(seg, false));
    });
  }

  /* ---------- TREND TILES ---------- */
  function renderTiles() {
    $("#tiles").innerHTML = METRICS.map(m => {
      const { last, prev } = pairFor(m.key);
      const val = last ? num(last[m.key]) : null;
      const diff = last && prev ? +(num(last[m.key]) - num(prev[m.key])).toFixed(m.dec) : null;
      const cls = deltaClass(diff, m.dir);
      const dTxt = diff == null ? "—" : diff === 0 ? "0" : `${arrow(diff)} ${Math.abs(diff).toFixed(m.dec)}`;
      const series = entries.filter(e => num(e[m.key]) != null).map(e => num(e[m.key]));
      return `<div class="tile ${m.key === focusKey ? "is-active" : ""}" data-metric="${m.key}" role="button" tabindex="0">
        <div class="tile-top">
          <span class="tile-label">${m.label}</span>
          <span class="tile-delta ${cls}">${dTxt}</span>
        </div>
        <div class="tile-val">${fmt(val, m.dec)}<small>${m.unit}</small></div>
        <div class="tile-spark">${sparkline(series, m.color)}</div>
      </div>`;
    }).join("");

    $$(".tile").forEach(t => {
      const act = () => { focusKey = t.dataset.metric; localStorage.setItem(FOCUS_KEY, focusKey); renderTiles(); renderFocus(); };
      t.addEventListener("click", act);
      t.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
    });
  }

  /* ---------- SPARKLINE (small) ---------- */
  function sparkline(vals, color) {
    const W = 160, H = 38, pad = 3;
    if (vals.length < 2) return `<svg viewBox="0 0 ${W} ${H}"><text x="${W/2}" y="${H/2+4}" text-anchor="middle" class="axis-label">need 2+ readings</text></svg>`;
    const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const x = i => pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = v => H - pad - ((v - min) / span) * (H - pad * 2);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = "M" + pts.join(" L");
    const area = `${line} L${x(vals.length-1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
    const gid = "sg" + Math.random().toString(36).slice(2, 7);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(vals.length-1).toFixed(1)}" cy="${y(vals[vals.length-1]).toFixed(1)}" r="2.4" fill="${color}"/>
    </svg>`;
  }

  /* ---------- FOCUS CHART (big, interactive) ---------- */
  function renderFocus() {
    const m = METRIC_BY_KEY[focusKey];
    $("#focus-title").textContent = m.label;
    $("#focus-sub").textContent = `${m.unit ? m.unit.replace("/10","rating").replace("lvl","level (1–10)") + " " : ""}over time`;

    // range filtering
    let data = entries.filter(e => num(e[m.key]) != null).map(e => ({ date: e.date, v: num(e[m.key]) }));
    if (focusRange !== "all" && data.length) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(focusRange));
      const c = cutoff.toISOString().slice(0, 10);
      const filtered = data.filter(d => d.date >= c);
      if (filtered.length >= 2) data = filtered;
    }
    drawBigChart(data, m);
  }

  function drawBigChart(data, m) {
    const host = $("#bigchart");
    const W = 1100, H = 360;
    const PAD = { l: 54, r: 22, t: 26, b: 40 };
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

    if (data.length < 2) {
      host.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text x="${W/2}" y="${H/2}" text-anchor="middle" class="axis-label" style="font-size:14px">Two or more readings of “${m.label}” are needed to chart a trend.</text></svg>`;
      return;
    }

    const vals = data.map(d => d.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const padV = (max - min) * 0.12; min -= padV; max += padV;
    // ratings clamp to sensible floor
    if (["fitness","visceral"].includes(m.key)) min = Math.max(0, min);

    const t0 = new Date(data[0].date).getTime();
    const t1 = new Date(data[data.length - 1].date).getTime();
    const tspan = (t1 - t0) || 1;
    const X = iso => PAD.l + ((new Date(iso).getTime() - t0) / tspan) * iw;
    const Y = v => PAD.t + (1 - (v - min) / (max - min)) * ih;

    // y gridlines
    const TICKS = 5;
    let grid = "", labels = "";
    for (let i = 0; i <= TICKS; i++) {
      const v = min + (i / TICKS) * (max - min);
      const yy = Y(v);
      grid += `<line class="grid-line" x1="${PAD.l}" y1="${yy.toFixed(1)}" x2="${W-PAD.r}" y2="${yy.toFixed(1)}"/>`;
      labels += `<text class="axis-label" x="${PAD.l-10}" y="${(yy+3).toFixed(1)}" text-anchor="end">${fmt(v, m.dec)}</text>`;
    }
    // x labels (first, mid, last)
    const xIdx = data.length <= 6 ? data.map((_,i)=>i) : [0, Math.floor(data.length/3), Math.floor(2*data.length/3), data.length-1];
    let xlabels = "";
    [...new Set(xIdx)].forEach(i => {
      const d = data[i];
      xlabels += `<text class="axis-label" x="${X(d.date).toFixed(1)}" y="${H-14}" text-anchor="middle">${fmtDate(d.date, {month:"short", day:"numeric"})}</text>`;
    });

    const pts = data.map(d => `${X(d.date).toFixed(1)},${Y(d.v).toFixed(1)}`);
    const line = "M" + pts.join(" L");
    const area = `${line} L${X(data[data.length-1].date).toFixed(1)},${PAD.t+ih} L${X(data[0].date).toFixed(1)},${PAD.t+ih} Z`;
    const dots = data.map(d => `<circle class="pt" data-x="${X(d.date).toFixed(1)}" data-y="${Y(d.v).toFixed(1)}" cx="${X(d.date).toFixed(1)}" cy="${Y(d.v).toFixed(1)}" r="3.2" fill="var(--bg)" stroke="${m.color}" stroke-width="1.8"/>`).join("");

    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" id="bc-svg">
        <defs>
          <linearGradient id="bcfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="${m.color}" stop-opacity="0.30"/>
            <stop offset="1" stop-color="${m.color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}${labels}${xlabels}
        <path d="${area}" fill="url(#bcfill)"/>
        <path id="bc-line" d="${line}" fill="none" stroke="${m.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
        <line id="bc-cross" x1="0" y1="${PAD.t}" x2="0" y2="${PAD.t+ih}" stroke="${m.color}" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
        ${dots}
        <circle id="bc-hot" r="5" fill="${m.color}" opacity="0"/>
        <rect id="bc-hit" x="${PAD.l}" y="${PAD.t}" width="${iw}" height="${ih}" fill="transparent"/>
      </svg>
      <div class="chart-tooltip" id="bc-tip"></div>`;

    // draw-on animation
    const path = $("#bc-line");
    try {
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 1.05s cubic-bezier(.3,.7,.2,1)";
      path.style.strokeDashoffset = "0";
    } catch {}

    // interactivity
    const svg = $("#bc-svg"), tip = $("#bc-tip"), cross = $("#bc-cross"), hot = $("#bc-hot"), hit = $("#bc-hit");
    const wrap = host.closest(".bigchart-wrap");
    hit.addEventListener("mousemove", ev => {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) / r.width * W; // svg-space x
      // nearest data point
      let bi = 0, bd = Infinity;
      data.forEach((d, i) => { const dx = Math.abs(X(d.date) - sx); if (dx < bd) { bd = dx; bi = i; } });
      const d = data[bi];
      const px = X(d.date), py = Y(d.v);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.style.opacity = "1";
      hot.setAttribute("cx", px); hot.setAttribute("cy", py); hot.style.opacity = "1";
      const prev = bi > 0 ? data[bi-1].v : null;
      const diff = prev == null ? null : +(d.v - prev).toFixed(m.dec);
      const cls = deltaClass(diff, m.dir);
      const dTxt = diff == null ? "first" : diff === 0 ? "no change" : `${arrow(diff)} ${Math.abs(diff).toFixed(m.dec)} ${m.unit}`;
      tip.innerHTML = `<div class="tt-date">${fmtDate(d.date)}</div><div class="tt-val">${fmt(d.v,m.dec)} <span style="font-size:11px;color:var(--ink-dim)">${m.unit}</span></div><div class="tt-delta ${cls}">${dTxt}</div>`;
      // position tooltip in wrap coords
      const left = px / W * wrap.clientWidth;
      const top  = py / H * wrap.clientHeight;
      tip.style.left = left + "px"; tip.style.top = top + "px"; tip.style.opacity = "1";
    });
    hit.addEventListener("mouseleave", () => { tip.style.opacity = "0"; cross.style.opacity = "0"; hot.style.opacity = "0"; });
  }

  /* ---------- LOG TABLE ---------- */
  function renderTable() {
    const t = $("#log-table");
    if (!entries.length) { t.innerHTML = `<tbody><tr><td style="text-align:center;color:var(--ink-faint);padding:24px">No readings logged yet.</td></tr></tbody>`; $("#log-sub").textContent = "All recorded sessions"; return; }
    $("#log-sub").textContent = `${entries.length} recorded session${entries.length>1?"s":""} · most recent first`;

    const cols = ["weight","bmi","fat","water","muscle","bone","bmr","bioage","fitness","visceral"];
    const head = `<thead><tr><th>Date</th>${cols.map(k => `<th>${METRIC_BY_KEY[k].label}</th>`).join("")}<th></th></tr></thead>`;
    const rows = [...entries].reverse().map(e => {
      const tds = cols.map(k => `<td>${fmt(num(e[k]), METRIC_BY_KEY[k].dec)}</td>`).join("");
      return `<tr><td>${fmtDate(e.date)}</td>${tds}<td><button class="row-edit" data-id="${e.id}" title="Edit">✎</button></td></tr>`;
    }).join("");
    t.innerHTML = head + `<tbody>${rows}</tbody>`;
    $$(".row-edit", t).forEach(b => b.onclick = () => openModal(b.dataset.id));
  }

  /* ============================================================ MODAL */
  const modal = $("#modal");
  function openModal(id) {
    const form = $("#entry-form");
    form.reset();
    $("#f-id").value = "";
    $("#btn-delete").hidden = true;
    if (id) {
      const e = entries.find(x => x.id === id);
      if (e) {
        $("#modal-title").textContent = "Edit Reading";
        $("#f-id").value = e.id;
        $("#f-date").value = e.date;
        ALL_FIELDS.forEach(k => { const el = $("#f-" + k); if (el) el.value = e[k] ?? ""; });
        $("#btn-delete").hidden = false;
      }
    } else {
      $("#modal-title").textContent = "New Reading";
      $("#f-date").value = new Date().toISOString().slice(0, 10);
    }
    modal.hidden = false;
    setTimeout(() => $("#f-date").focus(), 50);
  }
  function closeModal() { modal.hidden = true; }

  $("#entry-form").addEventListener("submit", ev => {
    ev.preventDefault();
    const date = $("#f-date").value;
    if (!date) { toast("Pick a date for this reading."); return; }
    const id = $("#f-id").value;
    const rec = { id: id || uid(), date };
    ALL_FIELDS.forEach(k => { const el = $("#f-" + k); rec[k] = el && el.value !== "" ? Number(el.value) : null; });

    if (id) {
      const i = entries.findIndex(x => x.id === id);
      if (i >= 0) entries[i] = rec;
      toast("Reading updated.");
    } else {
      // merge if same date already exists
      const existing = entries.findIndex(x => x.date === date);
      if (existing >= 0 && !id) {
        rec.id = entries[existing].id;
        entries[existing] = rec;
        toast("Replaced existing reading for that date.");
      } else {
        entries.push(rec);
        toast("Reading saved.");
      }
    }
    save(); render(); closeModal();
  });

  $("#btn-delete").onclick = () => {
    const id = $("#f-id").value;
    if (!id) return;
    if (confirm("Delete this reading permanently?")) {
      entries = entries.filter(x => x.id !== id);
      save(); render(); closeModal(); toast("Reading deleted.");
    }
  };

  /* ============================================================ EXPORT / IMPORT */
  function exportJSON() {
    if (!entries.length) { toast("Nothing to export yet."); return; }
    const blob = new Blob([JSON.stringify({ device: "Tanita BC-545N", exported: new Date().toISOString(), entries }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tanita-bc545n-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast(`Exported ${entries.length} readings.`);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data) ? data : data.entries;
        if (!Array.isArray(incoming)) throw new Error("bad shape");
        const byDateMap = new Map(entries.map(e => [e.date, e]));
        let added = 0;
        incoming.forEach(r => {
          if (!r || !r.date) return;
          const rec = { id: r.id || uid(), date: r.date };
          ALL_FIELDS.forEach(k => rec[k] = (r[k] == null || r[k] === "") ? null : Number(r[k]));
          byDateMap.set(r.date, { ...byDateMap.get(r.date), ...rec, id: (byDateMap.get(r.date)?.id) || rec.id });
          added++;
        });
        entries = [...byDateMap.values()].sort(byDate);
        save(); render();
        toast(`Imported ${added} readings.`);
      } catch { toast("Could not read that file."); }
    };
    reader.readAsText(file);
  }

  /* ============================================================ SAMPLE DATA */
  function seed() {
    if (entries.length && !confirm("Load sample data alongside your current readings?")) return;
    const today = new Date();
    const demo = [];
    // 12 weekly readings, gentle realistic drift
    let w = 84.2, fat = 24.5, water = 52.0, muscle = 60.1, bone = 3.2, bmr = 1820, bioage = 38, fit = 4, visc = 9;
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i * 7);
      const drift = (11 - i);
      w     = +(84.2 - drift * 0.45 + (Math.random()-.5)*.4).toFixed(1);
      fat   = +(24.5 - drift * 0.32 + (Math.random()-.5)*.3).toFixed(1);
      water = +(52.0 + drift * 0.22 + (Math.random()-.5)*.2).toFixed(1);
      muscle= +(60.1 + drift * 0.18 + (Math.random()-.5)*.2).toFixed(1);
      bone  = +(3.2 + drift * 0.005).toFixed(1);
      bmr   = Math.round(1820 - drift * 6 + (Math.random()-.5)*15);
      bioage= Math.max(28, Math.round(38 - drift * 0.6));
      fit   = Math.min(10, 4 + Math.floor(drift / 3));
      visc  = Math.max(1, 9 - Math.floor(drift / 2));
      const trunk = +(muscle * 0.47 + (Math.random()-.5)*.2).toFixed(1);
      demo.push({
        id: uid(), date: d.toISOString().slice(0,10),
        weight: w, bmi: +(w/ (1.85*1.85)).toFixed(1), fat, water, muscle, bone, bmr, bioage, fitness: fit, visceral: visc,
        armRight: +(muscle*0.052 + (Math.random()-.5)*.05).toFixed(2),
        armLeft:  +(muscle*0.050 + (Math.random()-.5)*.05).toFixed(2),
        trunk,
        legRight: +(muscle*0.165 + (Math.random()-.5)*.08).toFixed(2),
        legLeft:  +(muscle*0.163 + (Math.random()-.5)*.08).toFixed(2),
      });
    }
    const map = new Map(entries.map(e => [e.date, e]));
    demo.forEach(d => map.set(d.date, d));
    entries = [...map.values()].sort(byDate);
    save(); render(); toast("Sample data loaded.");
  }

  /* ============================================================ TOAST */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.hidden = true, 300); }, 2600);
  }

  /* ============================================================ WIRING */
  $("#btn-new").onclick = () => openModal();
  $("#modal-close").onclick = closeModal;
  $("#btn-cancel").onclick = closeModal;
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  $("#btn-export").onclick = exportJSON;
  $("#btn-import").onclick = () => $("#file-import").click();
  $("#file-import").addEventListener("change", e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; });

  $("#btn-seed").onclick = seed;
  $("#btn-clear").onclick = () => {
    if (!entries.length) { toast("Already empty."); return; }
    if (confirm("Erase ALL readings from this browser? This cannot be undone.")) {
      entries = []; save(); render(); toast("All readings erased.");
    }
  };

  $$("#range-switch .range-btn").forEach(b => b.onclick = () => {
    $$("#range-switch .range-btn").forEach(x => x.classList.remove("is-active"));
    b.classList.add("is-active"); focusRange = b.dataset.range; renderFocus();
  });

  // redraw chart on resize (tooltip positioning depends on layout)
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderFocus, 200); });

  /* ---------- boot ---------- */
  if (!METRIC_BY_KEY[focusKey]) focusKey = "weight";
  render();
})();
