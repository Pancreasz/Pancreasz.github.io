/* Noise Cancellation demo: 12 s of Chopin + one of three noises, cleaned by a real FIR filter.
   Everything is computed here from the actual audio (assets/noise/nocturne.js): the waveforms,
   the filtering (windowed-sinc FIR, Hamming, 511 taps), the spectrum and the numbers. */
(function () {
  const section = document.getElementById('noise');
  const samplesEl = document.getElementById('nc-samples');
  const filtersEl = document.getElementById('nc-filters');
  const outBtn = document.getElementById('nc-out');
  const outLabel = document.getElementById('nc-out-label');
  const verdict = document.getElementById('nc-verdict');
  const spec = document.getElementById('nc-spec');
  const specTip = document.getElementById('nc-spec-tip');

  const NOISES = [
    { name: '4 kHz whine', f: 4000, amp: 0.06 },
    { name: '1 kHz tone',  f: 1000, amp: 0.06 },
    { name: '100 Hz hum',  f: 100,  amp: 0.15 },
  ];
  const FILTERS = [
    { id: 'high', name: 'High pass', keeps: 'keeps above 300 Hz', lo: 300,  hi: null },
    { id: 'band', name: 'Band pass', keeps: 'keeps 300 to 2000 Hz', lo: 300, hi: 2000 },
    { id: 'low',  name: 'Low pass',  keeps: 'keeps below 2 kHz',  lo: null, hi: 2000 },
  ];
  const TAPS = 511;
  const C_BEFORE = '#e07b39', C_AFTER = '#4361ee';   // validated pair (dataviz validator, light surface)

  let sr = 22050, clean = null, noisy = [], taps = {}, results = {}, cleanPsd = null;
  let sel = 0, filt = null;

  // ---------- UI shells (drawn before the audio arrives) ----------
  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5 L12.5 8 L5 12.5 Z"/></svg>';
  const ICON_STOP = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1"/></svg>';
  const sampleBtns = NOISES.map((n, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nc-wave';
    b.setAttribute('aria-label', `Sample ${i + 1}: music with a ${n.name}. Play`);
    b.innerHTML = `<canvas width="300" height="56"></canvas><span class="nc-wave-label">${i + 1} · ${n.name}</span><span class="nc-icon">${ICON_PLAY}</span>`;
    b.addEventListener('click', () => { selectSample(i); toggle('in' + i); });
    samplesEl.appendChild(b);
    return b;
  });
  outBtn.insertAdjacentHTML('beforeend', `<span class="nc-icon">${ICON_PLAY}</span>`);
  // a tiny sketch of what each filter lets through
  const SHAPE = { high: 'M2 20 C10 20 12 4 18 4 L46 4', band: 'M2 20 C8 20 10 4 15 4 L33 4 C38 4 40 20 46 20', low: 'M2 4 L30 4 C36 4 38 20 46 20' };
  const filterBtns = FILTERS.map(f => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nc-filter';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<svg viewBox="0 0 48 24" aria-hidden="true"><path d="${SHAPE[f.id]}"/></svg><span><b>${f.name}</b><small>${f.keeps}</small></span>`;
    b.addEventListener('click', () => selectFilter(f.id));
    filtersEl.appendChild(b);
    return b;
  });

  // ---------- Lazy load the clip ----------
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const s = document.createElement('script');
    s.src = 'assets/noise/nocturne.js';
    s.onload = init;
    s.onerror = () => { verdict.textContent = 'The audio clip could not be loaded.'; };
    document.head.appendChild(s);
  }, { rootMargin: '100% 0px' }).observe(section);

  function init() {
    const bin = atob(NOISE_CLIP.pcm16);
    const i16 = new Int16Array(bin.length / 2);
    for (let i = 0; i < i16.length; i++) i16[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
    sr = NOISE_CLIP.sampleRate;
    clean = Float32Array.from(i16, v => v / 32768);
    noisy = NOISES.map(n => {
      const x = new Float32Array(clean.length), w = 2 * Math.PI * n.f / sr;
      for (let i = 0; i < x.length; i++) x[i] = clean[i] + n.amp * Math.sin(w * i);
      return x;
    });
    cleanPsd = psd(clean);
    FILTERS.forEach(f => { taps[f.id] = design(f); });
    sampleBtns.forEach((b, i) => { b.dataset.ready = '1'; drawWave(b.querySelector('canvas'), noisy[i]); });
    selectSample(0);
    addEventListener('resize', redrawAll);
  }

  // ---------- FIR design: windowed sinc (Hamming), like scipy.signal.firwin ----------
  function lowpass(fc) {
    const M = (TAPS - 1) / 2, h = new Float64Array(TAPS), wc = 2 * Math.PI * fc / sr;
    for (let n = 0; n < TAPS; n++) {
      const k = n - M;
      h[n] = (k === 0 ? wc / Math.PI : Math.sin(wc * k) / (Math.PI * k)) * (0.54 - 0.46 * Math.cos(2 * Math.PI * n / (TAPS - 1)));
    }
    return h;
  }
  const gainAt = (h, f) => {
    let re = 0, im = 0; const w = 2 * Math.PI * f / sr;
    for (let n = 0; n < h.length; n++) { re += h[n] * Math.cos(w * n); im -= h[n] * Math.sin(w * n); }
    return Math.hypot(re, im);
  };
  function design(f) {
    let h;
    if (f.lo && f.hi) { const a = lowpass(f.hi), b = lowpass(f.lo); h = a.map((v, i) => v - b[i]); }
    else if (f.hi) h = lowpass(f.hi);
    else { h = lowpass(f.lo).map(v => -v); h[(TAPS - 1) / 2] += 1; }      // spectral inversion
    // unity gain in the middle of the passband
    const ref = f.lo && f.hi ? Math.sqrt(f.lo * f.hi) : f.hi ? 0 : sr / 2;
    const g = gainAt(h, ref);
    return Float32Array.from(h, v => v / g);
  }
  // Convolution by FFT overlap-add, 'same' mode so the output lines up with the input
  // (the filter's (taps-1)/2 sample delay is removed). Same result as the direct sum, ~30x faster.
  const NB = 2048;
  function filter(x, h) {
    const L = h.length, B = NB - L + 1, M = (L - 1) / 2, n = x.length;
    const Hr = new Float64Array(NB), Hi = new Float64Array(NB);
    Hr.set(h); fft(Hr, Hi);
    const acc = new Float64Array(n + L), re = new Float64Array(NB), im = new Float64Array(NB);
    for (let s = 0; s < n; s += B) {
      re.fill(0); im.fill(0);
      for (let i = 0; i < B && s + i < n; i++) re[i] = x[s + i];
      fft(re, im);
      // multiply by H, then inverse FFT as conj(fft(conj(.))) / NB
      for (let k = 0; k < NB; k++) {
        const r = re[k] * Hr[k] - im[k] * Hi[k], i = re[k] * Hi[k] + im[k] * Hr[k];
        re[k] = r; im[k] = -i;
      }
      fft(re, im);
      for (let i = 0; i < NB && s + i < acc.length; i++) acc[s + i] += re[i] / NB;
    }
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = acc[i + M];
    return y;
  }

  // ---------- Spectrum: Welch average of 4096-point Hann FFTs ----------
  const NFFT = 4096;
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  function psd(x) {
    const out = new Float64Array(NFFT / 2 + 1), re = new Float64Array(NFFT), im = new Float64Array(NFFT);
    let frames = 0;
    for (let s = 0; s + NFFT <= x.length; s += NFFT / 2, frames++) {
      for (let i = 0; i < NFFT; i++) { re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (NFFT - 1))); im[i] = 0; }
      fft(re, im);
      for (let k = 0; k <= NFFT / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
    }
    return out.map(v => v / frames);
  }

  const psdCache = {};
  const cached = (key, make) => psdCache[key] || (psdCache[key] = make());

  // ---------- Drawing ----------
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function fit(canvas) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [ctx, w, h];
  }
  // min/max per pixel column; the same vertical scale everywhere so loudness compares honestly
  function drawWave(canvas, x, progress = -1) {
    const [ctx, w, h] = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!x) return;
    const mid = h / 2, scale = (h / 2 - 3) / 0.8, per = x.length / w;
    const ink = css('--ink');
    for (let px = 0; px < w; px++) {
      let lo = 1, hi = -1;
      for (let i = Math.floor(px * per), e = Math.floor((px + 1) * per); i < e; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
      ctx.fillStyle = progress >= 0 && px / w <= progress ? ink : 'rgba(29, 51, 201, .55)';
      ctx.fillRect(px, mid - hi * scale, 1, Math.max(1, (hi - lo) * scale));
    }
    if (progress >= 0) {
      ctx.fillStyle = css('--red');
      ctx.fillRect(Math.round(progress * w), 0, 2, h);
    }
  }

  const FMIN = 50, FMAX = 8000, DBMIN = -90;
  let specGeom = null;
  function drawSpectrum() {
    const [ctx, w, h] = fit(spec);
    ctx.clearRect(0, 0, w, h);
    if (!clean) return;
    const L = 34, R = 8, T = 10, B = 20, pw = w - L - R, ph = h - T - B;
    const xOf = f => L + pw * Math.log(f / FMIN) / Math.log(FMAX / FMIN);
    const yOf = db => T + ph * (Math.max(DBMIN, Math.min(0, db)) / DBMIN);
    const before = cached('n' + sel, () => psd(noisy[sel]));
    const after = filt ? cached('r' + sel + filt, () => psd(result())) : null;
    const ref = Math.max(...before);
    const db = p => 10 * Math.log10(p / ref + 1e-12);
    specGeom = { L, pw, xOf, before, after, db };

    // what the chosen filter lets through
    if (filt) {
      const f = FILTERS.find(f => f.id === filt);
      ctx.fillStyle = 'rgba(67, 97, 238, .08)';
      const x0 = xOf(Math.max(FMIN, f.lo || FMIN)), x1 = xOf(Math.min(FMAX, f.hi || FMAX));
      ctx.fillRect(x0, T, x1 - x0, ph);
    }
    // recessive grid + ticks
    ctx.strokeStyle = '#e6e8ef'; ctx.lineWidth = 1;
    ctx.fillStyle = css('--muted'); ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const [f, label] of [[100, '100'], [300, '300'], [1000, '1k'], [2000, '2k'], [4000, '4k']]) {
      const x = Math.round(xOf(f)) + .5;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.fillText(label, x, T + ph + 4);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const d of [0, -40, -80]) {
      const y = Math.round(yOf(d)) + .5;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillText(d, L - 6, y);
    }
    // the two lines (2px, round)
    const line = (p, color) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = ctx.lineCap = 'round';
      let started = false;
      for (let k = 1; k < p.length; k++) {
        const f = k * sr / NFFT;
        if (f < FMIN || f > FMAX) continue;
        const x = xOf(f), y = yOf(db(p[k]));
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true;
      }
      ctx.stroke();
    };
    line(before, C_BEFORE);
    if (after) line(after, C_AFTER);
    // direct label on the noise peak
    const nf = NOISES[sel].f, k = Math.round(nf * NFFT / sr);
    ctx.fillStyle = css('--text'); ctx.textAlign = nf > 2500 ? 'right' : 'left'; ctx.textBaseline = 'bottom';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(NOISES[sel].name, xOf(nf) + (nf > 2500 ? -6 : 6), Math.max(T + 12, yOf(db(before[k])) + 4));
  }

  // hover: crosshair + both values at that frequency
  spec.addEventListener('pointermove', e => {
    if (!specGeom) return;
    const r = spec.getBoundingClientRect(), x = e.clientX - r.left;
    const { L, pw, before, after, db } = specGeom;
    if (x < L || x > L + pw) { specTip.hidden = true; drawSpectrum(); return; }
    const f = FMIN * Math.pow(FMAX / FMIN, (x - L) / pw), k = Math.round(f * NFFT / sr);
    drawSpectrum();
    const [ctx, , h] = fit(spec);
    ctx.strokeStyle = 'rgba(20, 22, 28, .35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, 10); ctx.lineTo(Math.round(x) + .5, h - 20); ctx.stroke();
    const fmt = v => `${v.toFixed(0)} dB`;
    specTip.innerHTML = `<b>${f < 1000 ? f.toFixed(0) + ' Hz' : (f / 1000).toFixed(2) + ' kHz'}</b>` +
      `<span><i class="key before"></i>noisy ${fmt(db(before[k]))}</span>` +
      (after ? `<span><i class="key after"></i>filtered ${fmt(db(after[k]))}</span>` : '');
    specTip.hidden = false;
    specTip.style.left = Math.min(x + 12, r.width - specTip.offsetWidth - 4) + 'px';
  });
  spec.addEventListener('pointerleave', () => { specTip.hidden = true; drawSpectrum(); });

  // ---------- State ----------
  function result() {
    const key = sel + filt;
    if (!results[key]) results[key] = filter(noisy[sel], taps[filt]);
    return results[key];
  }
  function selectSample(i) {
    sel = i;
    sampleBtns.forEach((b, j) => b.classList.toggle('active', j === i));
    update();
  }
  function selectFilter(id) {
    filt = id;
    filterBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(FILTERS[j].id === id)));
    update();
  }
  function update() {
    if (!clean) return;
    if (playing && playing.id === 'out') stop();
    const outCanvas = outBtn.querySelector('canvas');
    if (!filt) {
      outBtn.disabled = true;
      outLabel.textContent = 'pick a filter';
      verdict.textContent = '';
      drawWave(outCanvas, null);
      drawSpectrum();
      return;
    }
    const f = FILTERS.find(f => f.id === filt), n = NOISES[sel];
    outBtn.disabled = false;
    outLabel.textContent = `${sel + 1} · ${n.name} → ${f.name.toLowerCase()}`;
    drawWave(outCanvas, result());
    drawSpectrum();

    // measured on this filter: how far the noise frequency drops, and how much music energy is left
    const down = -20 * Math.log10(gainAt(taps[filt], n.f));
    let kept = 0, total = 0;
    for (let k = 1; k < cleanPsd.length; k++) {
      const g = gainAt(taps[filt], k * sr / NFFT);
      kept += cleanPsd[k] * g * g; total += cleanPsd[k];
    }
    const keptPct = Math.min(100, 100 * kept / total);
    let say;
    if (down < 6 && n.f === 1000) say = '1 kHz sits right inside the melody, so none of these filters can cut it without cutting the piano. Same wall we hit in the project.';
    else if (down < 6) say = 'The noise went straight through. It is in the range this filter keeps.';
    else if (keptPct < 85) say = 'Noise gone, but the low notes of the piano went with it.';
    else say = 'Noise gone and the music is basically untouched.';
    verdict.innerHTML = `<b>${n.name}: ${down >= 6 ? 'down ' + down.toFixed(0) + ' dB' : 'still there'}</b> · music kept ${keptPct.toFixed(0)}%<br>${say}`;
  }
  function redrawAll() {
    if (!clean) return;
    sampleBtns.forEach((b, i) => drawWave(b.querySelector('canvas'), noisy[i], playing && playing.id === 'in' + i ? playing.p : -1));
    drawWave(outBtn.querySelector('canvas'), filt ? result() : null, playing && playing.id === 'out' ? playing.p : -1);
    drawSpectrum();
  }

  // ---------- Playback ----------
  let actx = null, playing = null;
  outBtn.addEventListener('click', () => toggle('out'));
  function toggle(id) {
    if (!clean) return;
    if (playing && playing.id === id) return stop();
    stop();
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
    const data = id === 'out' ? result() : noisy[+id.slice(2)];
    const buf = actx.createBuffer(1, data.length, sr);
    buf.copyToChannel(data, 0);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    src.start();
    const btn = id === 'out' ? outBtn : sampleBtns[+id.slice(2)];
    playing = { id, src, btn, data, t0: actx.currentTime, dur: buf.duration, p: 0 };
    btn.classList.add('playing');
    btn.querySelector('.nc-icon').innerHTML = ICON_STOP;
    src.onended = () => { if (playing && playing.src === src) stop(); };
    dispatchEvent(new CustomEvent('nc-audio', { detail: { playing: true, stage: id === 'out' ? 'out' : 'in' } }));
    requestAnimationFrame(tick);
  }
  function tick() {
    if (!playing) return;
    playing.p = Math.min(1, (actx.currentTime - playing.t0) / playing.dur);
    drawWave(playing.btn.querySelector('canvas'), playing.data, playing.p);
    requestAnimationFrame(tick);
  }
  function stop() {
    if (!playing) return;
    const { src, btn, data } = playing;
    playing = null;
    try { src.onended = null; src.stop(); } catch (e) {}
    btn.classList.remove('playing');
    btn.querySelector('.nc-icon').innerHTML = ICON_PLAY;
    drawWave(btn.querySelector('canvas'), data);
    dispatchEvent(new CustomEvent('nc-audio', { detail: { playing: false } }));
  }
  // leaving the page stops the sound
  Resu.whenVisible(section, v => { if (!v) stop(); });

  // what is playing right now, for the board drawing (fpga-iso.js): the current sample and its level
  window.NcPlayback = {
    now() {
      if (!playing) return null;
      const d = playing.data, i = Math.min(d.length - 1, Math.max(0, Math.floor((actx.currentTime - playing.t0) * sr)));
      let sum = 0;
      for (let j = Math.max(0, i - 512); j < i; j++) sum += d[j] * d[j];
      return { stage: playing.id === 'out' ? 'out' : 'in', value: d[i], rms: Math.sqrt(sum / 512) };
    },
  };
})();
