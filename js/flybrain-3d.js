/* 3D fly brain built from real neuropil meshes (assets/brain/neuropils.js) with three.js.
   Loaded lazily when the Fly Brain page gets close. If WebGL or the files are unavailable,
   the 2D drawing (flybrain-viz.js) keeps working. */
(function () {
  const section = document.getElementById('flybrain');
  const fig = section.querySelector('.brain-fig');
  const svg = document.getElementById('fly-brain');

  // Route FlyBrainViz.set() to the 3D brain once it is ready
  const set2d = FlyBrainViz.set;
  let brain3d = null;
  FlyBrainViz.set = s => (brain3d ? brain3d.set(s) : set2d(s));

  const load = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });

  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    (async () => {
      try {
        if (!window.THREE) await load('js/vendor/three.min.js');
        if (!window.FLY_NEUROPILS) await load('assets/brain/neuropils.js');
        brain3d = build();
      } catch (err) {
        console.warn('3D fly brain unavailable, keeping the 2D drawing:', err);
      }
    })();
  }, { rootMargin: '100% 0px' });   // start loading one screen before the page is reached
  io.observe(section);

  // ---------- Colours (after the FlyWire Neuropil Guide) ----------
  const COLOR = {
    ME: '#d43d9c', AME: '#e05aae', LA: '#ef7fb9', LO: '#a03fc4', LOP: '#7b2fb0', OCG: '#c2186b',
    LAL: '#9a7cf0', BU: '#8a6cf0', GA: '#7d5ff0',
    SMP: '#f6a531', SIP: '#f8b04a', SLP: '#f4877a',
    ATL: '#f7d26a', CRE: '#f5c95a', SCL: '#f8d77c', ICL: '#f3c04f', IB: '#f6cc66',
    VES: '#2fc0a0', SPS: '#1fa98f', IPS: '#3fcfae', EPA: '#25b496', GOR: '#2aa7a0',
    AOTU: '#4f86ea', AVLP: '#5b8ff0', PVLP: '#3a62d8', PLP: '#6aa0f2', WED: '#4a78e0',
    EB: '#2a9bd0', FB: '#3ab5e6', PB: '#45c4ee', NO: '#2e8fc8',
    MB_VL: '#2cc6a6', MB_ML: '#33d1b0', MB_PED: '#24b597', MB_CA: '#17a58b',
    AL: '#3fcaf2', LH: '#7a3fd8',
    FLA: '#3d4fe0', CAN: '#4a63e8', PRW: '#5a4ee0', SAD: '#4b3fd0', AMMC: '#3456d8',
    GNG: '#6a3fd8',
  };
  const REST_GREY = '#c9ccd6';

  // Circuits: neuropils they light + the route the signal travels (NECK = below the GNG)
  const CIRCUITS = {
    smell:  { color: '#ffb000', regions: ['AL', 'MB_CA', 'LH'],                path: ['AL', 'MB_CA', 'LH'] },
    steer:  { color: '#1f8fff', regions: ['ME', 'LO', 'AOTU', 'LAL', 'GNG'],   path: ['LO', 'AOTU', 'LAL', 'GNG', 'NECK'] },
    land:   { color: '#22a559', regions: ['ME', 'LOP', 'LO', 'PVLP', 'GNG'],   path: ['LOP', 'PVLP', 'GNG', 'NECK'] },
    escape: { color: '#e5484d', regions: ['ME', 'LO', 'LOP', 'PVLP', 'GNG'],   path: ['LO', 'PVLP', 'GNG', 'NECK'] },
  };

  function build() {
    const T = THREE;
    const data = window.FLY_NEUROPILS;

    // ---------- Renderer ----------
    const canvas = document.createElement('canvas');
    canvas.className = 'brain-canvas';
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (err) {
      throw new Error('WebGL not available');
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    svg.style.display = 'none';   // the `hidden` attribute doesn't hide an <svg> in Chrome
    svg.after(canvas);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1.6, 0.1, 50);
    camera.position.set(0, 0, 4.2);
    scene.add(new T.HemisphereLight(0xffffff, 0x7c8296, 0.75));
    const key = new T.DirectionalLight(0xffffff, 0.75);
    key.position.set(-1.5, 2, 3);
    scene.add(key);
    const fill = new T.DirectionalLight(0xffffff, 0.3);
    fill.position.set(2, -1, 2);
    scene.add(fill);

    const brain = new T.Group();
    scene.add(brain);

    // ---------- Meshes ----------
    // FlyWire space: x -> fly's left, y -> down, z -> posterior.
    // Front view: fly's right on the viewer's left, up = up, anterior toward the camera.
    const S = 2 / Math.max(...data.span);
    const C = data.min.map((m, i) => m + data.span[i] / 2);
    const decode = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

    const regions = [];   // { name, base, side, mesh, color, a }
    for (const [name, m] of Object.entries(data.meshes)) {
      const q = new Int16Array(decode(m.v));
      const pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) {
        const k = i % 3;
        const nm = (q[i] + 32768) / 65535 * data.span[k] + data.min[k];
        pos[i] = -(nm - C[k]) * S;   // flip all three axes (see above)
      }
      let idx = m.i32 ? new Uint32Array(decode(m.f)) : new Uint16Array(decode(m.f));
      // Mirroring three axes flips the winding: swap two corners so normals point outward
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }

      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setIndex(new T.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();

      const side = /_L$/.test(name) ? 'L' : /_R$/.test(name) ? 'R' : 'mid';
      const base = name.replace(/_[LR]$/, '');
      const color = new T.Color(COLOR[base] || '#b8bcc8');
      const mat = new T.MeshStandardMaterial({
        color: color.clone(), roughness: 0.6, metalness: 0, transparent: true,
        opacity: 1, emissive: new T.Color(0), side: T.DoubleSide,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.userData.name = name;
      brain.add(mesh);
      regions.push({ name, base, side, mesh, color, a: -1 });
    }

    const centroid = name => {
      const r = regions.find(r => r.name === name);
      return r ? r.mesh.geometry.boundingSphere.center.clone() : null;
    };

    // ---------- Signal routes: a glowing tube + travelling spikes per circuit per side ----------
    const routes = [];
    for (const [key, c] of Object.entries(CIRCUITS)) {
      for (const side of ['L', 'R']) {
        const pts = c.path.map(n => {
          if (n === 'NECK') return centroid('GNG').add(new T.Vector3(0, -0.28, 0));
          return centroid(`${n}_${side}`) || centroid(n);
        });
        const curve = new T.CatmullRomCurve3(pts);
        const tubeMat = new T.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0, depthTest: false });
        const tube = new T.Mesh(new T.TubeGeometry(curve, 64, 0.007, 6), tubeMat);
        tube.renderOrder = 10;
        brain.add(tube);
        const spikes = [0, 1, 2].map(() => {
          const s = new T.Mesh(new T.SphereGeometry(0.022, 12, 12),
            new T.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0, depthTest: false }));
          s.renderOrder = 11;
          brain.add(s);
          return s;
        });
        routes.push({ key, side, curve, tube, spikes });
      }
    }

    // ---------- Modes: "activity" (grey brain, working parts light up) / "anatomy" (all coloured) ----------
    let mode = 'activity';
    const modes = document.createElement('div');
    modes.className = 'brain-modes';
    modes.innerHTML = '<button type="button" data-mode="activity" class="on">Activity</button>' +
                      '<button type="button" data-mode="anatomy">Anatomy</button>';
    canvas.after(modes);
    modes.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      mode = b.dataset.mode;
      modes.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      regions.forEach(r => { r.a = -1; });   // force a material refresh
      applyRegions();
    });

    // ---------- Hover label ----------
    const label = document.createElement('div');
    label.className = 'brain-label';
    canvas.after(label);
    const ray = new T.Raycaster();
    const ndc = new T.Vector2();

    // ---------- Drag to rotate (plus a gentle idle sway) ----------
    let rotY = 0, rotX = 0, drag = null, lastDrag = -1e9;
    canvas.addEventListener('pointerdown', e => {
      e.stopPropagation();                   // don't count as swatting the fly
      drag = { x: e.clientX, y: e.clientY, rotY, rotX };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (drag) {
        rotY = drag.rotY + (e.clientX - drag.x) * 0.01;
        rotX = Math.max(-1.2, Math.min(1.2, drag.rotX + (e.clientY - drag.y) * 0.01));
        lastDrag = performance.now();
        return;
      }
      const r = canvas.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(regions.map(r => r.mesh), false)[0];
      label.textContent = hit ? prettyName(hit.object.userData.name) : '';
    });
    canvas.addEventListener('pointerleave', () => { label.textContent = ''; });
    ['pointerup', 'pointercancel'].forEach(t => canvas.addEventListener(t, () => { drag = null; }));

    // ---------- Activity -> materials ----------
    let act = { smell: [0, 0], steer: [0, 0], land: [0, 0], escape: [0, 0] };   // [fly L, fly R]
    const grey = new T.Color(REST_GREY);
    const tmp = new T.Color();

    function regionActivity(r) {
      let a = 0;
      for (const [key, c] of Object.entries(CIRCUITS)) {
        if (!c.regions.includes(r.base)) continue;
        a = Math.max(a, r.side === 'L' ? act[key][0] : r.side === 'R' ? act[key][1] : Math.max(...act[key]));
      }
      return a;
    }

    function applyRegions() {
      for (const r of regions) {
        const a = Math.round(regionActivity(r) * 50) / 50;
        if (a === r.a) continue;
        r.a = a;
        const m = r.mesh.material;
        if (mode === 'activity') {
          m.color.copy(tmp.copy(grey).lerp(r.color, a));
          m.opacity = 0.16 + 0.84 * a;
          m.depthWrite = a > 0.5;
          r.mesh.renderOrder = a > 0.3 ? 0 : 1;   // lit parts drawn first, grey shell blended over
          m.emissive.copy(r.color).multiplyScalar(0.45 * a);
        } else {
          m.color.copy(r.color);
          m.opacity = 1;
          m.depthWrite = true;
          r.mesh.renderOrder = 0;
          m.emissive.copy(r.color).multiplyScalar(0.5 * a);
        }
      }
    }

    // ---------- Render loop ----------
    let running = false;
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the whole brain (2 units wide) in frame at any aspect ratio
      const halfW = 1.05, halfH = 0.6;
      const t = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      camera.position.z = Math.max(halfH / t, halfW / (t * camera.aspect)) + 0.25;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    function frame(now) {
      if (!running) return;
      const idle = now - lastDrag > 2500 && !drag;
      if (idle && !Resu.reducedMotion) rotY += (Math.sin(now / 2600) * 0.45 - rotY) * 0.01;
      brain.rotation.set(rotX, rotY, 0);

      for (const r of routes) {
        const a = r.side === 'L' ? act[r.key][0] : act[r.key][1];
        r.tube.material.opacity = a * 0.55;
        r.spikes.forEach((s, i) => {
          const u = ((now / 900) + i / 3) % 1;
          s.position.copy(r.curve.getPoint(u));
          s.material.opacity = a > 0.05 ? a : 0;
          s.scale.setScalar(0.6 + 0.6 * a);
        });
      }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    Resu.whenVisible(section, v => {
      if (v && !running) { running = true; requestAnimationFrame(frame); }
      else if (!v) running = false;
    });

    applyRegions();

    return {
      // s comes from flybrain.js, where steerL / steerR are the DRAWING's left / right in a
      // front view, i.e. steerL = the fly's RIGHT side and steerR = the fly's LEFT side.
      set(s) {
        act = {
          smell: [s.smell, s.smell],
          steer: [s.steerR, s.steerL],      // -> [fly L, fly R]
          land: [s.land, s.land],
          escape: [s.escape, s.escape],
        };
        applyRegions();
      },
    };
  }

  const FULL = {
    ME: 'Medulla', AME: 'Accessory medulla', LA: 'Lamina', LO: 'Lobula', LOP: 'Lobula plate', OCG: 'Ocellar ganglion',
    LAL: 'Lateral accessory lobe', BU: 'Bulb', GA: 'Gall', SMP: 'Superior medial protocerebrum',
    SIP: 'Superior intermediate protocerebrum', SLP: 'Superior lateral protocerebrum', ATL: 'Antler', CRE: 'Crepine',
    SCL: 'Superior clamp', ICL: 'Inferior clamp', IB: 'Inferior bridge', VES: 'Vest', SPS: 'Superior posterior slope',
    IPS: 'Inferior posterior slope', EPA: 'Epaulette', GOR: 'Gorget', AOTU: 'Anterior optic tubercle',
    AVLP: 'Anterior ventrolateral protocerebrum', PVLP: 'Posterior ventrolateral protocerebrum',
    PLP: 'Posterolateral protocerebrum', WED: 'Wedge', EB: 'Ellipsoid body', FB: 'Fan-shaped body',
    PB: 'Protocerebral bridge', NO: 'Noduli', MB_VL: 'Mushroom body vertical lobe', MB_ML: 'Mushroom body medial lobe',
    MB_PED: 'Mushroom body peduncle', MB_CA: 'Mushroom body calyx', AL: 'Antennal lobe', LH: 'Lateral horn',
    FLA: 'Flange', CAN: 'Cantle', PRW: 'Prow', SAD: 'Saddle', AMMC: 'Antennal mechanosensory & motor center',
    GNG: 'Gnathal ganglia',
  };
  function prettyName(name) {
    const base = name.replace(/_[LR]$/, '');
    const side = /_L$/.test(name) ? ' (left)' : /_R$/.test(name) ? ' (right)' : '';
    return `${base} · ${FULL[base] || base}${side}`;
  }
})();
