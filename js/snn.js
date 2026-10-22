/* SNN-Pyramid: draw a digit -> the real trained model (js/snn-engine.js + assets/snn/model.js).
   The drawing is turned into an MNIST-style 28x28 image, encoded as Laplacian-pyramid spikes
   (sent fine-to-coarse over T ticks) and classified by output spike count.
   Everything is deterministic: the same drawing always gives the same spikes. */
(function () {
  const section = document.getElementById('snn');
  const pad = document.getElementById('snn-draw');
  const ctx = pad.getContext('2d', { willReadFrequently: true });
  const levelEls = [...section.querySelectorAll('.snn-level')];       // data-level 2, 1, 0
  const ticksEl = document.getElementById('snn-ticks');
  const digitEl = document.getElementById('snn-digit');
  const confEl = document.getElementById('snn-conf');
  const barsEl = document.getElementById('snn-bars');
  const modelEl = document.getElementById('snn-model');
  const pyrCanvases = [...document.querySelectorAll('#pyr canvas')];

  const INK = '#1d33c9', OFF = '#e5484d';
  const TICK_MS = 260;          // playback speed

  let engine = null, loading = null;
  let sample = null;            // exact 28x28 test image when "Try a real MNIST digit" was used
  let result = null, inputImg = null, playTimer = null, playing = false;
  const LEVEL_SIZE = [7, 14, 28];   // coarse first, as in the model

  // ---------- Lazy-load the model when the page gets close ----------
  function loadModel() {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'assets/snn/model.js';
      s.onload = () => {
        engine = SnnEngine.load(window.SNN_PYRAMID);
        const m = engine.model;
        modelEl.textContent = `Real model from my SNN-Pyramid project, running in your browser: ` +
          `${(m.accuracy * 100).toFixed(2)}% on the MNIST test set, ${(m.params / 1000).toFixed(0)}k parameters, ` +
          `T = ${m.T} timesteps (int8 weights here: ${(m.accuracy_int8 * 100).toFixed(2)}%).`;
        buildTicks();
        resolve(engine);
      };
      s.onerror = () => { modelEl.textContent = 'Could not load the model file (assets/snn/model.js).'; reject(); };
      document.head.appendChild(s);
    });
    return loading;
  }
  new IntersectionObserver(([e], io) => {
    if (e.isIntersecting) { io.disconnect(); loadModel(); }
  }, { rootMargin: '100% 0px' }).observe(section);

  // ---------- Drawing pad ----------
  let drawing = false, last = null;
  const point = e => {
    const r = pad.getBoundingClientRect();
    return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height };
  };
  function stroke(a, b) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  pad.addEventListener('pointerdown', e => {
    if (sample) { clearPad(); }       // drawing replaces a loaded sample
    drawing = true;
    pad.setPointerCapture(e.pointerId);
    last = point(e);
    stroke(last, last);
  });
  pad.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = point(e);
    stroke(last, p);
    last = p;
  });
  ['pointerup', 'pointercancel'].forEach(type => pad.addEventListener(type, () => {
    if (!drawing) return;
    drawing = false;
    classify();
  }));

  function clearPad() {
    ctx.clearRect(0, 0, pad.width, pad.height);
    sample = null;
  }
  document.getElementById('snn-clear').addEventListener('click', () => {
    clearPad();
    stopPlayback();
    result = inputImg = null;
    renderAll(-1);
    digitEl.textContent = '–';
    confEl.textContent = 'draw a digit';
  });

  document.getElementById('snn-sample').addEventListener('click', async () => {
    await loadModel();
    const list = engine.model.samples;
    const pick = list[Math.floor(Math.random() * list.length)];
    const bin = atob(pick.image);
    sample = Float32Array.from(bin, c => c.charCodeAt(0) / 255);
    sample.label = pick.label;
    // Paint it on the pad, 10x10 px per MNIST pixel
    ctx.clearRect(0, 0, pad.width, pad.height);
    ctx.fillStyle = INK;
    for (let i = 0; i < 784; i++) {
      if (!sample[i]) continue;
      ctx.globalAlpha = sample[i];
      ctx.fillRect((i % 28) * 10, ((i / 28) | 0) * 10, 10, 10);
    }
    ctx.globalAlpha = 1;
    classify();
  });

  // ---------- Drawing -> MNIST-style 28x28 ----------
  // MNIST digits are scaled to fit a 20x20 box (keeping aspect) and placed so their
  // centre of mass sits at the centre of the 28x28 frame.
  function toMnist() {
    const W = pad.width, H = pad.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const s = 20 / Math.max(bw, bh);
    const tw = Math.max(1, Math.round(bw * s)), th = Math.max(1, Math.round(bh * s));

    // Area-average downscale (anti-aliased, like MNIST)
    const box = new Float32Array(tw * th);
    let max = 0;
    for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) {
      const sx0 = x0 + Math.floor(u * bw / tw), sx1 = x0 + Math.max(Math.floor((u + 1) * bw / tw), Math.floor(u * bw / tw) + 1);
      const sy0 = y0 + Math.floor(v * bh / th), sy1 = y0 + Math.max(Math.floor((v + 1) * bh / th), Math.floor(v * bh / th) + 1);
      let sum = 0, n = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { sum += data[(y * W + x) * 4 + 3]; n++; }
      const val = sum / (n * 255);
      box[v * tw + u] = val;
      if (val > max) max = val;
    }

    // Centre of mass -> (14, 14)
    let m = 0, cx = 0, cy = 0;
    for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const a = box[v * tw + u]; m += a; cx += a * u; cy += a * v; }
    const ox = Math.max(0, Math.min(28 - tw, Math.round(14 - cx / m)));
    const oy = Math.max(0, Math.min(28 - th, Math.round(14 - cy / m)));
    const img = new Float32Array(784);
    for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) img[(oy + v) * 28 + ox + u] = Math.min(1, box[v * tw + u] / max);
    return img;
  }

  // ---------- Inference ----------
  async function classify() {
    if (!engine) {
      confEl.textContent = 'loading model…';
      await loadModel();
    }
    inputImg = sample || toMnist();
    if (!inputImg) return;
    result = SnnEngine.run(engine, inputImg);
    play();
  }

  // ---------- Playback over the T ticks ----------
  function stopPlayback() { clearInterval(playTimer); playTimer = null; playing = false; }
  function play() {
    stopPlayback();
    const T = engine.model.T;
    if (Resu.reducedMotion) return renderAll(T - 1);
    let t = 0;
    playing = true;
    renderAll(0);
    playTimer = setInterval(() => {
      t++;
      if (t >= T - 1) stopPlayback();   // last tick: final state, no "sending" highlight
      renderAll(t);
    }, TICK_MS);
  }

  function buildTicks() {
    const m = engine.model;
    ticksEl.innerHTML = m.schedule.map((lv, t) =>
      `<li data-level="${lv[0]}"><span>t${t + 1}</span></li>`).join('');
  }

  // Draw everything as it stands after tick t (t = -1: empty)
  function renderAll(t) {
    const T = engine ? engine.model.T : 8;
    [...ticksEl.children].forEach((li, i) => {
      li.classList.toggle('done', t >= 0 && i <= t);
      li.classList.toggle('now', playing && i === t);
    });
    const activeLevel = playing && engine ? engine.model.schedule[t][0] : -1;

    levelEls.forEach(el => {
      const li = +el.dataset.level;
      const canvas = el.querySelector('canvas');
      const lvl = result && result.levels[li];
      let n = 0;
      drawLevel(canvas, lvl, LEVEL_SIZE[li], t, () => n++);
      el.querySelector('b').textContent = n;
      el.classList.toggle('active', li === activeLevel);
    });

    if (!result || t < 0) {
      barsEl.innerHTML = bars(new Array(10).fill(0), -1);
      mirrorPyramid();
      return;
    }
    const counts = result.ticks[t].counts;
    const total = counts.reduce((a, b) => a + b, 0);
    let best = 0;
    for (let k = 1; k < 10; k++) if (counts[k] > counts[best]) best = k;
    digitEl.textContent = total ? best : '–';
    const done = t >= T - 1;
    confEl.textContent = done
      ? `${counts[best]} of ${total} output spikes` + (sample ? ` · label ${sample.label}` : '')
      : `tick ${t + 1} / ${T}`;
    barsEl.innerHTML = bars(counts, total ? best : -1);
    mirrorPyramid();
  }

  function bars(counts, best) {
    const max = Math.max(1, ...counts);
    return counts.map((c, k) =>
      `<span class="${k === best ? 'best' : ''}" title="${c} spikes"><i style="height:${(c / max) * 100}%"></i><b>${k}</b></span>`).join('');
  }

  // One pyramid level: faint = coefficient magnitude, solid = a spike that has fired by tick t
  function drawLevel(canvas, lvl, s, t, onSpike) {
    const g = canvas.getContext('2d');
    const W = canvas.width;
    g.clearRect(0, 0, W, W);
    if (lvl) {
      const c = W / s;
      let max = 0;
      for (let i = 0; i < s * s; i++) max = Math.max(max, Math.abs(lvl.coef[i]));
      for (let i = 0; i < s * s; i++) {
        const x = (i % s) * c, y = ((i / s) | 0) * c;
        const a = Math.abs(lvl.coef[i]) / (max || 1);
        if (a > 0.04) {
          g.fillStyle = `rgba(20,22,28,${a * 0.12})`;
          g.fillRect(x, y, c, c);
        }
        if (lvl.fire[i] >= 0 && lvl.fire[i] <= t) {
          onSpike();
          g.fillStyle = lvl.sign[i] > 0 ? INK : OFF;
          g.fillRect(x + 0.5, y + 0.5, c - 1, c - 1);
        }
      }
    }
    g.strokeStyle = 'rgba(29,51,201,.08)';
    for (let i = 1; i < s; i++) {
      const p = i * W / s;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, W); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke();
    }
  }

  // 3D pyramid: top = the 28x28 image the network sees, then the three levels
  function mirrorPyramid() {
    const sources = [null, ...levelEls.map(el => el.querySelector('canvas'))];
    pyrCanvases.forEach((pc, i) => {
      const g = pc.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, pc.width, pc.height);
      if (i === 0) {
        if (!inputImg) return;
        const c = pc.width / 28;
        for (let p = 0; p < 784; p++) {
          if (inputImg[p] <= 0) continue;
          g.fillStyle = `rgba(20,22,28,${inputImg[p]})`;
          g.fillRect((p % 28) * c, ((p / 28) | 0) * c, c, c);
        }
      } else {
        g.drawImage(sources[i], 0, 0, pc.width, pc.height);
      }
    });
  }

  renderAll(-1);

  // ---------- Pyramid: drag to rotate ----------
  const stage = document.getElementById('pyr-stage');
  const pyr = document.getElementById('pyr');
  let rx = 60, rz = -38, drag = null;
  stage.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, rx, rz };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    rz = drag.rz + (e.clientX - drag.x) * 0.5;
    rx = Math.max(15, Math.min(80, drag.rx - (e.clientY - drag.y) * 0.3));
    pyr.style.setProperty('--rz', rz + 'deg');
    pyr.style.setProperty('--rx', rx + 'deg');
  });
  ['pointerup', 'pointercancel'].forEach(type => stage.addEventListener(type, () => {
    drag = null;
    stage.classList.remove('dragging');
  }));
})();
