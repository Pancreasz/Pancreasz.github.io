/* Stylised front view of the fly brain (layout and colours after the FlyWire Neuropil Guide).
   FlyBrainViz.set({ smell, steerL, steerR, land, escape }) lights the neuropils + circuit wires.
   L / R are the left / right of the DRAWING (front view, so the drawing's left = the fly's right). */
window.FlyBrainViz = (function () {
  const svg = document.getElementById('fly-brain');
  const NS = 'http://www.w3.org/2000/svg';
  const MIRROR = 'translate(400 0) scale(-1 1)';   // brain midline is x = 200

  // Drawn back to front. Coordinates are for the drawing's left half; `mid` pieces sit on the midline.
  // e: [cx, cy, rx, ry, rotation] for ellipses, d: path, r: [x, y, w, h] for rects
  const NEUROPILS = [
    { id: 'LA',   name: 'Lamina (LA)',                       color: '#ef7fb9', e: [48, 128, 46, 86, -10] },
    { id: 'LOP',  name: 'Lobula plate (LOP)',                color: '#7b2fb0', e: [98, 166, 18, 32, -12] },
    { id: 'LO',   name: 'Lobula (LO)',                       color: '#a03fc4', e: [104, 136, 22, 46, -8] },
    { id: 'ME',   name: 'Medulla (ME)',                      color: '#d43d9c', e: [62, 128, 44, 78, -10] },
    { id: 'IP',   name: 'Inferior protocerebrum',            color: '#f5d27a', d: 'M200 34 C168 28 138 40 126 64 C114 88 116 116 120 136 C126 166 142 192 162 210 C176 222 188 230 200 232 Z' },
    { id: 'SP',   name: 'Superior protocerebrum (SMP/SIP)',  color: '#f6a531', d: 'M200 38 C176 30 150 38 138 56 C130 70 134 84 148 88 C168 92 186 90 200 88 Z' },
    { id: 'SLP',  name: 'Superior lateral protocerebrum',    color: '#f4877a', d: 'M138 56 C126 68 122 84 126 100 C134 104 144 98 148 88 C134 84 130 70 138 56 Z' },
    { id: 'LH',   name: 'Lateral horn (LH)',                 color: '#7a3fd8', e: [130, 100, 9, 8, 0] },
    { id: 'MB',   name: 'Mushroom body lobes',               color: '#2cc6a6', d: 'M170 64 C166 64 164 70 166 80 L170 104 C172 112 180 116 190 116 L200 116 L200 106 L190 106 C184 106 180 102 179 96 L176 70 C175 66 173 64 170 64 Z' },
    { id: 'CA',   name: 'Mushroom body calyx (MB_CA)',       color: '#17a58b', e: [154, 78, 11, 9, 0] },
    { id: 'AOTU', name: 'Anterior optic tubercle (AOTU)',    color: '#4f86ea', e: [132, 116, 9, 7, 0] },
    { id: 'PVLP', name: 'Posterior ventrolateral protocerebrum (PVLP)', color: '#3a62d8', d: 'M124 124 C120 142 126 160 138 172 C148 180 160 176 164 164 C166 150 158 134 146 124 C138 118 128 118 124 124 Z' },
    { id: 'AVLP', name: 'Anterior ventrolateral protocerebrum (AVLP)',  color: '#5b8ff0', e: [152, 186, 17, 11, 0] },
    { id: 'LAL',  name: 'Lateral accessory lobe (LAL)',      color: '#9a7cf0', e: [180, 136, 13, 10, 0] },
    { id: 'VMNP', name: 'Ventromedial neuropils',            color: '#27c0a0', e: [186, 156, 12, 9, 0] },
    { id: 'NECK', name: 'Neck connective (descending neurons)', color: '#4b2fb0', r: [190, 222, 20, 32], mid: true },
    { id: 'GNG',  name: 'Gnathal ganglia (GNG)',             color: '#6a3fd8', e: [200, 208, 32, 20, 0], mid: true },
    { id: 'AL',   name: 'Antennal lobe (AL)',                color: '#3fcaf2', e: [178, 176, 19, 17, 0] },
    { id: 'FB',   name: 'Fan-shaped body (FB)',              color: '#3ab5e6', e: [200, 98, 22, 10, 0], mid: true },
    { id: 'EB',   name: 'Ellipsoid body (EB)',               color: '#2a9bd0', e: [200, 118, 11, 8, 0], mid: true },
    { id: 'OCG',  name: 'Ocellar ganglion (OCG)',            color: '#c2186b', e: [200, 26, 6, 6, 0], mid: true },
  ];

  // Circuits from the project: which neuropils they pass through + a wire for the signal path.
  // Vision circuits include ME because the eye's input reaches LC10 / LPLC4 / looming detectors through the medulla.
  const CIRCUITS = {
    smell:  { color: '#ffb000', regions: ['AL', 'CA', 'LH'],
              wire: 'M178 168 C170 140 156 108 154 84 C148 92 140 98 131 100' },
    steer:  { color: '#1f8fff', regions: ['ME', 'LO', 'AOTU', 'LAL', 'GNG', 'NECK'],
              wire: 'M110 128 C118 118 124 114 132 114 C152 114 170 124 180 134 C190 156 195 196 198 250' },
    land:   { color: '#22a559', regions: ['ME', 'LOP', 'LO', 'PVLP', 'GNG', 'NECK'],
              wire: 'M98 166 C116 160 132 150 146 146 C168 158 186 196 197 250' },
    escape: { color: '#e5484d', regions: ['ME', 'LO', 'LOP', 'PVLP', 'GNG', 'NECK'],
              wire: 'M104 150 C122 152 140 158 152 164 C174 176 188 206 196 250' },
  };

  const make = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const mix = (hex, to, t) => {
    const a = parseInt(hex.slice(1), 16), b = to === 'white' ? 255 : 0;
    const ch = s => Math.round(((a >> s) & 255) * (1 - t) + b * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  };

  // ---------- Build ----------
  const defs = make('defs', {});
  svg.appendChild(defs);
  const regionEls = {};

  for (const np of NEUROPILS) {
    // soft 3D-ish shading like the rendered meshes
    const g = make('radialGradient', { id: 'np-' + np.id, cx: '38%', cy: '32%', r: '80%' });
    g.append(make('stop', { offset: '0', 'stop-color': mix(np.color, 'white', 0.45) }),
             make('stop', { offset: '0.55', 'stop-color': np.color }),
             make('stop', { offset: '1', 'stop-color': mix(np.color, 'black', 0.25) }));
    defs.appendChild(g);

    const sides = np.mid ? [''] : ['', MIRROR];
    regionEls[np.id] = sides.map(mirror => {
      let shape;
      if (np.d) shape = make('path', { d: np.d });
      else if (np.r) shape = make('rect', { x: np.r[0], y: np.r[1], width: np.r[2], height: np.r[3], rx: 6 });
      else {
        const [cx, cy, rx, ry, rot] = np.e;
        shape = make('ellipse', { cx, cy, rx, ry, transform: rot ? `rotate(${rot} ${cx} ${cy})` : '' });
      }
      if (mirror) shape.setAttribute('transform', `${mirror} ${shape.getAttribute('transform') || ''}`);
      shape.setAttribute('class', 'np');
      shape.setAttribute('fill', `url(#np-${np.id})`);
      shape.style.setProperty('--glow', np.color);
      const title = make('title', {});
      title.textContent = np.name;
      shape.appendChild(title);
      svg.appendChild(shape);
      return shape;
    });
  }

  const wireEls = {};
  for (const [key, c] of Object.entries(CIRCUITS)) {
    wireEls[key] = ['', MIRROR].map(mirror => {
      const w = make('path', { d: c.wire, class: 'wire', transform: mirror });
      w.style.setProperty('--glow', c.color);
      svg.appendChild(w);
      return w;
    });
  }

  // ---------- Update ----------
  const last = new Map();
  function apply(el, a, isWire) {
    const v = Math.round(a * 50) / 50;           // skip tiny changes (cheap DOM updates)
    if (last.get(el) === v) return;
    last.set(el, v);
    if (isWire) el.style.opacity = v;
    else {
      el.style.setProperty('--a', v);
      el.classList.toggle('lit', v > 0.5);
    }
  }

  function set(s) {
    const act = {
      smell: [s.smell, s.smell],
      steer: [s.steerL, s.steerR],
      land: [s.land, s.land],
      escape: [s.escape, s.escape],
    };
    for (const key in CIRCUITS) wireEls[key].forEach((w, side) => apply(w, act[key][side], true));

    for (const np of NEUROPILS) {
      const perSide = [0, 1].map(side =>
        Math.max(0, ...Object.keys(CIRCUITS)
          .filter(k => CIRCUITS[k].regions.includes(np.id))
          .map(k => act[k][side])));
      const els = regionEls[np.id];
      if (els.length === 1) apply(els[0], Math.max(...perSide));
      else els.forEach((el, side) => apply(el, perSide[side]));
    }
  }

  return { set };
})();
