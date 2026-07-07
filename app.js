/* Swarm Lab engine: fixed-timestep loop, spatial hash, pheromone field,
   Canvas 2D renderer, auto-generated param UI, and the user-code pipeline. */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;

/* ---------------- rng ---------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- helpers exposed to user code ---------------- */
const helpers = {
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  lerp: (a, b, t) => a + (b - a) * t,
  angleTo: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  limit(vx, vy, max) {
    const s = Math.hypot(vx, vy);
    if (s > max && s > 0) { vx *= max / s; vy *= max / s; }
    return [vx, vy];
  },
};

/* ---------------- spatial hash ---------------- */
class SpatialHash {
  constructor() { this.cell = 50; this.map = new Map(); }
  rebuild(agents, cell) {
    this.cell = helpers.clamp(cell, 16, 200);
    this.map.clear();
    const c = this.cell;
    for (const a of agents) {
      const k = Math.floor(a.y / c) * 4096 + Math.floor(a.x / c);
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(a);
    }
  }
  query(x, y, r, out, skip, world) {
    out.length = 0;
    const c = this.cell, r2 = r * r;
    const wrap = world.edgeMode === 'wrap';
    const W = world.width, H = world.height, hw = W / 2, hh = H / 2;
    const nx = Math.max(1, Math.ceil(W / c));
    const ny = Math.max(1, Math.ceil(H / c));
    const cx0 = Math.floor((x - r) / c), cy0 = Math.floor((y - r) / c);
    const spanX = Math.min(Math.floor((x + r) / c) - cx0, nx - 1);
    const spanY = Math.min(Math.floor((y + r) / c) - cy0, ny - 1);
    for (let j = 0; j <= spanY; j++) {
      for (let i = 0; i <= spanX; i++) {
        let kx = cx0 + i, ky = cy0 + j;
        if (wrap) { kx = ((kx % nx) + nx) % nx; ky = ((ky % ny) + ny) % ny; }
        else if (kx < 0 || ky < 0 || kx >= nx || ky >= ny) continue;
        const arr = this.map.get(ky * 4096 + kx);
        if (!arr) continue;
        for (const b of arr) {
          if (b === skip) continue;
          let dx = b.x - x, dy = b.y - y;
          if (wrap) {
            if (dx > hw) dx -= W; else if (dx < -hw) dx += W;
            if (dy > hh) dy -= H; else if (dy < -hh) dy += H;
          }
          if (dx * dx + dy * dy <= r2) out.push(b);
        }
      }
    }
    return out;
  }
}

/* ---------------- pheromone field (2 channels) ---------------- */
class Field {
  constructor(w, h, scale = 4) {
    this.scale = scale;
    this.w = Math.max(2, Math.ceil(w / scale));
    this.h = Math.max(2, Math.ceil(h / scale));
    this.data = new Float32Array(this.w * this.h * 2);
    this.tmp = new Float32Array(this.w * this.h * 2);
    this.cv = document.createElement('canvas');
    this.cv.width = this.w; this.cv.height = this.h;
    this.ictx = this.cv.getContext('2d');
    this.img = this.ictx.createImageData(this.w, this.h);
  }
  deposit(x, y, amt, ch = 0) {
    const gx = (x / this.scale) | 0, gy = (y / this.scale) | 0;
    if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) return;
    const i = (gy * this.w + gx) * 2 + (ch ? 1 : 0);
    this.data[i] = Math.min(3, this.data[i] + amt);
  }
  sense(x, y, ch = 0) {
    let gx = (x / this.scale) | 0, gy = (y / this.scale) | 0;
    gx = helpers.clamp(gx, 0, this.w - 1); gy = helpers.clamp(gy, 0, this.h - 1);
    return this.data[(gy * this.w + gx) * 2 + (ch ? 1 : 0)];
  }
  decay(k) { const d = this.data; for (let i = 0; i < d.length; i++) d[i] *= k; }
  blur() {
    const { w, h, data: d, tmp: t } = this;
    for (let y = 0; y < h; y++) {
      const up = y > 0 ? y - 1 : y, dn = y < h - 1 ? y + 1 : y;
      for (let x = 0; x < w; x++) {
        const lf = x > 0 ? x - 1 : x, rt = x < w - 1 ? x + 1 : x;
        for (let ch = 0; ch < 2; ch++) {
          const i = (y * w + x) * 2 + ch;
          t[i] = d[i] * 0.72 +
            (d[(y * w + lf) * 2 + ch] + d[(y * w + rt) * 2 + ch] +
             d[(up * w + x) * 2 + ch] + d[(dn * w + x) * 2 + ch]) * 0.07;
        }
      }
    }
    this.data = t; this.tmp = d;
  }
  draw(ctx, W, H, c0, c1) {
    const d = this.data, px = this.img.data;
    for (let i = 0, n = this.w * this.h; i < n; i++) {
      const a0 = Math.min(1, d[i * 2]), a1 = Math.min(1, d[i * 2 + 1]);
      const s = a0 + a1;
      if (s < 0.02) { px[i * 4 + 3] = 0; continue; }
      px[i * 4]     = (c0[0] * a0 + c1[0] * a1) / s;
      px[i * 4 + 1] = (c0[1] * a0 + c1[1] * a1) / s;
      px[i * 4 + 2] = (c0[2] * a0 + c1[2] * a1) / s;
      px[i * 4 + 3] = Math.min(210, s * 210);
    }
    this.ictx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.cv, 0, 0, W, H);
  }
}

/* ---------------- theme-aware colours ---------------- */
const PALETTES = {
  light: {
    species: ['#D56062', '#2f6f8f', '#5a8f3c', '#c9821f', '#7b5fd0', '#218f7c'],
    glowCore: '#fff3b0', glowHalo: '#e8b32a',
    trailHome: [47, 111, 143], trailFood: [213, 96, 98],
    panel: [255, 250, 240], hud: '#74726a',
  },
  dark: {
    species: ['#ff9aa0', '#7fc4e8', '#a3d977', '#ffc86b', '#c4b5fd', '#7fe0cf'],
    glowCore: '#fff8c4', glowHalo: '#ffd75e',
    trailHome: [127, 196, 232], trailFood: [255, 154, 160],
    panel: [59, 60, 57], hud: '#b9b08f',
  },
};
let pal = PALETTES.light;
function syncTheme() {
  pal = PALETTES[document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'];
  forceRedraw = true;
}
new MutationObserver(syncTheme)
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------------- state ---------------- */
const canvas = $('sim'), ctx = canvas.getContext('2d');
const hash = new SpatialHash();
const neighborBuf = [];

let preset = null, params = {}, agents = [], world = null, userFn = null;
let agentCount = 0, speed = 1, running = true;
let slowFrames = 0, stepped = false, forceRedraw = true;
let fps = 60, hudTimer = 0;

function makeWorld(w, h) {
  const wd = {
    width: w, height: h, dt: 1 / 60, time: 0, frame: 0,
    edgeMode: preset.edgeMode,
    rng: mulberry32((Math.random() * 2 ** 31) | 0),
    pheromone: null, food: null, nest: null,
    wrapDx(from, to) {
      let d = to - from;
      if (this.edgeMode !== 'wrap') return d;
      if (d > this.width / 2) d -= this.width;
      else if (d < -this.width / 2) d += this.width;
      return d;
    },
    wrapDy(from, to) {
      let d = to - from;
      if (this.edgeMode !== 'wrap') return d;
      if (d > this.height / 2) d -= this.height;
      else if (d < -this.height / 2) d += this.height;
      return d;
    },
  };
  if (preset.usesField) wd.pheromone = new Field(w, h);
  return wd;
}

const AGENT_DEFAULTS = {
  x: 0, y: 0, vx: 0, vy: 0, species: 0, phase: 0, glow: 0,
  justFlashed: false, state: '', energy: 100,
};
function resetWorld() {
  const { width, height } = canvasSize();
  world = makeWorld(width, height);
  agents = preset.setup(world, params, agentCount);
  for (const a of agents) {
    for (const k in AGENT_DEFAULTS) if (!(k in a)) a[k] = AGENT_DEFAULTS[k];
    if (!a.mem) a.mem = {};
  }
  slowFrames = 0;
  forceRedraw = true;
}

/* ---------------- canvas sizing ---------------- */
function canvasSize() {
  const r = canvas.parentElement.getBoundingClientRect();
  return { width: Math.max(50, r.width - 6), height: Math.max(50, r.height - 6) };
}
function sizeCanvas() {
  const { width, height } = canvasSize();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (world) {
    const fieldChanged = world.width !== width || world.height !== height;
    world.width = width; world.height = height;
    for (const a of agents) {
      a.x = helpers.clamp(a.x, 0, width - 0.01);
      a.y = helpers.clamp(a.y, 0, height - 0.01);
    }
    if (fieldChanged && preset.usesField) world.pheromone = new Field(width, height);
    forceRedraw = true;
  }
}

/* ---------------- simulation step ---------------- */
function step() {
  const dt = world.dt;
  const radius = preset.radius(params);
  hash.rebuild(agents, radius);
  try {
    for (const a of agents) {
      hash.query(a.x, a.y, radius, neighborBuf, a, world);
      userFn(a, neighborBuf, world, params, helpers);
    }
  } catch (e) {
    pauseWithError('RUNTIME: ' + e.message);
    return;
  }
  const w = world.width, h = world.height;
  if (world.edgeMode === 'wrap') {
    for (const a of agents) {
      a.x += a.vx * dt; a.y += a.vy * dt;
      if (a.x < 0 || a.x >= w) a.x = ((a.x % w) + w) % w;
      if (a.y < 0 || a.y >= h) a.y = ((a.y % h) + h) % h;
    }
  } else {
    for (const a of agents) {
      a.x += a.vx * dt; a.y += a.vy * dt;
      if (a.x < 0) { a.x = -a.x; a.vx = Math.abs(a.vx); }
      else if (a.x > w) { a.x = 2 * w - a.x; a.vx = -Math.abs(a.vx); }
      if (a.y < 0) { a.y = -a.y; a.vy = Math.abs(a.vy); }
      else if (a.y > h) { a.y = 2 * h - a.y; a.vy = -Math.abs(a.vy); }
      a.x = helpers.clamp(a.x, 0, w); a.y = helpers.clamp(a.y, 0, h);
    }
  }
  if (preset.post) preset.post(world, params);
  world.time += dt; world.frame++;
  stepped = true;
}

/* ---------------- render ---------------- */
function render() {
  if (!stepped && !forceRedraw) return;
  const w = world.width, h = world.height;
  const fade = forceRedraw ? 1 : preset.fade;
  const [pr, pg, pb] = pal.panel;
  ctx.fillStyle = `rgba(${pr},${pg},${pb},${fade})`;
  ctx.fillRect(0, 0, w, h);

  if (world.pheromone) world.pheromone.draw(ctx, w, h, pal.trailHome, pal.trailFood);
  if (preset.drawUnder) preset.drawUnder(ctx, world);

  const mode = preset.render, colors = pal.species;
  if (mode === 'tri') {
    // one path per species: batching fills is much faster than per-agent fill()
    for (let sp = 0; sp < colors.length; sp++) {
      ctx.fillStyle = colors[sp];
      ctx.beginPath();
      let any = false;
      for (const a of agents) {
        if (a.species % colors.length !== sp) continue;
        any = true;
        const ang = Math.atan2(a.vy, a.vx);
        const c = Math.cos(ang), s = Math.sin(ang);
        ctx.moveTo(a.x + c * 7, a.y + s * 7);
        ctx.lineTo(a.x - c * 4 - s * 3.5, a.y - s * 4 + c * 3.5);
        ctx.lineTo(a.x - c * 4 + s * 3.5, a.y - s * 4 - c * 3.5);
        ctx.closePath();
      }
      if (any) ctx.fill();
    }
  } else if (mode === 'glow') {
    for (const a of agents) {
      const g = helpers.clamp(a.glow || 0, 0, 1);
      if (g > 0.02) {
        ctx.globalAlpha = g * 0.45;
        ctx.fillStyle = pal.glowHalo;
        ctx.beginPath(); ctx.arc(a.x, a.y, 3 + g * 9, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.glowCore;
        ctx.beginPath(); ctx.arc(a.x, a.y, 2 + g * 1.5, 0, TAU); ctx.fill();
      } else {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = pal.hud;
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.6, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  } else {
    for (let sp = 0; sp < colors.length; sp++) {
      ctx.fillStyle = colors[sp];
      ctx.beginPath();
      let any = false;
      for (const a of agents) {
        if (a.species % colors.length !== sp) continue;
        any = true;
        ctx.moveTo(a.x + 2.4, a.y);
        ctx.arc(a.x, a.y, 2.4, 0, TAU);
      }
      if (any) ctx.fill();
    }
  }
  stepped = false; forceRedraw = false;
}

/* ---------------- main loop ---------------- */
let last = performance.now(), acc = 0;
function tick(now) {
  requestAnimationFrame(tick);
  let el = (now - last) / 1000;
  last = now;
  if (el <= 0) el = 1 / 60;   // duplicate/frozen rAF timestamps: assume one nominal frame
  if (el > 0.25) el = 0.25;
  fps = fps * 0.95 + (1 / Math.max(el, 1e-4)) * 0.05;

  if (running && world) {
    acc += el * speed;
    let n = 0;
    while (acc >= world.dt && n < 6 && running) {
      const t0 = performance.now();
      step();
      acc -= world.dt; n++;
      if (performance.now() - t0 > 50) {
        acc = 0;
        if (++slowFrames >= 2) pauseWithError('TOO SLOW: code is taking >50ms per tick — paused.');
        break;
      }
      slowFrames = 0;
    }
    if (acc >= world.dt) acc = 0; // can't keep up: drop time, don't spiral
  }
  if (world) render();

  hudTimer -= el;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    $('hud').textContent = `${Math.round(fps)} FPS · ${agents.length} AGENTS · T ${world ? world.time.toFixed(0) : 0}S` + (running ? '' : ' · PAUSED');
  }
}

/* ---------------- code pipeline ---------------- */
const codeEl = $('code'), gutterEl = $('gutter'), errEl = $('errStrip');

function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }
function clearError() { errEl.hidden = true; }
function pauseWithError(msg) { running = false; $('pauseBtn').textContent = 'RESUME'; showError(msg); }

function applyCode() {
  try {
    userFn = new Function('agent', 'neighbors', 'world', 'params', 'helpers',
      '"use strict";\n' + codeEl.value);
    clearError();
    slowFrames = 0;
    return true;
  } catch (e) {
    showError('SYNTAX: ' + e.message);
    return false;
  }
}
function revertCode() {
  codeEl.value = preset.code;
  updateGutter();
  applyCode();
}
function updateGutter() {
  const lines = codeEl.value.split('\n').length;
  let s = '';
  for (let i = 1; i <= lines; i++) s += i + '\n';
  gutterEl.textContent = s;
  gutterEl.scrollTop = codeEl.scrollTop;
}
codeEl.addEventListener('input', updateGutter);
codeEl.addEventListener('scroll', () => { gutterEl.scrollTop = codeEl.scrollTop; });
codeEl.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = codeEl.selectionStart, t = codeEl.selectionEnd;
    codeEl.value = codeEl.value.slice(0, s) + '  ' + codeEl.value.slice(t);
    codeEl.selectionStart = codeEl.selectionEnd = s + 2;
    updateGutter();
  }
});
$('applyBtn').onclick = applyCode;
$('revertBtn').onclick = revertCode;

/* ---------------- parameter UI ---------------- */
function buildSliders() {
  const box = $('sliders');
  box.innerHTML = '';
  for (const s of preset.schema) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lab = document.createElement('div');
    lab.className = 'slider-label';
    lab.innerHTML = `<span>${s.label}</span><span class="val" id="val_${s.key}">${params[s.key]}</span>`;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = params[s.key];
    inp.addEventListener('input', () => {
      params[s.key] = parseFloat(inp.value);
      $('val_' + s.key).textContent = inp.value;
    });
    if (s.reset) inp.addEventListener('change', () => { onSpeciesCountChange(); });
    row.append(lab, inp);
    box.append(row);
  }
  // global controls
  const g = $('globalSliders');
  g.innerHTML = '';
  const rows = [
    { label: 'AGENTS', min: preset.counts.min, max: preset.counts.max, step: 10, val: agentCount,
      oninput: v => { $('val_agents').textContent = Math.round(v); },
      onchange: v => { agentCount = Math.round(v); resetWorld(); }, id: 'agents' },
    { label: 'SPEED', min: 0, max: 4, step: 0.1, val: speed,
      oninput: v => { speed = v; $('val_speed').textContent = v.toFixed(1) + 'x'; }, id: 'speed' },
  ];
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lab = document.createElement('div');
    lab.className = 'slider-label';
    const shown = r.id === 'speed' ? r.val.toFixed(1) + 'x' : r.val;
    lab.innerHTML = `<span>${r.label}</span><span class="val" id="val_${r.id}">${shown}</span>`;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = r.min; inp.max = r.max; inp.step = r.step; inp.value = r.val;
    inp.addEventListener('input', () => r.oninput(parseFloat(inp.value)));
    if (r.onchange) inp.addEventListener('change', () => r.onchange(parseFloat(inp.value)));
    row.append(lab, inp);
    g.append(row);
  }
}

/* ---------------- particle-life matrix UI ---------------- */
function onSpeciesCountChange() {
  const S = Math.round(params.species);
  const old = params.matrix || [];
  const rng = Math.random;
  const m = [];
  for (let i = 0; i < S; i++) {
    m.push([]);
    for (let j = 0; j < S; j++)
      m[i].push(old[i] && old[i][j] !== undefined ? old[i][j] : Math.round((rng() * 2 - 1) * 20) / 20);
  }
  params.matrix = m;
  buildMatrixUI();
  resetWorld();
}
function matrixCellColor(v) {
  if (v > 0) return `rgba(90,143,60,${0.15 + v * 0.75})`;
  if (v < 0) return `rgba(213,96,98,${0.15 - v * 0.75})`;
  return 'transparent';
}
function buildMatrixUI() {
  const wrap = $('matrixWrap');
  if (preset.extraUI !== 'matrix') { wrap.hidden = true; return; }
  wrap.hidden = false;
  const S = params.matrix.length;
  const grid = $('matrixGrid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `18px repeat(${S}, 26px)`;
  // header row: empty corner + column dots ("effect of column ON row")
  grid.append(document.createElement('span'));
  for (let j = 0; j < S; j++) grid.append(speciesDot(j));
  for (let i = 0; i < S; i++) {
    grid.append(speciesDot(i));
    for (let j = 0; j < S; j++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'mcell';
      const v = params.matrix[i][j];
      cell.style.background = matrixCellColor(v);
      cell.title = `${i}→${j}: ${v}  (click +0.25, shift-click −0.25)`;
      cell.textContent = v > 0 ? '+' : v < 0 ? '−' : '·';
      cell.addEventListener('click', e => {
        let nv = params.matrix[i][j] + (e.shiftKey ? -0.25 : 0.25);
        if (nv > 1.001) nv = -1; if (nv < -1.001) nv = 1;
        params.matrix[i][j] = Math.round(nv * 100) / 100;
        buildMatrixUI();
      });
      grid.append(cell);
    }
  }
}
function speciesDot(i) {
  const d = document.createElement('span');
  d.className = 'sdot';
  d.style.background = pal.species[i % pal.species.length];
  return d;
}
$('matrixRandom').onclick = () => {
  params.matrix = PRESETS.plife.makeMatrix(params.matrix.length, Math.random);
  buildMatrixUI();
};
$('matrixClear').onclick = () => {
  const S = params.matrix.length;
  params.matrix = params.matrix.map(row => row.map(() => 0));
  buildMatrixUI();
};

/* ---------------- preset selection ---------------- */
function defaultsFor(p) {
  const out = {};
  for (const s of p.schema) out[s.key] = s.def;
  return out;
}
function selectPreset(id, opts = {}) {
  preset = PRESETS[id];
  params = opts.params || defaultsFor(preset);
  agentCount = opts.count || preset.counts.def;
  if (preset.extraUI === 'matrix' && !params.matrix)
    params.matrix = preset.makeMatrix(Math.round(params.species), Math.random);
  for (const b of document.querySelectorAll('#presetButtons button'))
    b.classList.toggle('on', b.dataset.id === id);
  $('presetDesc').textContent = preset.desc;
  buildSliders();
  buildMatrixUI();
  codeEl.value = opts.code || preset.code;
  updateGutter();
  applyCode();
  resetWorld();
  running = true;
  $('pauseBtn').textContent = 'PAUSE';
}

function buildPresetButtons() {
  const box = $('presetButtons');
  for (const id in PRESETS) {
    const p = PRESETS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = id;
    b.textContent = p.name;
    b.onclick = () => selectPreset(id);
    box.append(b);
  }
}

/* ---------------- transport controls ---------------- */
$('pauseBtn').onclick = () => {
  running = !running;
  $('pauseBtn').textContent = running ? 'PAUSE' : 'RESUME';
  if (running) { clearError(); slowFrames = 0; last = performance.now(); acc = 0; }
};
$('stepBtn').onclick = () => {
  if (running) { running = false; $('pauseBtn').textContent = 'RESUME'; }
  step();
};
$('resetBtn').onclick = () => { resetWorld(); clearError(); };

/* ---------------- share links ---------------- */
function b64encode(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64decode(s) { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); }

$('shareBtn').onclick = () => {
  const payload = { v: 1, p: preset.id, params, count: agentCount, code: codeEl.value };
  const url = location.origin + location.pathname + '#c=' + b64encode(JSON.stringify(payload));
  navigator.clipboard.writeText(url).then(() => {
    const b = $('shareBtn'); b.textContent = 'COPIED!';
    setTimeout(() => { b.textContent = 'SHARE'; }, 1400);
  }, () => showError('CLIPBOARD: copy failed — link: ' + url));
};

function tryLoadShared() {
  const p = location.hash.match(/^#p=(\w+)$/);   // plain preset link — no code, no consent needed
  if (p && PRESETS[p[1]]) { selectPreset(p[1]); return true; }
  const m = location.hash.match(/^#c=([A-Za-z0-9_-]+)$/);
  if (!m) return false;
  let payload;
  try {
    payload = JSON.parse(b64decode(m[1]));
    if (!payload || !PRESETS[payload.p] || typeof payload.code !== 'string') throw new Error('bad');
  } catch { history.replaceState(null, '', location.pathname); return false; }

  // Never auto-run shared code: show it and ask first.
  $('overlayCode').textContent = payload.code;
  $('overlay').hidden = false;
  $('overlayRun').onclick = () => {
    $('overlay').hidden = true;
    selectPreset(payload.p, {
      params: payload.params, count: payload.count, code: payload.code,
    });
  };
  $('overlayDiscard').onclick = () => {
    $('overlay').hidden = true;
    history.replaceState(null, '', location.pathname);
    selectPreset('boids');
  };
  return true;
}

/* ---------------- boot ---------------- */
syncTheme();
buildPresetButtons();
sizeCanvas();
if (!tryLoadShared()) selectPreset('boids');
new ResizeObserver(() => sizeCanvas()).observe(canvas.parentElement);
requestAnimationFrame(t => { last = t; tick(t); });

})();
