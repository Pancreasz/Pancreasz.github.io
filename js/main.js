/* Shared helpers + side navigation. Loaded before every page script. */
(function () {
  // ---- Helpers exposed to the page scripts ----
  window.Resu = {
    // Draw the sketch's "cone" (two lines from a trigger to the facing side of a box)
    cone(svg, container, fromEl, toEl) {
      const c = container.getBoundingClientRect();
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      const ax = a.left + a.width / 2 - c.left;
      const ay = a.top + a.height / 2 - c.top;
      const l = b.left - c.left, r = b.right - c.left, t = b.top - c.top, btm = b.bottom - c.top;
      // Connect to whichever side of the box the trigger is furthest outside of
      const dx = Math.max(l - ax, ax - r, 0), dy = Math.max(t - ay, ay - btm, 0);
      let p1, p2;
      if (dy > dx)       { p1 = ay > btm ? [l, btm] : [l, t]; p2 = ay > btm ? [r, btm] : [r, t]; }
      else if (ax < l)   { p1 = [l, t]; p2 = [l, btm]; }
      else               { p1 = [r, t]; p2 = [r, btm]; }
      svg.setAttribute('viewBox', `0 0 ${c.width} ${c.height}`);
      svg.innerHTML = `<path d="M${p1} L${ax},${ay} L${p2}"/>`;
    },
    clear(svg) { svg.innerHTML = ''; },

    // Calls cb(true/false) as the element scrolls in/out of view (to pause animations)
    whenVisible(el, cb) {
      new IntersectionObserver(([e]) => cb(e.isIntersecting), { threshold: 0.05 }).observe(el);
    },

    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  // ---- Side navigation dots ----
  const pages = [...document.querySelectorAll('.page')];
  const nav = document.querySelector('.dots');
  for (const p of pages) {
    const a = document.createElement('a');
    a.href = '#' + p.id;
    a.title = p.dataset.label;
    a.setAttribute('aria-label', p.dataset.label);
    nav.appendChild(a);
  }
  const links = [...nav.children];

  // ---- Top bar: one link per big header; a link stays lit for every page under its header ----
  const topLinks = [...document.querySelectorAll('.topnav-links a')];
  const topStart = topLinks.map(a => pages.findIndex(p => '#' + p.id === a.hash));
  const ink = document.querySelector('.topnav-ink');
  let topActive = null;
  function placeInk() {
    if (!topActive) return;
    ink.style.width = topActive.offsetWidth + 'px';
    ink.style.transform = `translateX(${topActive.offsetLeft}px)`;
    ink.classList.add('on');
  }
  function setTop(pageIndex) {
    let k = -1;
    topStart.forEach((start, i) => { if (start <= pageIndex) k = i; });
    topActive = topLinks[k] || null;
    topLinks.forEach(a => {
      const on = a === topActive;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    placeInk();
  }
  addEventListener('resize', placeInk);
  if (document.fonts) document.fonts.ready.then(placeInk);   // link widths change once the font loads

  const topnav = document.querySelector('.topnav');
  const onScroll = () => topnav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach(l => l.classList.toggle('active', l.hash === '#' + e.target.id));
      setTop(pages.indexOf(e.target));
    }
  }, { rootMargin: '-50% 0px -50% 0px' });   // the section crossing the middle of the screen
  pages.forEach(p => io.observe(p));

  // ---- Video placeholders: swap in a <video> on click ----
  document.querySelectorAll('.video-ph').forEach(ph => {
    const play = () => {
      if (ph.classList.contains('playing')) return;
      const v = document.createElement('video');
      v.src = ph.dataset.src;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      v.addEventListener('error', () => {
        v.remove();
        ph.classList.remove('playing');
        ph.querySelector('.ph-label').textContent = 'add video: ' + ph.dataset.src;
      });
      ph.classList.add('playing');
      ph.appendChild(v);
    };
    ph.addEventListener('click', play);
    ph.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  });
})();
