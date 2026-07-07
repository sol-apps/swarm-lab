/* Swarm Lab presets.
   Each preset's `code` string is the BODY of:
     function update(agent, neighbors, world, params, helpers) { ... }
   run once per agent per tick. The default code IS the implementation —
   everything a preset does is expressible in the same API users edit. */

window.PRESETS = {

  boids: {
    id: 'boids',
    name: 'BOIDS',
    desc: 'Reynolds’ flocking: each bird steers by cohesion, alignment and separation with nearby birds.',
    edgeMode: 'wrap',
    render: 'tri',
    fade: 1,
    counts: { def: 250, min: 20, max: 1000 },
    radius: p => p.perception,
    schema: [
      { key: 'perception', label: 'PERCEPTION', min: 20, max: 120, step: 1, def: 60 },
      { key: 'cohesion',   label: 'COHESION',   min: 0,  max: 8,   step: 0.1, def: 3.5 },
      { key: 'align',      label: 'ALIGNMENT',  min: 0,  max: 8,   step: 0.1, def: 3.5 },
      { key: 'separation', label: 'SEPARATION', min: 0,  max: 2000, step: 10, def: 700 },
      { key: 'space',      label: 'SPACING',    min: 5,  max: 40,  step: 1, def: 22 },
      { key: 'maxSpeed',   label: 'MAX SPEED',  min: 40, max: 300, step: 5, def: 170 },
    ],
    setup(w, p, n) {
      const A = [];
      for (let i = 0; i < n; i++) {
        const a = w.rng() * Math.PI * 2;
        A.push({ x: w.rng() * w.width, y: w.rng() * w.height,
                 vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 });
      }
      return A;
    },
    code: `// BOIDS — three rules, no leader.
let cx = 0, cy = 0;          // cohesion: drift toward the local centre
let ax = 0, ay = 0;          // alignment: match neighbours' heading
let sx = 0, sy = 0;          // separation: push off anyone too close
let n = 0;

for (const b of neighbors) {
  const dx = world.wrapDx(agent.x, b.x);   // shortest path, even across edges
  const dy = world.wrapDy(agent.y, b.y);
  const d  = Math.hypot(dx, dy) || 0.001;
  cx += dx;  cy += dy;
  ax += b.vx; ay += b.vy;
  if (d < params.space) {                  // inverse-square shove
    sx -= dx / (d * d); sy -= dy / (d * d);
  }
  n++;
}

if (n > 0) {
  const dt = world.dt;
  agent.vx += (cx / n) * params.cohesion * dt;
  agent.vy += (cy / n) * params.cohesion * dt;
  agent.vx += (ax / n - agent.vx) * params.align * dt;
  agent.vy += (ay / n - agent.vy) * params.align * dt;
  agent.vx += sx * params.separation * dt;
  agent.vy += sy * params.separation * dt;
}

// speed limits: never stall, never rocket
[agent.vx, agent.vy] = helpers.limit(agent.vx, agent.vy, params.maxSpeed);
const sp = Math.hypot(agent.vx, agent.vy);
if (sp < 50) { agent.vx *= 50 / (sp || 1); agent.vy *= 50 / (sp || 1); }`,
  },

  predprey: {
    id: 'predprey',
    name: 'PRED–PREY',
    desc: 'Prey (blue) herd together and flee; predators (red) chase, tire, and starve',
    edgeMode: 'bounce',
    render: 'tri',
    fade: 1,
    counts: { def: 160, min: 40, max: 500 },
    radius: p => Math.max(p.fleeRadius, p.huntRadius),
    schema: [
      { key: 'preySpeed',  label: 'PREY SPEED', min: 60, max: 260, step: 5, def: 150 },
      { key: 'predSpeed',  label: 'PRED SPEED', min: 60, max: 300, step: 5, def: 185 },
      { key: 'fleeRadius', label: 'FLEE RADIUS', min: 30, max: 200, step: 5, def: 95 },
      { key: 'huntRadius', label: 'HUNT RADIUS', min: 40, max: 260, step: 5, def: 170 },
      { key: 'drain',      label: 'PRED HUNGER', min: 2, max: 20, step: 0.5, def: 6 },
    ],
    setup(w, p, n) {
      const A = [];
      for (let i = 0; i < n; i++)
        A.push({ x: w.rng() * w.width, y: w.rng() * w.height,
                 vx: (w.rng() - 0.5) * 100, vy: (w.rng() - 0.5) * 100, species: 1 });
      const preds = Math.max(3, Math.round(n / 20));
      for (let i = 0; i < preds; i++)
        A.push({ x: w.rng() * w.width, y: w.rng() * w.height,
                 vx: 0, vy: 0, species: 0, energy: 100 });
      return A;
    },
    code: `// PREY are species 1 (blue), PREDATORS species 0 (red).
const dt = world.dt;

if (agent.species === 1) {
  // ---- PREY: flee the nearest predator, otherwise herd loosely ----
  let px = 0, py = 0, pd = 1e9;
  let cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
  for (const b of neighbors) {
    const dx = b.x - agent.x, dy = b.y - agent.y;
    const d  = Math.hypot(dx, dy) || 0.001;
    if (b.species === 0) {
      if (d < pd) { pd = d; px = dx; py = dy; }
    } else {
      cx += dx; cy += dy; n++;
      if (d < 18) { sx -= dx / (d * d); sy -= dy / (d * d); }
    }
  }
  if (pd < params.fleeRadius) {                 // PANIC — run directly away
    agent.vx -= (px / pd) * 1200 * dt;
    agent.vy -= (py / pd) * 1200 * dt;
  } else if (n > 0) {                           // calm — mild flocking
    agent.vx += (cx / n) * 1.5 * dt + sx * 500 * dt;
    agent.vy += (cy / n) * 1.5 * dt + sy * 500 * dt;
  }
  agent.vx += (world.rng() - 0.5) * 80 * dt;    // wander
  agent.vy += (world.rng() - 0.5) * 80 * dt;
  [agent.vx, agent.vy] = helpers.limit(agent.vx, agent.vy, params.preySpeed);

} else {
  // ---- PREDATOR: chase the nearest prey in range ----
  let tgt = null, td = 1e9;
  for (const b of neighbors) {
    if (b.species !== 1) continue;
    const d = helpers.dist(agent.x, agent.y, b.x, b.y);
    if (d < td) { td = d; tgt = b; }
  }
  if (tgt && td < params.huntRadius) {
    agent.vx += ((tgt.x - agent.x) / td) * 700 * dt;
    agent.vy += ((tgt.y - agent.y) / td) * 700 * dt;
    if (td < 8) {                               // caught! prey reborn elsewhere
      tgt.x = world.rng() * world.width;
      tgt.y = world.rng() * world.height;
      tgt.vx = tgt.vy = 0;
      agent.energy = Math.min(140, agent.energy + 40);
    }
  } else {
    agent.vx += (world.rng() - 0.5) * 200 * dt; // prowl
    agent.vy += (world.rng() - 0.5) * 200 * dt;
  }
  [agent.vx, agent.vy] = helpers.limit(agent.vx, agent.vy, params.predSpeed);

  agent.energy -= params.drain * dt;            // hunting is hungry work
  if (agent.energy <= 0) {                      // starved — reborn at the edge
    agent.x = world.rng() < 0.5 ? 2 : world.width - 2;
    agent.y = world.rng() * world.height;
    agent.energy = 100;
  }
}`,
  },

  ants: {
    id: 'ants',
    name: 'ANTS',
    desc: 'Ants leave pheromone trails: HOME scent while seeking (red ants), FOOD scent while returning (green).',
    edgeMode: 'wrap',
    render: 'dot',
    fade: 1,
    usesField: true,
    counts: { def: 300, min: 50, max: 700 },
    radius: () => 8,
    schema: [
      { key: 'deposit',    label: 'DEPOSIT',     min: 5,   max: 80,  step: 1,    def: 30 },
      { key: 'evap',       label: 'EVAPORATION', min: 0.1, max: 2.5, step: 0.05, def: 0.6 },
      { key: 'senseAngle', label: 'SENSE ANGLE', min: 0.2, max: 1.2, step: 0.05, def: 0.5 },
      { key: 'senseDist',  label: 'SENSE DIST',  min: 6,   max: 32,  step: 1,    def: 16 },
      { key: 'jitter',     label: 'WANDER',      min: 0,   max: 0.8, step: 0.02, def: 0.22 },
    ],
    setup(w, p, n) {
      w.nest = { x: w.width * 0.5, y: w.height * 0.5, r: 16 };
      w.food = [];
      for (let i = 0; i < 3; i++) {
        const ang = w.rng() * Math.PI * 2;
        const rad = Math.min(w.width, w.height) * (0.3 + w.rng() * 0.14);
        w.food.push({ x: (w.nest.x + Math.cos(ang) * rad + w.width) % w.width,
                      y: (w.nest.y + Math.sin(ang) * rad + w.height) % w.height, r: 18 });
      }
      const A = [];
      for (let i = 0; i < n; i++)
        A.push({ x: w.nest.x + (w.rng() - 0.5) * 20, y: w.nest.y + (w.rng() - 0.5) * 20,
                 state: 'seek', mem: { h: w.rng() * Math.PI * 2 } });
      return A;
    },
    post(world, params) {
      world.pheromone.decay(Math.max(0, 1 - params.evap * world.dt));
      world.pheromone.blur();
    },
    drawUnder(ctx, world) {
      ctx.save();
      for (const f of world.food) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(90,143,60,0.85)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(43,43,41,0.9)'; ctx.stroke();
      }
      const nst = world.nest;
      ctx.beginPath(); ctx.arc(nst.x, nst.y, nst.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(43,43,41,0.9)'; ctx.fill();
      ctx.restore();
    },
    code: `// ANTS — channel 0 = HOME scent, channel 1 = FOOD scent.
// Seeking ants FOLLOW food scent and LAY home scent; returners do the opposite.
const F = world.pheromone, dt = world.dt;
const followCh = agent.state === 'seek' ? 1 : 0;
const layCh    = agent.state === 'seek' ? 0 : 1;

// smell three spots ahead: left / centre / right.
// turn only for a STRICTLY better smell — no scent means walk straight.
let best = 0.01, turn = 0;
for (const t of [-params.senseAngle, 0, params.senseAngle]) {
  const a = agent.mem.h + t;
  const v = F.sense(agent.x + Math.cos(a) * params.senseDist,
                    agent.y + Math.sin(a) * params.senseDist, followCh);
  if (v > best) { best = v; turn = t; }
}
agent.mem.h += turn * 0.4 + (world.rng() - 0.5) * params.jitter;

// reached a goal? flip role and turn around
if (agent.state === 'seek') {
  for (const f of world.food)
    if (helpers.dist(agent.x, agent.y, f.x, f.y) < f.r) {
      agent.state = 'return'; agent.mem.h += Math.PI; break;
    }
} else if (helpers.dist(agent.x, agent.y, world.nest.x, world.nest.y) < world.nest.r) {
  agent.state = 'seek'; agent.mem.h += Math.PI;
}

F.deposit(agent.x, agent.y, params.deposit * dt, layCh);

agent.species = agent.state === 'seek' ? 0 : 2;   // recolour by role
agent.vx = Math.cos(agent.mem.h) * 70;
agent.vy = Math.sin(agent.mem.h) * 70;`,
  },

  fireflies: {
    id: 'fireflies',
    name: 'FIREFLIES',
    desc: 'Each firefly blinks on its own clock, that clock is nudged forward whenever a neighbour flashes.',
    edgeMode: 'wrap',
    render: 'glow',
    fade: 0.14,
    counts: { def: 260, min: 40, max: 600 },
    radius: p => p.perception,
    schema: [
      { key: 'freq',       label: 'CLOCK SPEED', min: 0.2, max: 1.4, step: 0.05, def: 0.55 },
      { key: 'nudge',      label: 'COUPLING',    min: 0,   max: 0.3, step: 0.01, def: 0.09 },
      { key: 'flashDur',   label: 'FLASH TIME',  min: 0.1, max: 1,   step: 0.05, def: 0.35 },
      { key: 'perception', label: 'PERCEPTION',  min: 30,  max: 220, step: 5,    def: 80 },
    ],
    setup(w, p, n) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * w.width / Math.max(1, w.height))));
      const rows = Math.max(1, Math.ceil(n / cols));
      const A = [];
      for (let i = 0; i < n; i++) {
        const gx = i % cols, gy = (i / cols) | 0;
        A.push({
          x: ((gx + 0.5) / cols) * w.width  + (w.rng() - 0.5) * (w.width / cols) * 0.7,
          y: ((gy + 0.5) / rows) * w.height + (w.rng() - 0.5) * (w.height / rows) * 0.7,
          phase: w.rng(),
          mem: { f0: 0.85 + w.rng() * 0.3, t: 0 },   // everyone's clock runs a bit differently
        });
      }
      return A;
    },
    code: `// FIREFLIES — pulse-coupled oscillators (Mirollo–Strogatz).
// phase climbs 0 -> 1, then the firefly flashes and resets.
agent.phase += params.freq * agent.mem.f0 * world.dt;

// seeing a neighbour flash nudges my clock FORWARD, more so the closer
// I already am to flashing. That tiny rule is all the sync needs.
for (const b of neighbors) {
  if (b.justFlashed) agent.phase += params.nudge * agent.phase;
}

if (agent.phase >= 1) {
  agent.phase = 0;
  agent.justFlashed = true;
  agent.mem.t = params.flashDur;     // light stays on this long
} else {
  agent.justFlashed = false;
}

agent.mem.t = Math.max(0, agent.mem.t - world.dt);
agent.glow  = params.flashDur > 0 ? agent.mem.t / params.flashDur : 0;

agent.vx = 0; agent.vy = 0;          // fireflies sit still; try letting them drift!`,
  },

  plife: {
    id: 'plife',
    name: 'PARTICLE LIFE',
    desc: 'Coloured species attract or repel each other per the matrix, asymmetry means that A can love B while B flees A.',
    edgeMode: 'wrap',
    render: 'dot',
    fade: 0.35,
    extraUI: 'matrix',
    counts: { def: 600, min: 100, max: 1000 },
    radius: p => p.radius,
    schema: [
      { key: 'radius',   label: 'RADIUS',   min: 30,  max: 120, step: 1,   def: 70 },
      { key: 'force',    label: 'FORCE',    min: 100, max: 2500, step: 25, def: 900 },
      { key: 'friction', label: 'FRICTION', min: 0.5, max: 10,  step: 0.1, def: 5 },
      { key: 'species',  label: 'SPECIES',  min: 2,   max: 6,   step: 1,   def: 4, reset: true },
    ],
    setup(w, p, n) {
      const S = Math.round(p.species);
      const A = [];
      for (let i = 0; i < n; i++)
        A.push({ x: w.rng() * w.width, y: w.rng() * w.height,
                 vx: 0, vy: 0, species: i % S });
      return A;
    },
    makeMatrix(S, rng) {
      const m = [];
      for (let i = 0; i < S; i++) {
        m.push([]);
        for (let j = 0; j < S; j++) m[i].push(Math.round((rng() * 2 - 1) * 20) / 20);
      }
      return m;
    },
    code: `// PARTICLE LIFE — one force law, using a single matrix
const dt = world.dt, R = params.radius, CORE = 12;
let fx = 0, fy = 0;

for (const b of neighbors) {
  const dx = world.wrapDx(agent.x, b.x);
  const dy = world.wrapDy(agent.y, b.y);
  const d  = Math.hypot(dx, dy);
  if (d < 0.5 || d > R) continue;

  let f;
  if (d < CORE) {
    f = d / CORE - 1;                        // hard core: always repel
  } else {
    const k = params.matrix[agent.species][b.species];  // -1 .. +1
    const t = (d - CORE) / (R - CORE);
    f = k * (1 - Math.abs(2 * t - 1));       // strongest mid-band
  }
  fx += (dx / d) * f;
  fy += (dy / d) * f;
}

agent.vx = (agent.vx + fx * params.force * dt) * (1 - params.friction * dt);
agent.vy = (agent.vy + fy * params.force * dt) * (1 - params.friction * dt);`,
  },
};
