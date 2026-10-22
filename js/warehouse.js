/* Warehouse safety: hover/focus/tap a forklift -> its policy shows in the text box. */
(function () {
  const grid = document.getElementById('wh-grid');
  const box = document.getElementById('wh-box');
  const cone = grid.querySelector('.cone');
  const lifts = [...grid.querySelectorAll('.forklift')];

  // ---------- Isometric forklift ----------
  // World units: x = forward (towards the forks), y = towards the viewer's left, z = up.
  // We look from (+x, +y, +z), so each box shows its top, its +y side and its +x front.
  const ISO_C = Math.cos(Math.PI / 6), ISO_S = 0.5;
  const P = (x, y, z) => [(x - y) * ISO_C, (x + y) * ISO_S - z];
  const pts = list => list.map(p => P(...p).map(v => v.toFixed(1)).join(',')).join(' ');
  let bounds;
  const grow = list => list.forEach(p => {
    const [sx, sy] = P(...p);
    bounds = [Math.min(bounds[0], sx), Math.min(bounds[1], sy), Math.max(bounds[2], sx), Math.max(bounds[3], sy)];
  });

  function isoBox(cls, x0, x1, y0, y1, z0, z1) {
    const top = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const side = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    const front = [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]];
    grow([...top, ...side, ...front]);
    return `<g class="${cls}"><polygon class="s" points="${pts(side)}"/><polygon class="f" points="${pts(front)}"/>` +
           `<polygon class="t" points="${pts(top)}"/></g>`;
  }
  // a wheel standing in the x-z plane at side y
  function wheel(x, y, z, r) {
    const ring = k => Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return [x + Math.cos(a) * r * k, y, z + Math.sin(a) * r * k];
    });
    grow(ring(1));
    return `<polygon class="tyre" points="${pts(ring(1))}"/><polygon class="hub" points="${pts(ring(0.42))}"/>`;
  }
  const line = (cls, a, b) => { grow([a, b]); return `<path class="${cls}" d="M${pts([a])} L${pts([b])}"/>`; };

  // variant: 'lift' (forks up while driving) | 'over' (stack too tall) | 'push' (carried crate shoves one on the floor)
  function forklift(variant) {
    bounds = [Infinity, Infinity, -Infinity, -Infinity];
    const fz = { lift: 64, push: 8 }[variant] ?? 2;          // fork height
    let s = `<polygon class="shadow" points="${pts([[-6, -24, 0], [108, -24, 0], [108, 24, 0], [-6, 24, 0]])}"/>`;
    // far side: wheels and guard posts (mostly hidden behind the body)
    s += wheel(12, -19, 10, 10) + wheel(50, -19, 10, 10);
    s += isoBox('frame', 16, 19, -17, -14, 30, 80) + isoBox('frame', 48, 51, -17, -14, 30, 80);
    // body: chassis, counterweight, seat, steering
    s += isoBox('body', 4, 60, -18, 18, 8, 30);
    s += isoBox('body', -4, 12, -18, 18, 8, 40);
    s += isoBox('seat', 22, 34, -10, 10, 30, 36) + isoBox('seat', 20, 24, -10, 10, 36, 50);
    s += line('column', [46, 0, 30], [40, 0, 50]) + line('column', [36, 5, 52], [44, -5, 48]);
    // near guard posts and roof
    s += isoBox('frame', 16, 19, 14, 17, 30, 80) + isoBox('frame', 48, 51, 14, 17, 30, 80);
    s += isoBox('frame', 14, 53, -18, 18, 80, 83);
    // near wheels
    s += wheel(12, 19, 10, 10) + wheel(50, 19, 10, 10);
    // mast, carriage, forks
    s += isoBox('frame', 61, 65, -14, -10, 2, 104) + isoBox('frame', 61, 65, 10, 14, 2, 104);
    s += isoBox('frame', 61, 65, -14, 14, 100, 104);
    s += isoBox('carriage', 65, 68, -14, 14, fz, fz + 24);
    s += isoBox('fork', 68, 104, -11, -7, fz, fz + 2.5) + isoBox('fork', 68, 104, 7, 11, fz, fz + 2.5);

    const crate = (x0, z0, w, h, dy = 0) => isoBox('cargo', x0, x0 + w, -13 + dy, 13 + dy, z0, z0 + h);
    let warnAt;
    if (variant === 'lift') {
      s += crate(72, fz + 2.5, 28, 22);
      s += line('motion', [-12, 0, 22], [-46, 0, 22]) + line('motion', [-14, 8, 36], [-40, 8, 36]) +
           line('motion', [-12, -8, 8], [-42, -8, 8]);
      warnAt = [96, 0, 112];
    } else if (variant === 'over') {
      // four crates, each a little off, piled past the top of the mast
      s += crate(72, 4.5, 28, 26) + crate(70, 30.5, 30, 26, 2) + crate(74, 56.5, 26, 26, -3) + crate(71, 82.5, 28, 26, 3);
      warnAt = [100, 0, 128];
    } else if (variant === 'push') {
      // the crate on the forks runs into a crate on the floor and shoves it along
      s += crate(74, fz + 2.5, 30, 24);
      s += crate(104, 0, 28, 28);
      s += line('motion', [138, 0, 14], [160, 0, 14]) + line('motion', [152, -5, 14], [160, 0, 14]) +
           line('motion', [152, 5, 14], [160, 0, 14]);
      warnAt = [118, 0, 60];
    }
    if (warnAt) {
      const [wx, wy] = P(...warnAt);
      grow([warnAt]);
      s += `<path class="warn" d="M${wx.toFixed(1)} ${(wy - 16).toFixed(1)} v14 M${wx.toFixed(1)} ${(wy + 4).toFixed(1)} v1"/>`;
      bounds[1] = Math.min(bounds[1], wy - 18);
    }
    // the same horizontal extent for every variant keeps them drawn at the same scale
    const X0 = -52, X1 = 160, pad = 6;
    const vb = [X0, bounds[1] - pad, X1 - X0, bounds[3] - bounds[1] + pad * 2].map(v => v.toFixed(1)).join(' ');
    return `<svg class="fk" viewBox="${vb}" aria-hidden="true">${s}</svg>`;
  }

  const TRUCK = `<svg class="truck" viewBox="0 0 260 120" aria-hidden="true">
    <rect class="fill" x="92" y="12" width="160" height="78" rx="3"/>
    <path d="M18 90 L18 50 C18 34 28 24 44 24 L88 24 L88 90 Z"/>
    <path d="M30 52 C32 40 38 34 48 34 L78 34 L78 52 Z"/>
    <path d="M10 90 L252 90"/>
    <circle class="wheel" cx="50" cy="94" r="14"/><circle cx="50" cy="94" r="5"/>
    <circle class="wheel" cx="214" cy="94" r="14"/><circle cx="214" cy="94" r="5"/>
  </svg>`;

  const POLICIES = {
    lift: { title: 'Do not lift the forks while moving', text: "The hardest one. The footage comes from the warehouse CCTV and the quality is pretty bad, so you can't just detect the forks and check whether they're raised. So I built a pose model for forklifts, like MediaPipe but for a forklift instead of a person, to follow where the forks are. Then ByteTrack follows each forklift across frames to tell whether it's moving faster than the limit while the forks go up." },
    over: { title: 'Do not overload cargo', text: "The rule that gets broken the most. You can only carry one load at a time, but drivers don't seem to listen, and it's really dangerous: I've seen forklifts hit people and drive into cargo. For this one I trained a segmentation model that finds forklifts, cargo boxes and pallets, then wrote an algorithm that groups each forklift with what it's carrying and uses thresholds to decide whether it's overloaded." },
    push: { title: 'Do not push cargo', text: "Like overloading, just less dangerous, but it still breaks the policy: the driver uses the load on the forks to shove other cargo along the floor. I reused the same segmentation model and wrote a new algorithm on top of it that recognises when a forklift is pushing cargo instead of carrying it." },
  };

  lifts.forEach(b => b.insertAdjacentHTML('afterbegin', forklift(b.dataset.key)));

  function showDefault() {
    lifts.forEach(b => b.classList.remove('active'));
    Resu.clear(cone);
    box.innerHTML = `<div class="wh-art">${TRUCK}</div>
      <div><span class="rule info">Safety policy</span><h3>Three rules, three detectors</h3>
      <p>Hover or tap a forklift to see the rule and how I detect it.</p></div>`;
  }
  function show(key) {
    const p = POLICIES[key];
    lifts.forEach(b => b.classList.toggle('active', b.dataset.key === key));
    box.innerHTML = `<div class="wh-art">${forklift(key)}</div>
      <div><span class="rule no">Not allowed</span><h3>${p.title}</h3><p>${p.text}</p></div>`;
    const btn = lifts.find(b => b.dataset.key === key);
    if (innerWidth > 900) Resu.cone(cone, grid, btn, box); else Resu.clear(cone);
  }

  lifts.forEach(b => {
    b.addEventListener('mouseenter', () => show(b.dataset.key));
    b.addEventListener('focus', () => show(b.dataset.key));
    b.addEventListener('click', () => show(b.dataset.key));
    b.addEventListener('mouseleave', showDefault);
    b.addEventListener('blur', showDefault);
  });
  showDefault();
})();
