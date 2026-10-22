/* Page transitions (all skipped when the visitor prefers reduced motion):
   - entrance: titles rise letter by letter + a hand-drawn underline, then blocks slide/zoom in, staggered
   - the PROJECT divider assembles from scattered letters
   - exit: a page fades and drifts up as you scroll past it
   - nav dots: an ink curtain sweeps across, jumps, and sweeps away
   - a thin scroll progress bar */
(function () {
  const root = document.documentElement;
  if (!root.classList.contains('tx')) return;          // set in <head> unless reduced motion
  window.__txReady = true;

  const pages = [...document.querySelectorAll('.page')];

  // ---------- Split text into per-letter spans (words kept unbreakable) ----------
  let charIndex = 0;
  function splitLetters(el, extra) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const nodes = [...el.childNodes];
    el.textContent = '';
    charIndex = 0;
    for (const node of nodes) {
      if (node.nodeType !== Node.TEXT_NODE) { el.appendChild(node); continue; }   // keeps <br>
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(' ')); return; }
        const word = document.createElement('span');
        word.className = 'w';
        word.setAttribute('aria-hidden', 'true');
        for (const ch of part) {
          const s = document.createElement('span');
          s.className = 'ch';
          s.textContent = ch;
          s.style.setProperty('--ci', charIndex++);
          if (extra) extra(s);
          word.appendChild(s);
        }
        el.appendChild(word);
      });
    }
    return charIndex;
  }

  const UNDERLINE = '<svg class="ink-line" viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true">' +
    '<path pathLength="1" d="M3 9 C70 3 120 12 190 7 S320 4 397 8"/></svg>';

  // Section titles: letters + underline
  document.querySelectorAll('.page-title').forEach(t => {
    splitLetters(t);
    const wrap = document.createElement('span');
    wrap.className = 'tt';
    while (t.firstChild) wrap.appendChild(t.firstChild);
    wrap.insertAdjacentHTML('beforeend', UNDERLINE);
    t.appendChild(wrap);
  });
  // Hero name
  const heroName = document.querySelector('.hero-name');
  if (heroName) splitLetters(heroName);
  // PROJECT divider: each letter starts somewhere random
  const divider = document.querySelector('.divider-title');
  if (divider) splitLetters(divider, s => {
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}vw`);
    s.style.setProperty('--dy', `${(Math.random() - 0.5) * 70}vh`);
    s.style.setProperty('--rot', `${(Math.random() - 0.5) * 220}deg`);
  });

  // ---------- Entrance targets ----------
  // [selector, motion]; only the innermost matches animate (a container whose children animate stays put)
  const TARGETS = [
    ['.avatar', 'zoom'], ['.hero-quote', 'up'],
    ['.grid-2 > :first-child', 'left'], ['.grid-2 > :last-child', 'right'],
    ['.fly-bottom > *', 'up'],
    ['.snn-bottom > *', 'up'], ['.snn-model', 'up'],
    ['.painai-hint', 'left'], ['.map', 'zoom'],
    ['.ear-quote', 'up'], ['.ear-pipe > *', 'zoom'], ['.ear-bottom > *', 'up'],
    ['.moca-left > *', 'left'], ['.moca-right > *', 'right'],
    ['.nc-top > :first-child', 'left'], ['.nc-top > :last-child', 'right'], ['.nc-bottom > *', 'up'], ['.nc-credit', 'up'],
    ['.xp > *', 'left'],
    ['.quote', 'up'],
    ['.solar-bottom > *', 'up'], ['.cogen-flow > *', 'zoom'],
    ['.wh-grid > :not(.cone)', 'zoom'],
    ['.paper', 'up'], ['.sub-title', 'left'], ['.about-row > *', 'up'],
  ];

  const titleMs = page => Math.min(page.querySelectorAll('.page-title .ch').length, 14) * 30 + 120;
  pages.forEach(page => {
    const found = new Map();
    for (const [sel, motion] of TARGETS) {
      page.querySelectorAll(sel).forEach(el => { if (!found.has(el)) found.set(el, motion); });
    }
    const els = [...found.keys()].filter(el => ![...found.keys()].some(o => o !== el && el.contains(o)));
    els.forEach(el => {
      el.classList.add('rv');
      el.dataset.rv = found.get(el);
      // Once done, hand the element back to its own styles (hover transforms, transitions…)
      el.addEventListener('animationend', function done(e) {
        if (e.target !== el) return;
        el.classList.remove('rv', 'go');
        el.removeEventListener('animationend', done);
      });
    });
  });

  // A page's title animates when the page arrives…
  const pageIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      pageIO.unobserve(e.target);
      e.target.classList.add('in');
      e.target.dataset.inAt = performance.now();
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  pages.forEach(p => pageIO.observe(p));

  // …and each block when it itself scrolls into view (tall pages reveal as you go).
  // Blocks appearing together are staggered, starting after the title if it just began.
  let resizeTimer = null;
  const blockIO = new IntersectionObserver(entries => {
    const now = performance.now();
    const shown = entries.filter(e => e.isIntersecting).map(e => e.target)
      .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    let longest = 0;
    shown.forEach((el, k) => {
      blockIO.unobserve(el);
      const page = el.closest('.page');
      const since = now - (+page.dataset.inAt || now);
      const delay = Math.max(0, titleMs(page) - since) + k * 90;
      el.style.setProperty('--d', `${delay}ms`);
      el.classList.add('go');
      longest = Math.max(longest, delay);
    });
    if (shown.length) {
      // Things measured mid-animation (connector lines, pins) re-measure once it settles
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => dispatchEvent(new Event('resize')), longest + 900);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.rv').forEach(el => blockIO.observe(el));

  // ---------- Exit: fade + drift up while a page scrolls away ----------
  const bodies = pages.map(p => p.querySelector(':scope > .inner, :scope > .divider-title'));
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const vh = innerHeight;
      pages.forEach((page, i) => {
        const body = bodies[i];
        if (!body) return;
        const bottom = page.getBoundingClientRect().bottom;
        // 0 while the page's bottom is below 55% of the screen, 1 once it reaches the top
        const p = Math.min(1, Math.max(0, (vh * 0.55 - bottom) / (vh * 0.55)));
        if (p === +body.dataset.exit) return;
        body.dataset.exit = p;
        body.style.opacity = p ? 1 - 0.7 * p : '';
        body.style.transform = p ? `translateY(${-50 * p}px)` : '';   // translate only: no scaling, so
      });                                                               // connector lines stay aligned
      const max = root.scrollHeight - vh;
      bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // ---------- Ink curtain for the nav dots ----------
  const curtain = document.createElement('div');
  curtain.className = 'curtain';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<span class="curtain-label"></span>';
  document.body.appendChild(curtain);
  const label = curtain.firstChild;
  let busy = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  document.addEventListener('click', async e => {
    const a = e.target.closest('.dots a[href^="#"], .topnav a[href^="#"]');
    if (!a) return;
    const target = document.querySelector(a.hash);
    if (!target) return;
    e.preventDefault();
    if (busy) return;
    busy = true;
    label.textContent = target.dataset.label || '';
    curtain.className = 'curtain cover';                 // sweep up over the page
    await wait(520);
    root.style.scrollBehavior = 'auto';
    scrollTo({ top: target.getBoundingClientRect().top + scrollY, behavior: 'instant' });
    root.style.scrollBehavior = '';
    history.replaceState(null, '', a.hash);
    // keyboard and screen-reader users continue from the new section
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    await wait(180);
    curtain.className = 'curtain uncover';               // and away off the top
    await wait(560);
    curtain.className = 'curtain';
    busy = false;
  });
})();
