/* SNN-Pyramid inference in plain JS: a port of snn_pyramid (D:/snn-pyramid) for one 28x28 image.
   Encoder: 3-level Laplacian pyramid -> per-level quantile latency ladders -> ON/OFF spikes,
   sent over T ticks by the model's schedule (fine-to-coarse). Network: SpikingCNN v1,
   run event-driven: every input spike adds its weights to the next layer.
   Works in the browser (window.SnnEngine) and in Node (module.exports) for testing. */
(function (root) {
  'use strict';

  const N = 28;
  const TAPS = [1, 4, 6, 4, 1];

  // ---------- Model loading ----------
  function decode(b64, Type) {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Type(bytes.buffer);
  }

  /** Dequantise int8 weights (one scale per output channel) into float32. */
  function weights(layer) {
    const q = decode(layer.q, Int8Array);
    const scale = decode(layer.scale, Float32Array);
    const rows = layer.shape[0], per = q.length / rows;
    const w = new Float32Array(q.length);
    for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) w[r * per + i] = q[r * per + i] * scale[r];
    return w;
  }

  /** [out, in] row-major -> [in, out], so one input spike reads a contiguous run. */
  function transpose(w, rows, cols) {
    const t = new Float32Array(w.length);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) t[c * rows + r] = w[r * cols + c];
    return t;
  }

  function load(model) {
    const L = model.layers;
    return {
      model,
      conv1: weights(L.conv1),                                  // [32, 2, 3, 3]
      conv2: weights(L.conv2),                                  // [64, 32, 3, 3]
      fc1T: transpose(weights(L.fc1), 256, 3136),               // [3136, 256]
      fc2T: transpose(weights(L.fc2), 10, 256),                 // [256, 10]
    };
  }

  // ---------- Laplacian pyramid (float path of snn_pyramid/pyramid.py) ----------
  // Mirror padding without repeating the edge sample, like _pad_reflect_1d.
  const reflect = (i, n) => (i < 0 ? -i : i >= n ? 2 * (n - 1) - i : i);

  function blur(x, h, w) {
    const tmp = new Float32Array(h * w), out = new Float32Array(h * w);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {          // along H first
      let acc = 0;
      for (let k = 0; k < 5; k++) acc += TAPS[k] * x[reflect(y + k - 2, h) * w + xx];
      tmp[y * w + xx] = acc / 16;
    }
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {          // then along W
      let acc = 0;
      for (let k = 0; k < 5; k++) acc += TAPS[k] * tmp[y * w + reflect(xx + k - 2, w)];
      out[y * w + xx] = acc / 16;
    }
    return out;
  }

  function downsample(x, h, w) {
    const b = blur(x, h, w), oh = (h + 1) >> 1, ow = (w + 1) >> 1;
    const out = new Float32Array(oh * ow);
    for (let y = 0; y < oh; y++) for (let xx = 0; xx < ow; xx++) out[y * ow + xx] = b[2 * y * w + 2 * xx];
    return out;
  }

  /** Nearest-neighbour upsample of a size x size map to `to` x `to`. */
  function upsample(x, size, to) {
    const f = Math.ceil(to / size), out = new Float32Array(to * to);
    for (let y = 0; y < to; y++) for (let xx = 0; xx < to; xx++) out[y * to + xx] = x[((y / f) | 0) * size + ((xx / f) | 0)];
    return out;
  }

  /** Coarse-first, low-pass mean-centred: [7x7, 14x14, 28x28]. */
  function laplacian(img) {
    const g0 = img, g1 = downsample(g0, 28, 28), g2 = downsample(g1, 14, 14);
    const up1 = upsample(g1, 14, 28), up2 = upsample(g2, 7, 14);
    const l2 = new Float32Array(784), l1 = new Float32Array(196), l0 = Float32Array.from(g2);
    for (let i = 0; i < 784; i++) l2[i] = g0[i] - up1[i];
    for (let i = 0; i < 196; i++) l1[i] = g1[i] - up2[i];
    let mean = 0;
    for (let i = 0; i < 49; i++) mean += l0[i];
    mean /= 49;
    for (let i = 0; i < 49; i++) l0[i] -= mean;
    return [{ size: 7, coef: l0 }, { size: 14, coef: l1 }, { size: 28, coef: l2 }];
  }

  // ---------- Encoder: quantile latency ladders, ON/OFF, schedule ----------
  function encode(engine, img) {
    const m = engine.model, T = m.T;
    const levels = laplacian(img);
    const input = Array.from({ length: T }, () => new Uint8Array(2 * 784));   // [T][ON 784 | OFF 784]

    levels.forEach((lvl, li) => {
      const ticks = [];
      m.schedule.forEach((active, t) => { if (active.includes(li)) ticks.push(t); });
      const ladder = m.ladders[li], scale = m.band_scales[li], s = lvl.size, f = N / s;
      lvl.ticks = ticks;
      lvl.fire = new Int8Array(s * s).fill(-1);      // tick index the coefficient fires at, -1 = never
      lvl.sign = new Int8Array(s * s);               // +1 ON, -1 OFF
      lvl.spikes = 0;
      for (let i = 0; i < s * s; i++) {
        const c = lvl.coef[i] / scale, a = Math.abs(c);
        if (!(a > 0)) continue;
        let k = -1;
        for (let j = 0; j < ladder.length; j++) if (a >= ladder[j]) { k = j; break; }   // ladder descends
        if (k < 0) continue;
        lvl.fire[i] = ticks[k];
        lvl.sign[i] = c > 0 ? 1 : -1;
        lvl.spikes++;
        // Nearest upsample to 28x28: one coefficient -> f x f input spikes (clamped to binary)
        const y0 = ((i / s) | 0) * f, x0 = (i % s) * f, ch = c > 0 ? 0 : 784;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) input[ticks[k]][ch + (y0 + dy) * N + x0 + dx] = 1;
      }
    });
    return { levels, input };
  }

  // ---------- Network ----------
  /** LIF with the reset owed from the previous step (snn_pyramid.models.LIF). */
  function lif(v, current, beta, theta, spikes) {
    let n = 0;
    for (let i = 0; i < v.length; i++) {
      const reset = v[i] >= theta ? theta : 0;
      v[i] = beta * v[i] + current[i] - reset;
      spikes[i] = v[i] >= theta ? 1 : 0;
      n += spikes[i];
    }
    return n;
  }

  /** Event-driven 3x3 conv, padding 1: each active input adds its kernel to the outputs. */
  function convEvents(w, inC, outC, size, active, out) {
    out.fill(0);
    const hw = size * size;
    for (let c = 0; c < inC; c++) for (let p = 0; p < hw; p++) {
      if (!active[c * hw + p]) continue;
      const y = (p / size) | 0, x = p % size;
      for (let ky = 0; ky < 3; ky++) {
        const oy = y - ky + 1;
        if (oy < 0 || oy >= size) continue;
        for (let kx = 0; kx < 3; kx++) {
          const ox = x - kx + 1;
          if (ox < 0 || ox >= size) continue;
          const wo = c * 9 + ky * 3 + kx, o = oy * size + ox;
          for (let oc = 0; oc < outC; oc++) out[oc * hw + o] += w[oc * inC * 9 + wo];
        }
      }
    }
  }

  function pool2(s, C, size, out) {
    const h = size >> 1;
    for (let c = 0; c < C; c++) for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
      const b = c * size * size + 2 * y * size + 2 * x;
      out[c * h * h + y * h + x] = s[b] | s[b + 1] | s[b + size] | s[b + size + 1];
    }
  }

  function denseEvents(wT, nIn, nOut, active, out) {
    out.fill(0);
    for (let j = 0; j < nIn; j++) {
      if (!active[j]) continue;
      const base = j * nOut;
      for (let k = 0; k < nOut; k++) out[k] += wT[base + k];
    }
  }

  /** Full inference. Returns the encoding, per-tick layer spike counts and output spikes. */
  function run(engine, img) {
    const m = engine.model, [b1, b2, b3, b4] = m.betas, th = m.theta;
    const enc = encode(engine, img);
    const I1 = new Float32Array(32 * 784), v1 = new Float32Array(32 * 784), s1 = new Uint8Array(32 * 784), p1 = new Uint8Array(32 * 196);
    const I2 = new Float32Array(64 * 196), v2 = new Float32Array(64 * 196), s2 = new Uint8Array(64 * 196), p2 = new Uint8Array(3136);
    const I3 = new Float32Array(256), v3 = new Float32Array(256), s3 = new Uint8Array(256);
    const I4 = new Float32Array(10), v4 = new Float32Array(10), s4 = new Uint8Array(10);
    const counts = new Array(10).fill(0);
    const ticks = [];

    for (let t = 0; t < m.T; t++) {
      const x = enc.input[t];
      let nIn = 0;
      for (let i = 0; i < x.length; i++) nIn += x[i];
      convEvents(engine.conv1, 2, 32, 28, x, I1);
      const n1 = lif(v1, I1, b1, th, s1);
      pool2(s1, 32, 28, p1);
      convEvents(engine.conv2, 32, 64, 14, p1, I2);
      const n2 = lif(v2, I2, b2, th, s2);
      pool2(s2, 64, 14, p2);
      denseEvents(engine.fc1T, 3136, 256, p2, I3);
      const n3 = lif(v3, I3, b3, th, s3);
      denseEvents(engine.fc2T, 256, 10, s3, I4);
      lif(v4, I4, b4, th, s4);
      for (let k = 0; k < 10; k++) counts[k] += s4[k];
      ticks.push({ in: nIn, conv1: n1, conv2: n2, fc1: n3, out: Array.from(s4), counts: counts.slice() });
    }
    // argmax, first index wins ties (torch.argmax)
    let pred = 0;
    for (let k = 1; k < 10; k++) if (counts[k] > counts[pred]) pred = k;
    return { ...enc, ticks, counts, pred };
  }

  const api = { load, encode, run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SnnEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
