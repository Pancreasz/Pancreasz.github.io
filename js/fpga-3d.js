/* Noise Cancellation: a 3D model of the setup, built from boxes with three.js. A DE0-CV style
   Cyclone V board, the INMP441 I2S microphone wired into GPIO 0 and the CH343 USB-UART on GPIO 1.
   While a clip plays (event 'nc-audio' from noise.js) pulses run mic -> FPGA -> UART.
   Hover a part for its name, drag to rotate. Units are millimetres. */
(function () {
  const section = document.getElementById('noise');
  const fig = document.getElementById('nc-board');
  const canvas = document.getElementById('nc-canvas');
  const tip = document.getElementById('nc-tip');

  const load = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    (async () => {
      try {
        if (!window.THREE) await load('js/vendor/three.min.js');
        build();
        fig.classList.add('ready');
      } catch (err) {
        console.warn('3D FPGA model unavailable:', err);
      }
    })();
  }, { rootMargin: '100% 0px' }).observe(section);

  function build() {
    const T = THREE;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(28, 1.4, 1, 2000);
    scene.add(new T.HemisphereLight(0xffffff, 0x6d7385, 0.8));
    const key = new T.DirectionalLight(0xffffff, 0.75);
    key.position.set(-60, 160, 90);
    scene.add(key);
    const fill = new T.DirectionalLight(0xffffff, 0.25);
    fill.position.set(120, 60, -80);
    scene.add(fill);

    const rig = new T.Group();      // rotated by dragging
    scene.add(rig);
    const pickable = [];

    // ---------- helpers ----------
    const mat = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
    const METAL = mat(0xc7ccd6, { metalness: 0.7, roughness: 0.35 });
    const GOLD = mat(0xd9b04c, { metalness: 0.8, roughness: 0.3 });
    function texture(w, h, draw) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new T.CanvasTexture(c);
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    }
    // box sitting on y0, centred at (x, z); `top` is an optional material for the upper face
    function box(w, h, d, x, y0, z, material, top) {
      const mats = top ? [material, material, top, material, material, material] : material;
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), mats);
      m.position.set(x, y0 + h / 2, z);
      return m;
    }
    function part(label, ...meshes) {
      const g = new T.Group();
      meshes.forEach(m => { m.userData.label = label; g.add(m); pickable.push(m); });
      rig.add(g);
      return g;
    }

    // ---------- PCB (100 x 80) with silkscreen ----------
    const PCB_T = 1.6;
    const silk = texture(1000, 800, (ctx, w, h) => {
      ctx.fillStyle = '#1d2c6e'; ctx.fillRect(0, 0, w, h);
      // faint traces
      ctx.strokeStyle = 'rgba(120, 150, 255, .18)'; ctx.lineWidth = 3;
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) {
        let x = rnd() * w, y = rnd() * h;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) { if (rnd() < 0.5) x += (rnd() - 0.5) * 300; else y += (rnd() - 0.5) * 300; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, .85)';
      ctx.font = 'bold 44px sans-serif'; ctx.fillText('DE0-CV', 60, 215);
      ctx.font = '24px sans-serif';
      ctx.fillText('HEX5   HEX4   HEX3   HEX2   HEX1   HEX0', 105, 535);
      ctx.fillText('LEDR9 ... LEDR0', 110, 655);
      ctx.fillText('SW9 ... SW0', 110, 790);
      ctx.fillText('KEY3  KEY2  KEY1  KEY0', 740, 790);
      ctx.save(); ctx.translate(855, 520); ctx.rotate(-Math.PI / 2); ctx.fillText('GPIO 0', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(985, 520); ctx.rotate(-Math.PI / 2); ctx.fillText('GPIO 1', 0, 0); ctx.restore();
    });
    const pcbSide = mat(0x16224f);
    part('DE0-CV board (Cyclone V FPGA)', box(100, PCB_T, 80, 0, 0, 0, pcbSide, mat(0xffffff, { map: silk, roughness: 0.7 })));
    const Y = PCB_T;   // top of the board

    // mounting holes
    for (const [x, z] of [[-46, -36], [46, -36], [-46, 36], [46, 36]]) {
      const ring = new T.Mesh(new T.TorusGeometry(1.8, 0.5, 8, 20), GOLD);
      ring.rotation.x = Math.PI / 2; ring.position.set(x, Y + 0.1, z);
      rig.add(ring);
    }

    // ---------- Cyclone V ----------
    const chipTop = texture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#202125'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c9ccd4'; ctx.textAlign = 'center';
      ctx.font = 'bold 64px sans-serif'; ctx.fillText('CYCLONE V', w / 2, 210);
      ctx.font = '40px sans-serif'; ctx.fillText('5CEBA4F23C7N', w / 2, 290);
      ctx.beginPath(); ctx.arc(60, 450, 18, 0, 7); ctx.fill();
    });
    const chipMat = mat(0x202125, { emissive: new T.Color(0x4361ee), emissiveIntensity: 0 });
    const chipTopMat = mat(0xffffff, { map: chipTop, emissive: new T.Color(0x4361ee), emissiveIntensity: 0 });
    part('Cyclone V FPGA (5CEBA4F23C7N)', box(23, 2.4, 23, 4, Y, -6, chipMat, chipTopMat));

    const ramTop = texture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#202125'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b9bcc4'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SDRAM', w / 2, 76);
    });
    part('64 MB SDRAM', box(22, 1.2, 10, -26, Y, -10, mat(0x202125), mat(0xffffff, { map: ramTop })));

    // ---------- 7-segment displays, LEDs, switches, buttons ----------
    const segTop = texture(128, 192, (ctx, w, h) => {
      ctx.fillStyle = '#26272c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff3b30'; ctx.font = 'bold 150px monospace'; ctx.textAlign = 'center'; ctx.fillText('8', w / 2 - 6, 150);
      ctx.beginPath(); ctx.arc(108, 160, 9, 0, 7); ctx.fill();
    });
    const segs = [];
    for (let i = 0; i < 6; i++) segs.push(box(8, 5, 12, -38 + i * 9.5, Y, 14, mat(0x26272c), mat(0xffffff, { map: segTop })));
    part('Six 7-segment displays (HEX5 to HEX0)', ...segs);

    const leds = [];
    for (let i = 0; i < 10; i++) leds.push(box(1.8, 0.8, 1, -40 + i * 4.2, Y, 26, mat(0xff4d4d, { emissive: new T.Color(0xff2020), emissiveIntensity: 0.4 })));
    part('10 red LEDs', ...leds);

    const sws = [];
    for (let i = 0; i < 10; i++) {
      sws.push(box(3.2, 3.2, 6.5, -40 + i * 4.2, Y, 33, mat(0x2b2f3a)));
      sws.push(box(1.8, 1.4, 2.2, -40 + i * 4.2, Y + 3.2, 33 + (i % 3 === 0 ? -1.2 : 1.2), mat(0xf2f2f2)));
    }
    part('10 slide switches', ...sws);

    const keys = [];
    for (let i = 0; i < 4; i++) {
      keys.push(box(6, 3, 6, 18 + i * 7.5, Y, 33, mat(0xb9bdc7, { metalness: 0.4 })));
      const cap = new T.Mesh(new T.CylinderGeometry(1.8, 1.8, 1.4, 20), mat(0x1c1d22));
      cap.position.set(18 + i * 7.5, Y + 3.7, 33);
      keys.push(cap);
    }
    part('4 push buttons', ...keys);

    // ---------- connectors on the back edge ----------
    part('VGA output', box(31, 12, 9, -6, Y, -36, mat(0x3557c9, { metalness: 0.2 })),
      box(17, 6, 2, -6, Y + 3, -41, METAL));
    const ps2 = new T.Mesh(new T.CylinderGeometry(6.5, 6.5, 12, 24), mat(0x7a3fb0));
    ps2.rotation.x = Math.PI / 2; ps2.position.set(20, Y + 6.5, -35);
    part('PS/2 port', ps2);
    part('Power jack', box(9, 11, 14, -44, Y, -33, mat(0x1c1d22)));
    part('USB-Blaster port (programming)', box(8, 4, 9, -31, Y, -37, METAL));
    part('microSD card slot', box(14, 1.8, 15, 33, Y, -30, METAL));

    // ---------- GPIO headers: 2 x 20 pins each ----------
    const PITCH = 2.54, HDR_H = 8.5;
    const pinGeo = new T.BoxGeometry(0.64, 3, 0.64);
    const headerPins = [];   // [header][row][col] -> world-ish pin tip (in rig space)
    [38, 45.5].forEach((hx, hi) => {
      const pins = new T.InstancedMesh(pinGeo, GOLD, 40);
      const m4 = new T.Matrix4();
      const tips = [];
      for (let r = 0; r < 20; r++) for (let c = 0; c < 2; c++) {
        const x = hx + (c - 0.5) * PITCH, z = -24 + r * PITCH;
        m4.makeTranslation(x, Y + HDR_H + 1.5, z);
        pins.setMatrixAt(r * 2 + c, m4);
        tips.push(new T.Vector3(x, Y + HDR_H + 3, z));
      }
      headerPins.push(tips);
      part(hi ? 'GPIO 1 header (to the CH343)' : 'GPIO 0 header (to the INMP441)',
        box(5.1, HDR_H, 51, hx, Y, -24 + 9.5 * PITCH, mat(0x1c1d22)), pins);
    });

    // ---------- INMP441 microphone (round breakout), behind the GPIO headers ----------
    const MIC = new T.Vector3(66, 8, -34);
    const micBoard = new T.Mesh(new T.CylinderGeometry(7.5, 7.5, 1.2, 40), mat(0x1c1d22));
    micBoard.position.set(MIC.x, MIC.y, MIC.z);
    const micCan = box(4.5, 1.2, 3.5, MIC.x - 1, MIC.y + 0.6, MIC.z, METAL);
    const micPins = [], micTips = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42;
      const p = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 3, 8), GOLD);
      const x = MIC.x + Math.cos(a) * 5.6 + 1, z = MIC.z + Math.sin(a) * 5.6 + 9;
      p.position.set(x, MIC.y + 1.5, z);
      micPins.push(p);
      micTips.push(new T.Vector3(x, MIC.y + 3, z));
    }
    part('INMP441 I2S microphone', micBoard, micCan, ...micPins);

    // ---------- CH343 USB-UART (purple), to the right of GPIO 1 ----------
    const UART = new T.Vector3(80, 6, 22);
    const uTop = texture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#7a2fa0'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255, 255, 255, .85)'; ctx.font = 'bold 40px sans-serif'; ctx.fillText('CH343', 150, 110);
      ctx.font = '26px sans-serif'; ctx.fillText('USB2UART', 150, 160);
    });
    const uartTips = [];
    const uartPins = [];
    for (let i = 0; i < 6; i++) {
      const z = UART.z - 6.3 + i * PITCH;
      const p = box(0.64, 3, 0.64, UART.x - 11, UART.y + 1.2, z, GOLD);
      uartPins.push(p);
      uartTips.push(new T.Vector3(UART.x - 11, UART.y + 4.2, z));
    }
    part('CH343 USB-UART (to the laptop)',
      box(26, 1.2, 15, UART.x, UART.y, UART.z, mat(0x7a2fa0), mat(0xffffff, { map: uTop })),
      box(4, 0.8, 4, UART.x + 2, UART.y + 1.2, UART.z, mat(0x1c1d22)),
      box(7.5, 3.2, 9, UART.x + 12, UART.y + 1.2, UART.z, METAL),
      ...uartPins);

    // ---------- Jumper wires ----------
    function wire(a, b, color, lift = 22) {
      const mid = a.clone().lerp(b, 0.5);
      mid.y = Math.max(a.y, b.y) + lift;
      const curve = new T.CatmullRomCurve3([a, a.clone().setY(a.y + 6), mid, b.clone().setY(b.y + 6), b]);
      const tube = new T.Mesh(new T.TubeGeometry(curve, 48, 0.55, 8, false), mat(color, { roughness: 0.45 }));
      tube.userData.label = 'Jumper wire';
      rig.add(tube);
      return curve;
    }
    const g0 = headerPins[0], g1 = headerPins[1];
    // INMP441 pins -> GPIO 0: VDD, GND, SCK, WS, SD (L/R tied to GND on the mic)
    wire(micTips[0], g0[0], 0xe5484d, 14);       // VDD
    wire(micTips[1], g0[2], 0x2a2b30, 13);       // GND
    wire(micTips[2], g0[5], 0xf5c518, 12);       // SCK
    wire(micTips[3], g0[7], 0x22a559, 11);       // WS
    const sdCurve = wire(micTips[4], g0[9], 0x1f8fff, 10);   // SD: the audio coming in
    // GPIO 1 -> CH343: TX and GND
    const txCurve = wire(g1[30], uartTips[3], 0xf08a24, 8);   // TX: the audio going out
    wire(g1[32], uartTips[0], 0x2a2b30, 7);

    // pulses that travel along SD and TX while audio plays
    const pulseMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const pulses = [];
    [[sdCurve, 0x8fd0ff], [txCurve, 0xffc27a]].forEach(([curve, color]) => {
      for (let i = 0; i < 3; i++) {
        const s = new T.Mesh(new T.SphereGeometry(1.3, 12, 10), pulseMat.clone());
        s.material.color.set(color);
        rig.add(s);
        pulses.push({ s, curve, off: i / 3 });
      }
    });

    // centre the whole setup in the rig
    const bounds = new T.Box3().setFromObject(rig);
    const centre = bounds.getCenter(new T.Vector3());
    rig.children.forEach(c => c.position.sub(centre));
    pulses.forEach(p => { p.shift = centre; });
    const radius = bounds.getSize(new T.Vector3()).length() / 2;

    // ---------- Interaction ----------
    let rotY = -0.35, rotX = 0.62, drag = null, lastDrag = -1e9;
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    canvas.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY, rotY, rotX, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId);
      tip.hidden = true;
    });
    canvas.addEventListener('pointermove', e => {
      if (drag) {
        rotY = drag.rotY + (e.clientX - drag.x) * 0.01;
        if (!drag.touch) rotX = Math.max(0.15, Math.min(1.35, drag.rotX + (e.clientY - drag.y) * 0.01));
        lastDrag = performance.now();
        return;
      }
      const r = canvas.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      if (hit) {
        tip.textContent = hit.object.userData.label;
        tip.hidden = false;
        tip.style.left = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 4) + 'px';
        tip.style.top = (e.clientY - r.top + 14) + 'px';
      } else tip.hidden = true;
    });
    canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
    ['pointerup', 'pointercancel'].forEach(t => canvas.addEventListener(t, () => { drag = null; }));

    let active = 0, target = 0;
    addEventListener('nc-audio', e => { target = e.detail.playing ? 1 : 0; });

    // ---------- Render loop ----------
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const t = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      const dist = radius * 0.7 / Math.min(t, t * camera.aspect);
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    let running = false;
    function frame(now) {
      if (!running) return;
      if (now - lastDrag > 2500 && !drag && !Resu.reducedMotion) rotY += (-0.35 + Math.sin(now / 3200) * 0.35 - rotY) * 0.01;
      rig.rotation.set(rotX, rotY, 0, 'XYZ');
      active += (target - active) * 0.08;
      chipMat.emissiveIntensity = chipTopMat.emissiveIntensity = 0.55 * active * (0.75 + 0.25 * Math.sin(now / 120));
      for (const p of pulses) {
        const u = (now / 1100 + p.off) % 1;
        p.s.position.copy(p.curve.getPoint(u)).sub(p.shift);
        p.s.material.opacity = active;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    Resu.whenVisible(section, v => {
      if (v && !running) { running = true; requestAnimationFrame(frame); }
      else if (!v) running = false;
    });
  }
})();
