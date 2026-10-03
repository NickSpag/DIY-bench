// Spike: minimal guillotine sheet packer with multiple stock sizes, owned offcuts,
// per-part grain lock and kerf. Question it answers: can ~150 lines reproduce the
// closet's hand-drawn phase 1 layout (one 4x8 + one 4x4 prefinished; everything
// unfinished on the owned 56x48 piece)?
//
// Conventions: a stock sheet has length L along its grain and width W across it.
// A part has length l (along its own grain) and width w. grain: "lock" means the
// part's l must run along the sheet's L; "free" allows a 90 degree turn.

const EPS = 1e-6;

function packMaterial({ stock, parts, kerf }) {
  // stock: [{ id, L, W, qty (Infinity for purchasable), owned: bool }]
  const orders = {
    area: (a, b) => b.l * b.w - a.l * a.w,
    long: (a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w),
    perim: (a, b) => b.l + b.w - (a.l + a.w),
  };
  const splits = ["shorterLeftover", "longerLeftover", "alongGrain"];
  let best = null;
  for (const [oname, ord] of Object.entries(orders)) {
    for (const split of splits) for (const prefer of [null, ...stock.map(s => s.id)]) {
      const r = run(stock, [...parts].sort(ord), kerf, split, prefer);
      if (!r) continue;
      r.strategy = `${oname}/${split}/prefer=${prefer}`;
      if (!best || score(r) < score(best)) best = r;
    }
  }
  return best;
}

// fewer purchased square inches first, then fewer sheets, then bigger largest offcut
function score(r) {
  const bought = r.sheets.filter(s => !s.stock.owned).reduce((a, s) => a + s.stock.L * s.stock.W, 0);
  const largestFree = Math.max(0, ...r.sheets.flatMap(s => s.free.map(f => f.l * f.w)));
  return bought * 1e6 + r.sheets.length * 1e3 - largestFree / 1e3;
}

function run(stock, parts, kerf, split, prefer) {
  const remaining = new Map(stock.map(s => [s.id, s.qty]));
  const sheets = [];
  for (const p of parts) {
    let placed = tryPlace(sheets, p, kerf, split);
    if (!placed) {
      // open a new sheet: owned stock first, then the smallest purchasable sheet that fits
      const candidates = stock
        .filter(s => remaining.get(s.id) > 0 && orientations(p).some(o => o.l <= s.L + EPS && o.w <= s.W + EPS))
        .sort((a, b) => (b.owned - a.owned) || ((b.id === prefer) - (a.id === prefer)) || (a.L * a.W - b.L * b.W));
      if (!candidates.length) return null;
      const s = candidates[0];
      remaining.set(s.id, remaining.get(s.id) - 1);
      sheets.push({ stock: s, free: [{ x: 0, y: 0, l: s.L, w: s.W }], placed: [] });
      placed = tryPlace(sheets, p, kerf, split);
      if (!placed) return null;
    }
  }
  return { sheets };
}

function orientations(p) {
  const o = [{ l: p.l, w: p.w, turned: false }];
  if (p.grain === "free" && Math.abs(p.l - p.w) > EPS) o.push({ l: p.w, w: p.l, turned: true });
  return o;
}

// best short side fit across all open sheets
function tryPlace(sheets, p, kerf, split) {
  let best = null;
  sheets.forEach((sh, si) => sh.free.forEach((f, fi) => {
    for (const o of orientations(p)) {
      if (o.l <= f.l + EPS && o.w <= f.w + EPS) {
        const ss = Math.min(f.l - o.l, f.w - o.w);
        if (!best || ss < best.ss) best = { si, fi, o, ss };
      }
    }
  }));
  if (!best) return false;
  const sh = sheets[best.si];
  const f = sh.free.splice(best.fi, 1)[0];
  const { o } = best;
  sh.placed.push({ id: p.id, x: f.x, y: f.y, l: o.l, w: o.w, turned: o.turned });
  // guillotine split of the leftover L-shape into two rectangles, kerf removed at each cut
  const rl = f.l - o.l - kerf; // strip beside the part, along L
  const rw = f.w - o.w - kerf; // strip beside the part, across W
  let horizontalFirst; // true: first cut runs along L (rip), full length of f
  if (split === "alongGrain") horizontalFirst = true;
  else {
    const shorterLeftover = rl < rw;
    horizontalFirst = split === "shorterLeftover" ? shorterLeftover : !shorterLeftover;
  }
  const a = horizontalFirst
    ? [{ x: f.x + o.l + kerf, y: f.y, l: rl, w: o.w }, { x: f.x, y: f.y + o.w + kerf, l: f.l, w: rw }]
    : [{ x: f.x + o.l + kerf, y: f.y, l: rl, w: f.w }, { x: f.x, y: f.y + o.w + kerf, l: o.l, w: rw }];
  for (const r of a) if (r.l > EPS && r.w > EPS) sh.free.push(r);
  return true;
}

// ---------- closet fixture (current design, 2026-10-03 13:04) ----------
const kerf = 0.125;
const prefinished = {
  stock: [
    { id: "4x8", L: 96, W: 48, qty: Infinity, owned: false },
    { id: "4x4", L: 48, W: 48, qty: Infinity, owned: false },
    { id: "2x4", L: 48, W: 24, qty: Infinity, owned: false },
  ],
  parts: [
    { id: "partition-left", l: 84, w: 23.25, grain: "lock" },
    { id: "partition-right", l: 84, w: 23.25, grain: "lock" },
    { id: "shelf-right-70", l: 28, w: 11.25, grain: "free" }, // cross-grain accepted: the nosing covers the edge
    { id: "center-shelf-fixed", l: 22.5, w: 23.25, grain: "lock" },
    { id: "center-shelf-adj-1", l: 22.375, w: 22.5, grain: "lock" },
    { id: "center-shelf-adj-2", l: 22.375, w: 22.5, grain: "lock" },
    { id: "center-shelf-adj-3", l: 22.375, w: 22.5, grain: "lock" },
  ],
  kerf,
};
// the four faces are one grain-matched strip: lengths summed with kerf between them
const faces = [27.625, 7.875, 6.875, 5.875];
const strip = faces.reduce((a, b) => a + b, 0) + kerf * (faces.length - 1);
const unfinished = {
  stock: [{ id: "owned-56x48", L: 56, W: 48, qty: 1, owned: true }, { id: "4x8", L: 96, W: 48, qty: Infinity, owned: false }],
  parts: [
    { id: "faces-strip", l: strip, w: 23.25, grain: "lock" },
    { id: "top-shelf-left", l: 28, w: 11.25, grain: "lock" },
    { id: "top-shelf-right", l: 28, w: 11.25, grain: "lock" },
    { id: "top-shelf-center", l: 24, w: 11.25, grain: "lock" },
    { id: "nailer-top", l: 22.5, w: 3.5, grain: "free" },
    { id: "nailer-70", l: 22.5, w: 3.5, grain: "free" },
  ],
  kerf,
};
console.log("faces strip length", strip);

function check(r) {
  // invariant: no two parts on a sheet overlap (kerf included), and all inside the sheet
  for (const s of r.sheets) {
    for (const p of s.placed) {
      if (p.x < -EPS || p.y < -EPS || p.x + p.l > s.stock.L + EPS || p.y + p.w > s.stock.W + EPS) throw new Error("out of sheet " + p.id);
    }
    for (let i = 0; i < s.placed.length; i++) for (let j = i + 1; j < s.placed.length; j++) {
      const a = s.placed[i], b = s.placed[j];
      const sep = a.x + a.l + kerf <= b.x + EPS || b.x + b.l + kerf <= a.x + EPS || a.y + a.w + kerf <= b.y + EPS || b.y + b.w + kerf <= a.y + EPS;
      if (!sep) throw new Error(`overlap ${a.id} ${b.id}`);
    }
  }
}

for (const [name, m] of [["3/4 prefinished", prefinished], ["3/4 unfinished", unfinished]]) {
  const t = performance.now();
  const r = packMaterial(m);
  const ms = (performance.now() - t).toFixed(2);
  check(r);
  console.log(`${name}: ${r.sheets.map(s => s.stock.id).join(" + ")}  (${r.strategy}, ${ms} ms)`);
  for (const s of r.sheets) console.log(`  ${s.stock.id}: ` + s.placed.map(p => `${p.id}@(${p.x},${p.y}) ${p.l}x${p.w}${p.turned ? " turned" : ""}`).join("; "));
}
