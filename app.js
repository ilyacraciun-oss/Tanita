/* ============================================================
   TANITA BC-545N · Body Composition Log — application logic
   Vanilla JS · localStorage · hand-built SVG charts
   ============================================================ */
(() => {
  "use strict";

  const STORE_KEY = "tanita.bc545n.entries.v1";
  const FOCUS_KEY = "tanita.bc545n.focus";
  const BADGE_KEY = "tanita.bc545n.earned";

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
  function render(announce = false) {
    renderStatus();
    renderHero();
    renderSegments();
    renderTiles();
    renderFocus();
    renderCoach();
    renderBadges(announce);
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

  /* ============================================================ ANALYSIS */
  function seriesOf(k) { return entries.filter(e => num(e[k]) != null); }
  function lastVal(k) { const s = seriesOf(k); return s.length ? num(s[s.length - 1][k]) : null; }
  function changeOf(k) { const s = seriesOf(k); if (s.length < 2) return null; return +(num(s[s.length-1][k]) - num(s[0][k])).toFixed(2); }
  // imbalance between a right/left pair on the most recent reading that has both
  function imbalance(rk, lk) {
    const e = [...entries].reverse().find(x => num(x[rk]) != null && num(x[lk]) != null);
    if (!e) return null;
    const r = num(e[rk]), l = num(e[lk]), hi = Math.max(r, l), lo = Math.min(r, l);
    if (hi <= 0) return null;
    return { r, l, pct: +(((hi - lo) / hi) * 100).toFixed(1), weaker: r < l ? "right" : "left", stronger: r < l ? "left" : "right" };
  }
  function spanDays() {
    if (entries.length < 2) return 0;
    return Math.round((new Date(entries[entries.length-1].date) - new Date(entries[0].date)) / 86400000);
  }

  /* ============================================================ THE LAB COACH */
  function renderCoach() {
    const grid = $("#coach-grid");
    if (!entries.length) {
      grid.innerHTML = `<div class="coach-card tone-warn"><span class="coach-ico">🧪</span><h3>Awaiting your first data point</h3><p>Log a reading and the Lab Coach will read your trends and prescribe training, pescetarian fuel, and balance fixes tailored to you.</p></div>`;
      return;
    }

    const cards = [];
    const muscleChg = changeOf("muscle"), fatChg = changeOf("fat"), viscChg = changeOf("visceral");
    const w = lastVal("weight"), visc = lastVal("visceral"), fit = lastVal("fitness");
    const arms = imbalance("armRight", "armLeft"), legs = imbalance("legRight", "legLeft");
    const single = entries.length < 2;

    /* 1 · Recomposition verdict */
    if (!single && muscleChg != null && fatChg != null) {
      let tone, ico, h, body;
      if (muscleChg > 0 && fatChg < 0) {
        tone = "tone-good"; ico = "🧬"; h = "Textbook recomposition";
        body = `Muscle <span class="accent-txt">+${muscleChg.toFixed(1)} kg</span> while body fat fell <span class="accent-txt">${Math.abs(fatChg).toFixed(1)} pts</span>. That's the holy grail — gaining tissue while shedding fat. Don't change a thing: keep the slight surplus-on-lift-days, deficit-on-rest-days rhythm.`;
      } else if (fatChg > 0 && muscleChg <= 0) {
        tone = "tone-alert"; ico = "🚨"; h = "Drifting the wrong way";
        body = `Fat is up <span class="accent-txt">${fatChg.toFixed(1)} pts</span> and muscle isn't moving. Pull daily calories back ~10–15%, hold protein high, and make sure every gym session logs a progressive-overload win. Recomp rewards patience, not crash diets.`;
      } else {
        tone = "tone-warn"; ico = "📊"; h = "Mixed signals — tighten up";
        body = `Muscle ${muscleChg >= 0 ? "+" : ""}${muscleChg.toFixed(1)} kg, fat ${fatChg >= 0 ? "+" : ""}${fatChg.toFixed(1)} pts. Decide one focus for the next 4 weeks: <b>lean gain</b> (small surplus, heavy lifting) or <b>cut</b> (small deficit, keep the weights heavy to protect muscle).`;
      }
      cards.push(`<div class="coach-card ${tone}"><span class="coach-ico">${ico}</span><h3>${h}</h3><p>${body}</p></div>`);
    } else {
      cards.push(`<div class="coach-card tone-warn"><span class="coach-ico">📈</span><h3>One more reading unlocks trends</h3><p>Log a second session and the Coach will track your recomposition — muscle gained vs. fat lost — and adapt every recommendation to your real numbers.</p></div>`);
    }

    /* 2 · Protein fuel (pescetarian) */
    if (w) {
      const lo = Math.round(w * 1.6), hi = Math.round(w * 2.2), tgt = Math.round(w * 1.9);
      cards.push(`<div class="coach-card tone-fuel"><span class="coach-ico">🐟</span><h3>Pescetarian protein engine</h3><p>At ${fmt(w,1)} kg, aim for <span class="accent-txt">~${tgt} g protein/day</span> (${lo}–${hi} g) to build muscle. Spread it across meals, lean on:</p><ul><li>Oily fish — salmon, sardines, mackerel (omega-3s also fight visceral fat)</li><li>Eggs, Greek yogurt &amp; cottage cheese</li><li>Tofu, tempeh, edamame &amp; lentils</li><li>A post-lift shake if you fall short</li></ul></div>`);
    }

    /* 3 · Visceral fat */
    if (visc != null) {
      const dropping = viscChg != null && viscChg < 0;
      let tone, ico, h, body;
      if (visc >= 10) { tone = "tone-alert"; ico = "🔥"; h = "Visceral fat: priority target"; }
      else if (visc >= 6) { tone = "tone-warn"; ico = "🎯"; h = "Visceral fat: keep chipping away"; }
      else { tone = "tone-good"; ico = "🛡️"; h = "Visceral fat: in a good place"; }
      body = visc >= 6
        ? `You're at level <span class="accent-txt">${visc}</span>${dropping ? ` and already down ${Math.abs(viscChg)} — momentum!` : "."} Add <b>2× weekly Zone-2 cardio</b> (30–40 min brisk incline walk or bike) on top of lifting, cut liquid calories &amp; refined carbs, and prioritise sleep. Visceral fat is the <em>first</em> fat to go in a deficit.`
        : `Level <span class="accent-txt">${visc}</span> — healthy range. Maintain with your current lifting + the odd Zone-2 session and fibre-rich meals. ${dropping ? `Nice work trimming it by ${Math.abs(viscChg)}.` : ""}`;
      cards.push(`<div class="coach-card ${tone}"><span class="coach-ico">${ico}</span><h3>${h}</h3><p>${body}</p></div>`);
    }

    /* 4 · Left / right balance */
    if (arms || legs) {
      const flags = [];
      if (arms && arms.pct >= 5) flags.push(`your <b>${arms.weaker} arm</b> trails by ${arms.pct}%`);
      if (legs && legs.pct >= 5) flags.push(`your <b>${legs.weaker} leg</b> trails by ${legs.pct}%`);
      if (flags.length) {
        cards.push(`<div class="coach-card tone-warn"><span class="coach-ico">⚖️</span><h3>Even out the imbalance</h3><p>Right now ${flags.join(" and ")}. Fix it with <b>unilateral work</b>:</p><ul><li>Swap some barbell lifts for dumbbells &amp; single-leg moves (split squats, lunges, single-arm rows/presses)</li><li>Always start the set with the <b>weaker side</b>, then match reps on the strong side</li><li>Add 1 extra set to the lagging limb for a few weeks</li></ul></div>`);
      } else {
        cards.push(`<div class="coach-card tone-good"><span class="coach-ico">🪞</span><h3>Beautifully symmetrical</h3><p>Left and right are within 5% on both arms and legs. Keep including unilateral accessory work so no side sneaks ahead.</p></div>`);
      }
    } else {
      cards.push(`<div class="coach-card tone-warn"><span class="coach-ico">🦾</span><h3>Track your symmetry</h3><p>Add the optional <b>segmental muscle breakdown</b> when you log a reading and the Coach will flag any left/right imbalance and prescribe unilateral fixes.</p></div>`);
    }

    /* 5 · Strength programming */
    const lowFit = fit != null && fit < 5;
    cards.push(`<div class="coach-card tone-good"><span class="coach-ico">🏋️</span><h3>Your strength blueprint</h3><p>${lowFit ? "Build the base with a <b>3× full-body week</b> — " : "Run a <b>4-day upper/lower or push-pull split</b> — "}compounds first, then accessories:</p><ul><li>Anchor lifts: squat, hinge/deadlift, press, row, pull-up</li><li><b>Progressive overload</b> — add a rep or a little load almost every week</li><li>10–20 hard sets per muscle per week; 2–3 min rest on the big lifts</li><li>Leave 1–2 reps in the tank, train each muscle 2×/week</li></ul></div>`);

    grid.innerHTML = cards.join("");
  }

  /* ============================================================ TROPHY CABINET */
  const BADGES = [
    { id: "firstContact", medal: "🛸", name: "First Contact", tier: "bronze",   desc: "Log your very first reading.",            test: c => ({ earned: c.n >= 1, progress: c.n / 1 }) },
    { id: "committed",    medal: "🔁", name: "Repeat Offender", tier: "silver", desc: "Log 5 readings. It's a habit now.",       test: c => ({ earned: c.n >= 5, progress: c.n / 5 }) },
    { id: "cabinet",      medal: "🏛️", name: "Cabinet Member", tier: "gold",    desc: "Log 10 readings. Certified regular.",     test: c => ({ earned: c.n >= 10, progress: c.n / 10 }) },
    { id: "fortnight",    medal: "🗓️", name: "Fortnight Phantom", tier: "bronze", desc: "Keep logging across 14+ days.",         test: c => ({ earned: c.spanDays >= 14, progress: c.spanDays / 14 }) },
    { id: "bulk",         medal: "💪", name: "The Incredible Bulk", tier: "gold", desc: "Pack on +2 kg of muscle since day one.", test: c => ({ earned: c.muscleChg != null && c.muscleChg >= 2, progress: c.muscleChg != null ? c.muscleChg / 2 : 0 }) },
    { id: "recomp",       medal: "🧬", name: "Recomp Royalty", tier: "platinum", desc: "Gain muscle AND cut fat % at once.",     test: c => ({ earned: c.muscleChg != null && c.fatChg != null && c.muscleChg > 0 && c.fatChg < 0, progress: null }) },
    { id: "fatWhisperer", medal: "🫠", name: "Fat Whisperer", tier: "silver",    desc: "Drop body fat by 2 percentage points.",   test: c => ({ earned: c.fatChg != null && c.fatChg <= -2, progress: c.fatChg != null ? (-c.fatChg) / 2 : 0 }) },
    { id: "visceral",     medal: "🛡️", name: "Visceral Vigilante", tier: "gold", desc: "Drop visceral fat by 2 whole levels.",   test: c => ({ earned: c.viscChg != null && c.viscChg <= -2, progress: c.viscChg != null ? (-c.viscChg) / 2 : 0 }) },
    { id: "symmetry",     medal: "⚖️", name: "The Even Steven", tier: "platinum", desc: "Arms & legs within 3% of each other.",  test: c => ({ earned: c.armBal != null && c.legBal != null && c.armBal <= 3 && c.legBal <= 3, progress: null }) },
    { id: "hydro",        medal: "💧", name: "Hydro Homie", tier: "bronze",      desc: "Hit 55%+ body water. Basically a cucumber.", test: c => ({ earned: c.waterLast != null && c.waterLast >= 55, progress: c.waterLast != null ? c.waterLast / 55 : 0 }) },
    { id: "benjamin",     medal: "⏳", name: "Benjamin Button", tier: "silver",  desc: "Knock 3 years off your metabolic age.",   test: c => ({ earned: c.bioChg != null && c.bioChg <= -3, progress: c.bioChg != null ? (-c.bioChg) / 3 : 0 }) },
    { id: "ironwill",     medal: "🦾", name: "Maxed Out", tier: "gold",          desc: "Reach fitness level 8.",                  test: c => ({ earned: c.fitMax != null && c.fitMax >= 8, progress: c.fitMax != null ? c.fitMax / 8 : 0 }) },
    { id: "trunk",        medal: "🌳", name: "Trunk Junk", tier: "silver",       desc: "Add 1 kg of trunk muscle.",               test: c => ({ earned: c.trunkChg != null && c.trunkChg >= 1, progress: c.trunkChg != null ? c.trunkChg / 1 : 0 }) },
    { id: "feather",      medal: "🪶", name: "Gravity Defiant", tier: "silver",  desc: "Shed 3 kg on the scale.",                 test: c => ({ earned: c.weightChg != null && c.weightChg <= -3, progress: c.weightChg != null ? (-c.weightChg) / 3 : 0 }) },
  ];

  function badgeContext() {
    const arms = imbalance("armRight", "armLeft"), legs = imbalance("legRight", "legLeft");
    const fitS = seriesOf("fitness");
    return {
      n: entries.length,
      spanDays: spanDays(),
      muscleChg: changeOf("muscle"),
      fatChg: changeOf("fat"),
      viscChg: changeOf("visceral"),
      bioChg: changeOf("bioage"),
      trunkChg: changeOf("trunk"),
      weightChg: changeOf("weight"),
      waterLast: lastVal("water"),
      fitMax: fitS.length ? Math.max(...fitS.map(e => num(e.fitness))) : null,
      armBal: arms ? arms.pct : null,
      legBal: legs ? legs.pct : null,
    };
  }

  function renderBadges(announce) {
    const ctx = badgeContext();
    const results = BADGES.map(b => ({ b, r: b.test(ctx) }));
    const earnedIds = results.filter(x => x.r.earned).map(x => x.b.id);

    // newly-unlocked detection
    let prev = [];
    try { prev = JSON.parse(localStorage.getItem(BADGE_KEY) || "[]"); } catch {}
    const fresh = earnedIds.filter(id => !prev.includes(id));
    localStorage.setItem(BADGE_KEY, JSON.stringify(earnedIds));
    if (announce && fresh.length) {
      if (fresh.length === 1) {
        const b = BADGES.find(x => x.id === fresh[0]);
        toast(`${b.medal} Badge unlocked: ${b.name}!`);
      } else {
        toast(`🏅 ${fresh.length} new badges unlocked!`);
      }
    }

    $("#badge-score").innerHTML = `<div class="bs-count">${earnedIds.length}<small>/${BADGES.length}</small></div><div class="bs-label">unlocked</div>`;

    $("#badge-grid").innerHTML = results.map(({ b, r }) => {
      const prog = r.progress == null ? null : Math.max(0, Math.min(1, r.progress));
      const bar = (!r.earned && prog != null && prog > 0)
        ? `<div class="b-prog"><span style="width:${(prog*100).toFixed(0)}%"></span></div>` : "";
      return `<div class="badge tier-${b.tier} ${r.earned ? "earned" : "locked"}" title="${r.earned ? "Unlocked!" : "Locked"}">
        <span class="b-tier">${b.tier}</span>
        <span class="b-medal">${b.medal}</span>
        <div class="b-name">${b.name}</div>
        <div class="b-desc">${b.desc}</div>
        ${bar}
      </div>`;
    }).join("");
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
    $("#seg-details").open = false;
    if (id) {
      const e = entries.find(x => x.id === id);
      if (e) {
        $("#modal-title").textContent = "Edit Reading";
        $("#f-id").value = e.id;
        $("#f-date").value = e.date;
        ALL_FIELDS.forEach(k => { const el = $("#f-" + k); if (el) el.value = e[k] ?? ""; });
        $("#btn-delete").hidden = false;
        // reveal the segmental panel if this reading has any segmental data
        if (SEGMENTS.some(s => num(e[s.key]) != null)) $("#seg-details").open = true;
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
    save(); render(true); closeModal();
  });

  $("#btn-delete").onclick = () => {
    const id = $("#f-id").value;
    if (!id) return;
    if (confirm("Delete this reading permanently?")) {
      entries = entries.filter(x => x.id !== id);
      save(); render(true); closeModal(); toast("Reading deleted.");
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
        save(); render(true);
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
    save(); render(true); toast("Sample data loaded.");
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
      entries = []; save(); render(true); toast("All readings erased.");
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
