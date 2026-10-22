/* Noise Cancellation: the isometric capture setup (built by tools/build_fpga_figure.mjs into
   assets/noise/fpga-figure.js). An idle tour walks the signal path; hover, focus + arrow keys pick a part.
   While a sample plays (noise.js), packets run mic -> FPGA -> UART along the jumpers, the 7-segment
   displays show the live 8-bit sample (the top 8 of the mic's 24 bits, as on the real board) and the
   LEDs its level. */
(function () {
  const holder = document.getElementById('nc-fig');
  if (!holder) return;

  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const s = document.createElement('script');
    s.src = 'assets/noise/fpga-figure.js';
    s.onload = init;
    s.onerror = () => { holder.querySelector('.nc-fallback').textContent = 'The board drawing could not be loaded.'; };
    document.head.appendChild(s);
  }, { rootMargin: '100% 0px' }).observe(holder);

  // the signal path, in order: [part, what the readout says]
  const TOUR = [
    ['mic',   'INMP441 · I2S mic, 24-bit words'],
    ['i2s',   'I2S jumpers · SCK, WS out, SD in'],
    ['gpio0', 'GPIO 0 · the I2S pins'],
    ['chip',  'Cyclone V · top 8 bits, into a FIFO'],
    ['gpio1', 'GPIO 1 · UART TX'],
    ['uart',  'TX jumper · 8N1, no parity'],
    ['ch343', 'CH343 · USB-UART, about 460 kbaud'],
    ['usb',   'USB · Python saves the bytes'],
  ];
  // everything else you can point at, by item name prefix (longest match wins)
  const NAMES = {
    'board.pcb': 'DE0-CV board', 'board.standoff': 'Standoff', 'board.sdram': '64 MB SDRAM',
    'board.osc': '50 MHz oscillator', 'board.reg': 'Voltage regulator', 'board.power': 'Power jack',
    'board.blaster': 'USB-Blaster port (programming)', 'board.vga': 'VGA output', 'board.ps2': 'PS/2 port',
    'board.sd': 'microSD slot', 'chip.cap': 'Decoupling capacitors', hex: 'HEX5–HEX0 · the live sample',
    ledr: 'LEDR9–LEDR0 · the sample level', sw: 'Slide switches SW9–SW0', key: 'Push buttons KEY3–KEY0',
    bb: 'Breadboard', power: 'Power jumpers · 3.3 V and GND', 'i2s.lr': 'L/R tied to GND · left channel',
  };
  const DIGITS = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };

  function init() {
    holder.innerHTML = FPGA_FIGURE.html;
    const stage = holder.querySelector('.nc-stage');
    const readout = holder.querySelector('[data-readout]');
    const items = [...holder.querySelectorAll('.it')];
    const byPart = {};
    items.forEach(el => (byPart[el.dataset.part] = byPart[el.dataset.part] || []).push(el));
    const chunks = {};
    holder.querySelectorAll('.it[data-route]').forEach(el => {
      (chunks[el.dataset.route] = chunks[el.dataset.route] || [])[+el.dataset.chunk] = el;
    });
    const digits = [...holder.querySelectorAll('.nc-digit')].sort((a, b) => b.dataset.digit - a.dataset.digit);   // HEX5 .. HEX0
    const leds = [...holder.querySelectorAll('.it[data-led]')].sort((a, b) => a.dataset.led - b.dataset.led);       // LEDR0 .. LEDR9
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const status = document.createElement('span');   // announces keyboard steps
    status.className = 'nc-sr';
    status.setAttribute('role', 'status');
    stage.after(status);

    const say = text => { if (readout.textContent !== text) readout.textContent = text; };
    let litNow = null;
    function light(part, name) {
      const key = part + '|' + (name || '');
      if (key === litNow) return;
      litNow = key;
      items.forEach(el => {
        const on = el.dataset.part === part && (!name || el.dataset.name.startsWith(name));
        if (on) el.setAttribute('data-lit', ''); else el.removeAttribute('data-lit');
      });
    }
    const describe = (part, name) => {
      const stop = TOUR.find(([p]) => p === part);
      if (stop) return stop[1];
      const key = Object.keys(NAMES).filter(n => name.startsWith(n)).sort((a, b) => b.length - a.length)[0];
      return key ? NAMES[key] : 'DE0-CV board';
    };

    // ---------- displays ----------
    function show(text) {
      const padded = text.padStart(6).slice(-6);
      digits.forEach((g, i) => {
        const on = DIGITS[padded[i]] || '';
        g.querySelectorAll('.nc-seg').forEach(seg => {
          if (on.includes(seg.dataset.seg)) seg.setAttribute('data-on', ''); else seg.removeAttribute('data-on');
        });
      });
    }
    function meter(count) {
      leds.forEach((el, i) => { if (i < count) el.setAttribute('data-on', ''); else el.removeAttribute('data-on'); });
    }
    function pulses(on, t) {
      // SD runs from the mic (end of its route) to GPIO 0; TX and USB run forward
      const runs = [['i2s.sd', -1, 0], ['uart.tx', 1, 0.45], ['usb', 1, 0.75]];
      for (const [route, dir, delay] of runs) {
        const list = chunks[route] || [];
        const n = list.length;
        const head = ((t / 1.4 - delay) % 1 + 1) % 1 * (n + 3);
        list.forEach((el, i) => {
          const pos = dir > 0 ? i : n - 1 - i;
          if (on && pos <= head && pos > head - 3) el.setAttribute('data-on', ''); else el.removeAttribute('data-on');
        });
      }
    }

    // ---------- state ----------
    let focusPart = null, focusName = null, lastTouch = -1e9, tourAt = 0, tourClock = 0, visible = false, frame = 0, last = 0;
    let shownAt = 0;
    function tick(now) {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      const playback = window.NcPlayback && window.NcPlayback.now();
      const idle = now - lastTouch > 3600;

      if (playback && playback.stage === 'in') {
        // streaming: the board shows what it is sending
        const byte = Math.max(-128, Math.min(127, Math.round(playback.value * 128)));
        if (now - shownAt > 90) {      // slow enough to read
          shownAt = now;
          show(String(byte));
          const db = 20 * Math.log10(playback.rms + 1e-6);
          meter(Math.max(0, Math.min(10, Math.round((db + 42) / 4))));
          say(`streaming · sample ${byte < 0 ? '−' + -byte : byte} · 8 of 24 bits`);
        }
        pulses(!still.matches, now / 1000);
        light(focusPart && !idle ? focusPart : 'chip', focusPart && !idle ? focusName : null);
      } else {
        show(''); meter(0); pulses(false, 0);
        if (playback && playback.stage === 'out') {
          say('result · filtered in Python on the laptop');
          light('usb');
        } else if (focusPart && !idle) {
          say(describe(focusPart, focusName || ''));
          light(focusPart, focusName);
        } else {
          if (!still.matches) {
            tourClock += dt;
            if (tourClock > 2.4) { tourClock = 0; tourAt = (tourAt + 1) % TOUR.length; }
          }
          focusPart = null;
          say(TOUR[tourAt][1]);
          light(TOUR[tourAt][0]);
        }
      }
      frame = visible ? requestAnimationFrame(tick) : 0;
    }
    const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
    new IntersectionObserver(entries => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) run();
    }, { rootMargin: '120px 0px' }).observe(stage);
    addEventListener('nc-audio', run);

    // ---------- pointer and keyboard ----------
    stage.addEventListener('pointermove', e => {
      const it = e.target.closest && e.target.closest('.it');
      if (!it) return;
      const part = it.dataset.part, name = it.dataset.name;
      const onTour = TOUR.some(([p]) => p === part);
      focusPart = part;
      focusName = onTour ? null : name.replace(/#\d+$/, '').split(':')[0];
      lastTouch = performance.now();
      run();
    });
    stage.addEventListener('pointerleave', () => { lastTouch = performance.now() - 2400; });
    stage.addEventListener('keydown', e => {
      let i = TOUR.findIndex(([p]) => p === focusPart);
      if (i < 0) i = tourAt;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = Math.min(TOUR.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = Math.max(0, i - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = TOUR.length - 1;
      else return;
      e.preventDefault();
      focusPart = TOUR[i][0]; focusName = null; tourAt = i;
      lastTouch = performance.now();
      status.textContent = TOUR[i][1];
      run();
    });
    run();
  }
})();
