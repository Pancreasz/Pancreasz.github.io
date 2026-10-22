/* PAINAI: activities as "quests" on a map of Bangkok.
   The map is a static image (assets/painai/bangkok.webp, built by tools/build_painai_map.py
   from OpenStreetMap tiles) because the live tile server blocks pages opened from disk.
   One fixed pin always shows the project text; hover / tap the others for a quest card.
   All activity data below is MOCK. */
(function () {
  const map = document.getElementById('painai-map');
  const canvas = document.getElementById('painai-canvas');
  const textCard = document.getElementById('painai-text');
  const quest = document.getElementById('painai-quest');
  const coneStatic = canvas.querySelector('.cone-static');
  const coneQuest = canvas.querySelector('.cone-quest');
  const search = document.getElementById('painai-search');
  const sideBtn = document.getElementById('painai-side-btn');
  const side = document.getElementById('painai-side');
  const list = document.getElementById('painai-list');

  // Tile block the image was stitched from (printed by tools/build_painai_map.py)
  const MAP_TILES = { z: 14, x: 12763, y: 7557, nx: 9, ny: 6 };

  /** lat/lng -> fraction (0..1) across the image (Web Mercator, like the tiles). */
  function project([lat, lng]) {
    const n = 2 ** MAP_TILES.z, r = lat * Math.PI / 180;
    const tx = (lng + 180) / 360 * n;
    const ty = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    return { x: (tx - MAP_TILES.x) / MAP_TILES.nx, y: (ty - MAP_TILES.y) / MAP_TILES.ny };
  }

  /** Image fraction -> px in the canvas, honouring object-fit: cover cropping (phones). */
  const img = canvas.querySelector('.map-img');
  function toPx(f) {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const iw = img.naturalWidth || 2304, ih = img.naturalHeight || 1536;
    const s = Math.max(W / iw, H / ih);
    const [ox, oy] = getComputedStyle(img).objectPosition.split(' ').map(v => parseFloat(v) / 100);
    return { x: (W - iw * s) * ox + f.x * iw * s, y: (H - ih * s) * oy + f.y * ih * s };
  }
  function placePin(el, f) {
    const p = toPx(f);
    el.style.setProperty('--x', p.x + 'px');
    el.style.setProperty('--y', p.y + 'px');
    return p;
  }

  const ACTIVITIES = [
    { name: 'Looking for football player', tag: 'Sport', joined: 3, max: 11,
      when: 'Sat 17:00', where: 'Thai-Japanese Stadium, Din Daeng', host: 'Tee',
      latlng: [13.7637, 100.5507],
      text: 'We play 11-a-side every Saturday and keep coming up short. Any position, any level, just bring boots and water. We grab moo kratha after.' },
    { name: 'Boardgame night', tag: 'Games', joined: 4, max: 6,
      when: 'Fri 19:00', where: 'Board game café, Ari', host: 'Mint',
      latlng: [13.7796, 100.5446],
      text: 'Catan, Codenames and whatever new box someone brings. First-timers welcome, we teach the rules. ~150 THB table fee.' },
    { name: 'Movie watch party', tag: 'Chill', joined: 7, max: 10,
      when: 'Sun 14:00', where: 'Siam Paragon', host: 'Ploy',
      latlng: [13.7462, 100.5347],
      text: 'Catching the new sci-fi release together, then coffee to argue about the ending. Tickets booked as a group so we sit together.' },
    { name: 'Running club', tag: 'Sport', joined: 12, max: 20,
      when: 'Wed 06:00', where: 'Lumphini Park', host: 'Ben',
      latlng: [13.7315, 100.5418],
      text: 'Easy 5 km loop around the park before work, pace about 6:30/km. Nobody gets left behind. Optional jok breakfast after.' },
    { name: 'Badminton come join us !!', tag: 'Sport', joined: 5, max: 8,
      when: 'Thu 19:30', where: 'Badminton court, Ekkamai', host: 'Fah',
      latlng: [13.7196, 100.5852],
      text: 'Two courts booked for two hours. Doubles rotation, mixed levels. Bring your own racket or borrow one of ours.' },
  ];

  const PIN = '<svg viewBox="0 0 38 48" aria-hidden="true"><path d="M19 46 C12 34 3 26 3 17 a16 16 0 0 1 32 0 C35 26 26 34 19 46 Z"/><circle cx="19" cy="17" r="6"/></svg>';
  const narrow = () => innerWidth <= 760;

  // ---------- The fixed pin that always shows the project text ----------
  const HOME = { x: 0.47, y: 0.2 };   // a spot just right of the text card
  const homePin = document.createElement('div');
  homePin.className = 'pin pin-home';
  homePin.innerHTML = PIN + '<span>PAINAI</span>';
  homePin.setAttribute('aria-hidden', 'true');
  canvas.appendChild(homePin);

  function drawStaticCone() {
    // Phones: the card sits below the map. Side list open: the card is hidden.
    if (narrow() || map.classList.contains('side-open')) return Resu.clear(coneStatic);
    Resu.cone(coneStatic, canvas, homePin.querySelector('svg'), textCard);
  }

  // ---------- Activity pins ----------
  let active = null, hideTimer = null;
  ACTIVITIES.forEach((a, i) => {
    a.f = project(a.latlng);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pin';
    b.setAttribute('aria-label', a.name);
    b.innerHTML = PIN;
    b.addEventListener('mouseenter', () => show(i));
    b.addEventListener('focus', () => show(i));
    b.addEventListener('mouseleave', scheduleHide);
    b.addEventListener('blur', scheduleHide);
    b.addEventListener('click', () => (active === i ? hide() : show(i)));   // tap support
    canvas.appendChild(b);
    a.pin = b;

    const li = document.createElement('li');
    li.innerHTML = `<button type="button"><b>${a.name}</b><span></span></button>`;
    li.querySelector('button').addEventListener('click', () => show(i));
    list.appendChild(li);
    a.li = li;
    updateListRow(a);
  });

  quest.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  quest.addEventListener('mouseleave', scheduleHide);

  function card(a) {
    const full = a.joined >= a.max;
    return `<span class="quest-tag">${a.tag}</span>
      <h3>${a.name}</h3>
      <p class="quest-meta">${a.when} · ${a.where}</p>
      <p class="quest-text">${a.text}</p>
      <div class="quest-party">
        <div class="quest-bar"><i style="width:${Math.round(a.joined / a.max * 100)}%"></i></div>
        <span class="quest-count">${a.joined}/${a.max} joined</span>
      </div>
      <div class="quest-foot">
        <span>Host: ${a.host}</span>
        <button type="button" class="quest-join${a.me ? ' joined' : ''}"${full && !a.me ? ' disabled' : ''}>
          ${a.me ? 'Joined ✓' : full ? 'Full' : 'Join'}</button>
      </div>`;
  }

  function show(i) {
    clearTimeout(hideTimer);
    const a = ACTIVITIES[i];
    active = i;
    ACTIVITIES.forEach((x, j) => x.pin.classList.toggle('active', j === i));
    quest.innerHTML = card(a);
    quest.querySelector('.quest-join').addEventListener('click', () => toggleJoin(a));
    quest.hidden = false;

    // Beside the pin, on whichever side has room
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const { x: px, y: py } = toPx(a.f);
    const cw = quest.offsetWidth, ch = quest.offsetHeight, gap = 56;
    let left = px + gap + cw < W - 12 ? px + gap : px - gap - cw;
    left = Math.max(12, Math.min(W - cw - 12, left));
    const top = Math.max(12, Math.min(H - ch - 12, py - 24 - ch / 2));
    quest.style.left = left + 'px';
    quest.style.top = top + 'px';
    Resu.cone(coneQuest, canvas, a.pin, quest);
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 200);
  }
  function hide() {
    active = null;
    quest.hidden = true;
    ACTIVITIES.forEach(a => a.pin.classList.remove('active'));
    Resu.clear(coneQuest);
  }

  // Mock join: only a local counter, nothing is sent anywhere
  function toggleJoin(a) {
    a.me = !a.me;
    a.joined += a.me ? 1 : -1;
    const btn = quest.querySelector('.quest-join');
    btn.textContent = a.me ? 'Joined ✓' : a.joined >= a.max ? 'Full' : 'Join';
    btn.classList.toggle('joined', a.me);
    btn.disabled = !a.me && a.joined >= a.max;
    quest.querySelector('.quest-count').textContent = `${a.joined}/${a.max} joined`;
    quest.querySelector('.quest-bar i').style.width = Math.round(a.joined / a.max * 100) + '%';
    updateListRow(a);
  }
  function updateListRow(a) {
    a.li.querySelector('span').textContent = `${a.when} · ${a.joined}/${a.max} joined`;
  }

  // ---------- Search: fade pins that don't match, Enter opens the first match ----------
  function matches() {
    const q = search.value.trim().toLowerCase();
    return ACTIVITIES.filter(a => !q || `${a.name} ${a.tag} ${a.where}`.toLowerCase().includes(q));
  }
  search.addEventListener('input', () => {
    const hit = new Set(matches());
    ACTIVITIES.forEach(a => {
      a.pin.classList.toggle('dim', !hit.has(a));
      a.li.hidden = !hit.has(a);
    });
  });
  search.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const first = matches()[0];
    if (first) show(ACTIVITIES.indexOf(first));
  });

  // ---------- Side list ----------
  sideBtn.addEventListener('click', () => {
    const open = !side.classList.contains('open');
    side.classList.toggle('open', open);
    sideBtn.classList.toggle('open', open);
    sideBtn.setAttribute('aria-expanded', open);
    map.classList.toggle('side-open', open);    // the text card makes room for the list
    requestAnimationFrame(() => setTimeout(drawStaticCone, 260));
  });

  // ---------- Layout ----------
  const redraw = () => {
    placePin(homePin, HOME);
    ACTIVITIES.forEach(a => placePin(a.pin, a.f));
    drawStaticCone();
    if (active !== null) show(active);
  };
  addEventListener('resize', redraw);
  img.addEventListener('load', redraw);
  Resu.whenVisible(map, v => { if (v) redraw(); });
  redraw();
})();
