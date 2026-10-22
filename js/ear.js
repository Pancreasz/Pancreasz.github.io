/* Ear Biometric: pick an ear -> RealSense camera -> YOLOv8 crop (V channel + CLAHE)
   -> HOG embedding vector -> vector DB -> identity. The 3D plot shows each ear's embedding
   (a 3D stand-in for the real high-dimensional HOG vector), slowly rotating. Results are MOCK. */
(function () {
  const section = document.getElementById('ear');

  // vec: the 3 numbers drawn in the plot; the bracket shows them plus "⋮" for the rest
  const EARS = [
    { id: 1, color: 'var(--purple)', hex: '#8a3ffc', name: 'John',  conf: 99.9, vec: [0.55, -0.75, 0.35], tf: '' },
    { id: 2, color: 'var(--red)',    hex: '#e5484d', name: 'Jane',  conf: 97.4, vec: [0.85, 0.35, -0.25], tf: 'rotate(-14 40 55) scale(.95 1.05)' },
    { id: 3, color: 'var(--green)',  hex: '#22a559', name: 'Alex',  conf: 95.1, vec: [0.7, 0.8, 0.15],    tf: 'translate(80 0) scale(-1 1)' },
  ];

  // Drawn ear, shown only if assets/earN.webp is missing
  const earSvg = tf => `<svg class="ear-svg" viewBox="0 0 80 110" aria-hidden="true"><g transform="${tf}">
    <path d="M52 8 C25 4 8 25 10 50 C12 70 20 80 26 92 C31 103 44 106 50 96 C55 88 52 80 58 72 C68 58 74 42 70 26 C67 15 61 9 52 8 Z"/>
    <path d="M50 22 C34 20 26 34 30 48 C33 58 42 60 44 70"/>
    <path d="M44 46 C38 46 36 54 40 60"/></g></svg>`;

  // ---------- Ear buttons ----------
  const earsEl = document.getElementById('ears');
  const buttons = EARS.map((ear, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ear-btn';
    b.style.setProperty('--c', ear.color);
    b.innerHTML = `<span class="ear-thumb">${earSvg(ear.tf)}<img src="assets/ear${ear.id}.webp" alt="Ear ${ear.id}" onerror="this.remove()"></span>` +
      `<span class="note">ear ${ear.id}</span>`;
    b.addEventListener('click', () => select(i));
    earsEl.appendChild(b);
    return b;
  });

  // ---------- Pipeline animation ----------
  const cam = document.getElementById('ear-cam');
  const crop = document.querySelector('#ear-crop .crop-slot');
  const rows = document.querySelector('#ear-vector .vec-rows');
  const db = document.getElementById('ear-db');
  const nameEl = document.getElementById('ear-name');
  const resName = document.getElementById('ear-res-name');
  const resConf = document.getElementById('ear-res-conf');
  let timers = [], selected = -1;

  const fmt = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
  function emptyVector() {
    rows.innerHTML = '<span>·</span><span>·</span><span>·</span><span>⋮</span>';
  }
  emptyVector();

  function select(i) {
    const ear = EARS[i];
    selected = i;
    timers.forEach(clearTimeout);
    buttons.forEach((b, j) => b.classList.toggle('active', j === i));

    [cam, db].forEach(el => el.classList.remove('flash', 'glow'));
    void cam.offsetWidth;                         // restart CSS animations
    crop.innerHTML = '';
    emptyVector();
    nameEl.textContent = '…';
    nameEl.classList.remove('found');
    resName.textContent = '…';
    resName.style.color = '';
    resConf.textContent = 'matching';

    cam.classList.add('flash');
    timers = [
      // the camera frame, cropped and turned to grey (V channel + CLAHE)
      setTimeout(() => { crop.innerHTML = buttons[i].querySelector('.ear-thumb').innerHTML; }, 350),
      // the HOG vector fills in, number by number
      ...ear.vec.map((v, k) => setTimeout(() => {
        rows.children[k].textContent = fmt(v);
        rows.children[k].style.color = ear.hex;
      }, 750 + k * 140)),
      setTimeout(() => db.classList.add('glow'), 1250),
      setTimeout(() => {
        nameEl.textContent = ear.name;
        nameEl.classList.add('found');
        resName.textContent = 'ear ' + ear.id;
        resName.style.color = ear.color;
        resConf.textContent = `conf ${ear.conf}%`;
      }, 1900),
    ];
  }

  // ---------- 3D embedding plot ----------
  const axesG = document.getElementById('ear-axes');
  const vecsG = document.getElementById('ear-vecs');
  const defs = document.getElementById('ear-markers');
  const O = { x: 120, y: 140 }, S = 95, PHI = 0.35;   // origin, scale, camera tilt
  let theta = -0.6, running = false;

  defs.innerHTML = EARS.map(e =>
    `<marker id="arrow-${e.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
       <path d="M0 0 L10 5 L0 10 Z" fill="${e.hex}"/></marker>`).join('');

  function project([x, y, z]) {
    const xr = x * Math.cos(theta) + z * Math.sin(theta);
    const zr = -x * Math.sin(theta) + z * Math.cos(theta);
    return { x: O.x + xr * S, y: O.y - (y * Math.cos(PHI) - zr * Math.sin(PHI)) * S };
  }
  const line = (a, b, attrs = '') => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${attrs}/>`;

  function render() {
    const o = project([0, 0, 0]);
    const axes = [[[1, 0, 0], 'x'], [[0, 1, 0], 'y'], [[0, 0, 1], 'z']];
    axesG.innerHTML = axes.map(([v, label]) => {
      const pos = project(v.map(c => c * 1.1));
      const neg = project(v.map(c => c * -0.6));
      const lp = project(v.map(c => c * 1.22));
      return line(neg, pos) + `<text x="${lp.x}" y="${lp.y}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    }).join('');
    vecsG.classList.toggle('has-active', selected >= 0);
    vecsG.innerHTML = EARS.map((e, i) =>
      line(o, project(e.vec), `stroke="${e.hex}" marker-end="url(#arrow-${e.id})" class="${i === selected ? 'active' : ''}"`)
    ).join('');
  }

  function frame() {
    if (!running) return;
    if (!Resu.reducedMotion) theta += 0.004;
    render();
    requestAnimationFrame(frame);
  }
  render();
  Resu.whenVisible(section, visible => {
    if (visible && !running) { running = true; requestAnimationFrame(frame); }
    else if (!visible) running = false;
  });
})();
