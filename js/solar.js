/* Solar forecasting: the cloud follows the mouse; panels under it get shaded and the
   readings / next-hour forecast react. All numbers are MOCK. */
(function () {
  const scene = document.getElementById('solar-scene');
  const cloud = document.getElementById('cloud');
  const panelsEl = document.getElementById('panels');
  const out = {
    sun: document.getElementById('r-sun'),
    temp: document.getElementById('r-temp'),
    now: document.getElementById('r-now'),
    next: document.getElementById('r-next'),
  };

  // Clear-sky baseline (matches the sketch: 2.3 sunlight, 30 °C, 30 kW now, 100 kW next hour)
  const BASE = { sun: 2.3, temp: 30, now: 30, next: 100 };

  // Panel drawing: tilted face with a cell grid on two legs
  function panelSvg() {
    const P = [[8, 34], [112, 10], [134, 40], [30, 66]];   // face corners (TL, TR, BR, BL)
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let grid = '';
    for (let i = 1; i < 4; i++) {
      const a = lerp(P[0], P[1], i / 4), b = lerp(P[3], P[2], i / 4);
      grid += `M${a} L${b} `;
    }
    const a = lerp(P[0], P[3], 0.5), b = lerp(P[1], P[2], 0.5);
    grid += `M${a} L${b}`;
    return `<svg viewBox="0 0 140 100" aria-hidden="true">
      <path class="leg" d="M40 62 L40 98 M110 40 L110 98 M30 98 L120 98"/>
      <polygon class="face" points="${P.join(' ')}"/>
      <path class="grid" d="${grid}"/></svg>`;
  }
  const panels = Array.from({ length: 4 }, () => {
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML = panelSvg();
    panelsEl.appendChild(p);
    return p;
  });

  let target = null, x = -200, shownShade = 0, running = false;

  scene.addEventListener('pointermove', e => { target = e.clientX - scene.getBoundingClientRect().left; });
  scene.addEventListener('pointerleave', () => { target = null; });

  function step() {
    if (!running) return;
    const goal = target ?? -120;                 // drift off-stage when the mouse leaves
    x += (goal - x) * 0.12;
    cloud.style.transform = `translateX(${x}px)`;

    // How much of each panel is under the cloud's rain (horizontal overlap)
    const half = cloud.offsetWidth * 0.4;
    const sceneLeft = scene.getBoundingClientRect().left;
    let shade = 0;
    for (const p of panels) {
      const r = p.getBoundingClientRect();
      const l = r.left - sceneLeft, rr = r.right - sceneLeft;
      const overlap = Math.max(0, Math.min(rr, x + half) - Math.max(l, x - half)) / (rr - l);
      p.classList.toggle('shaded', overlap > 0.35);
      shade += overlap / panels.length;
    }

    shownShade += (shade - shownShade) * 0.15;   // ease the readings
    const s = shownShade;
    out.sun.textContent = (BASE.sun * (1 - 0.65 * s)).toFixed(1);
    out.temp.textContent = (BASE.temp - 3 * s).toFixed(0) + '°C';
    out.now.textContent = (BASE.now * (1 - 0.75 * s)).toFixed(0);
    out.next.textContent = (BASE.next * (1 - 0.4 * s)).toFixed(0) + ' kW';

    requestAnimationFrame(step);
  }

  Resu.whenVisible(scene, visible => {
    if (visible && !running) { running = true; requestAnimationFrame(step); }
    else if (!visible) running = false;
  });
})();
