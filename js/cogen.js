/* Cogeneration monitoring: plant -> database -> live bar chart + efficiency gauge (MOCK data). */
(function () {
  const section = document.getElementById('cogen');
  const svg = document.getElementById('cogen-bars');
  const gFill = document.getElementById('g-fill');
  const gVal = document.getElementById('g-val');

  const BARS = 8, X0 = 16, BASE_Y = 118, MAX_H = 104, BW = 14, GAP = 5;
  let values = Array.from({ length: BARS }, () => 0.3 + Math.random() * 0.6);
  let eff = 78;

  svg.innerHTML = '<path class="axis" d="M10 6 L10 120 L166 120"/>' +
    values.map((_, i) => `<rect x="${X0 + i * (BW + GAP)}" width="${BW}" rx="2"/>`).join('');
  const rects = [...svg.querySelectorAll('rect')];

  function render() {
    rects.forEach((r, i) => {
      const h = values[i] * MAX_H;
      r.setAttribute('y', BASE_Y - h);
      r.setAttribute('height', h);
    });
    gFill.style.strokeDasharray = `${eff} 100`;
    gVal.textContent = Math.round(eff) + '%';
  }
  function update() {
    // shift left, push a new random-walk reading
    const last = values[values.length - 1];
    values = values.slice(1).concat(Math.max(0.15, Math.min(1, last + (Math.random() - 0.5) * 0.35)));
    eff = Math.max(60, Math.min(95, eff + (Math.random() - 0.5) * 6));
    render();
  }
  render();

  let timer = null;
  Resu.whenVisible(section, visible => {
    if (visible && !timer) timer = setInterval(update, 1400);
    else if (!visible) { clearInterval(timer); timer = null; }
  });
})();
