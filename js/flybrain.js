/* Fly Brain: you (the cursor) are the cheese.
   far away -> smell circuit, in view -> LC10 -> DNa02 steering, close -> LPLC4 -> DNp07 landing,
   swat (click near it / swoop at it) -> looming detectors -> giant fiber escape.
   On catch -> hearts + pheromone burst. Circuit activity is shown live on the brain. */
(function () {
  const section = document.getElementById('flybrain');
  const layer = section.querySelector('.fly-layer');
  const fly = document.getElementById('fly');
  const stateEl = document.getElementById('fly-state');
  const rows = Object.fromEntries([...document.querySelectorAll('#fly-circuits li')].map(li => [li.dataset.c, li]));

  const CATCH_RADIUS = 22;
  const SEE_RANGE = 320;        // px: closer than this the fly steers by vision, further it follows the smell
  const LAND_RANGE = 90;
  const SWAT_RADIUS = 100;      // click this close to the fly = swat
  const LOOM_SPEED = 22;        // px/frame the cursor must close in by to count as a looming threat
  const MAX_SPEED = 4, ESCAPE_SPEED = 13;   // px per frame
  const COOLDOWN_FRAMES = 120;  // after a catch / escape the fly wanders off for ~2 s

  let w = section.clientWidth, h = section.clientHeight;
  const pos = { x: w * 0.12, y: h * 0.85 };
  const vel = { x: 0, y: 0 };
  let mouse = null, prevDist = null, cooldown = 0, escaping = 0, t = 0, running = false;
  let landFlash = 0, escapeFlash = 0;
  const A = { smell: 0, steerL: 0, steerR: 0, land: 0, escape: 0 };   // smoothed circuit activity

  addEventListener('resize', () => { w = section.clientWidth; h = section.clientHeight; });

  section.addEventListener('pointermove', e => {
    const r = section.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  section.addEventListener('pointerleave', () => { mouse = null; prevDist = null; });
  section.addEventListener('pointerdown', e => {
    const r = section.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (Math.hypot(p.x - pos.x, p.y - pos.y) < SWAT_RADIUS) escape(p);
  });

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  function escape(from) {
    if (escaping > 0) return;
    const dx = pos.x - from.x, dy = pos.y - from.y, d = Math.hypot(dx, dy) || 1;
    vel.x = dx / d * ESCAPE_SPEED;
    vel.y = dy / d * ESCAPE_SPEED;
    escaping = 25;
    cooldown = COOLDOWN_FRAMES;
    escapeFlash = 1;
  }

  function step() {
    if (!running) return;
    t++;

    const dist = mouse ? Math.hypot(mouse.x - pos.x, mouse.y - pos.y) : Infinity;
    // Looming: the cursor rushing at the fly triggers the escape reflex
    if (mouse && prevDist !== null && dist < 160 && prevDist - dist > LOOM_SPEED) escape(mouse);
    prevDist = mouse ? dist : null;

    const chasing = mouse && cooldown <= 0;
    const goal = chasing
      ? mouse
      : { x: w * 0.12 + Math.sin(t / 90) * w * 0.08, y: h * 0.82 + Math.cos(t / 60) * h * 0.06 };

    if (escaping <= 0) {
      vel.x += (goal.x - pos.x) * 0.0018;
      vel.y += (goal.y - pos.y) * 0.0018;
      if (!Resu.reducedMotion) {          // jittery fly-like motion
        vel.x += (Math.random() - 0.5) * 0.5;
        vel.y += (Math.random() - 0.5) * 0.5;
      }
      vel.x *= 0.93;
      vel.y *= 0.93;
    }
    const max = escaping > 0 ? ESCAPE_SPEED : MAX_SPEED;
    const speed = Math.hypot(vel.x, vel.y);
    if (speed > max) { vel.x *= max / speed; vel.y *= max / speed; }

    pos.x = Math.max(0, Math.min(w, pos.x + vel.x));
    pos.y = Math.max(0, Math.min(h, pos.y + vel.y));
    const heading = Math.atan2(vel.y, vel.x);
    fly.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${heading}rad)`;

    if (chasing && dist < CATCH_RADIUS) {
      burst(mouse.x, mouse.y);
      cooldown = COOLDOWN_FRAMES;
      landFlash = 1;
      vel.x *= -0.8;
      vel.y *= -0.8;
    }
    cooldown--;
    escaping--;

    updateBrain(chasing, dist, wrap(Math.atan2(goal.y - pos.y, goal.x - pos.x) - heading));
    requestAnimationFrame(step);
  }

  // ---------- Which circuits are working right now ----------
  function updateBrain(chasing, dist, turn) {
    const busy = escapeFlash > 0.3;                       // the escape reflex overrides everything
    const sees = chasing && dist < SEE_RANGE;

    const target = {
      smell: busy ? 0.05 : !mouse ? 0.35 + 0.2 * Math.sin(t / 20) : (chasing && !sees ? 0.95 : 0.2),
      land: busy ? 0 : Math.max(landFlash, chasing && dist < LAND_RANGE ? 1 - dist / LAND_RANGE : 0),
      escape: escapeFlash,
    };
    // Steering is lateralised: turning right drives the fly's right LC10 -> DNa02 more.
    // Screen y points down, so a positive turn is clockwise = the fly turning right.
    // Front view: the fly's right is the drawing's LEFT.
    const base = busy ? 0 : sees ? 0.45 + 0.55 * (1 - dist / SEE_RANGE) : 0.08;
    const k = Math.max(-1, Math.min(1, turn / (Math.PI / 2)));
    target.steerL = clamp01(base * (0.6 + 0.8 * Math.max(0, k)));
    target.steerR = clamp01(base * (0.6 + 0.8 * Math.max(0, -k)));

    for (const key in A) A[key] += (target[key] - A[key]) * 0.2;
    landFlash *= 0.95;
    escapeFlash *= 0.985;                                 // ~1 s, long enough to see the jump

    FlyBrainViz.set(A);

    const steer = Math.max(A.steerL, A.steerR);
    const levels = { smell: A.smell, steer, land: A.land, escape: A.escape };
    for (const key in rows) {
      rows[key].style.setProperty('--a', levels[key].toFixed(2));
      rows[key].classList.toggle('on', levels[key] > 0.5);
    }
    stateEl.textContent =
      A.escape > 0.4 ? 'Escape! The giant fiber fired, so it jumps away' :
      A.land > 0.4   ? 'Landing on you' :
      steer > 0.4    ? 'It sees you and is steering toward you' :
      mouse          ? 'Smelling for the cheese (you)' :
                       'Wandering… move your mouse into this page';
  }

  function spawn(cls, x, y, delay, text) {
    const el = document.createElement(cls === 'heart' ? 'span' : 'div');
    el.className = cls;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.animationDelay = delay + 'ms';
    if (text) el.textContent = text;
    el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);
    return el;
  }

  function burst(x, y) {
    for (let i = 0; i < 6; i++) {
      spawn('heart', x, y, i * 50, '♥').style.setProperty('--dx', (Math.random() * 90 - 45) + 'px');
    }
    for (let i = 0; i < 3; i++) spawn('pheromone', x, y, i * 220);
  }

  Resu.whenVisible(section, visible => {
    if (visible && !running) { running = true; requestAnimationFrame(step); }
    else if (!visible) running = false;
  });
})();
