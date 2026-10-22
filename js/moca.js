/* MoCA Test: click a lobe -> text box + its test component.
   frontal -> 1. Clock Drawing Test, parietal -> 2. Day/Date/Month/Year, temporal -> 3. Word recall */
(function () {
  const grid = document.getElementById('moca-grid');
  const cone = grid.querySelector('.cone');
  const textBox = document.getElementById('moca-text');
  const kicker = document.getElementById('moca-kicker');
  const body = document.getElementById('moca-body');
  const compBox = document.getElementById('moca-comp');
  const hint = compBox.querySelector('.comp-hint');
  const comps = [...compBox.querySelectorAll('.comp')];
  const brain = document.getElementById('moca-brain');
  const lobes = [...brain.querySelectorAll('.lobe:not(.lobe-static)')];

  // color: borders and the connector; ink: a darker shade that reads as text
  const INFO = {
    frontal:  { color: '#f4b43a', ink: '#b07a0c', title: 'Frontal lobe · Clock Drawing',
                text: "The patient draws a clock with all the numbers and sets the hands to ten past eleven. It looks easy, but it takes planning, spacing the numbers around the circle, and knowing that \"ten past\" means the long hand points at the 2. That's executive function, the frontal lobe's job, with the parietal lobe helping on the spatial layout. It's worth 3 points: one each for the circle, the numbers and the hands." },
    parietal: { color: '#19a99a', ink: '#0d7f73', title: 'Parietal lobe · Orientation',
                text: "The patient says today's date, month, year and day of the week, plus where they are and which city. It checks whether they can keep track of time and place, which needs attention and memory working together. Losing track of the date is often one of the first things families notice with dementia. Each correct answer is 1 point, 6 in total." },
    temporal: { color: '#8e88d6', ink: '#5a52b0', title: 'Temporal lobe · Memory',
                text: "Delayed recall. The patient hears five words at the start of the test, does the other tasks, then about five minutes later has to say them back without any hints. The temporal lobe, especially the hippocampus inside it, is where new memories get stored, and it's one of the first areas Alzheimer's damages. Each word remembered without a cue is 1 point." },
  };

  let current = null;

  function select(region) {
    const info = INFO[region];
    current = region;
    lobes.forEach(l => l.classList.toggle('active', l.dataset.region === region));
    brain.classList.add('has-active');
    textBox.classList.add('set');
    textBox.style.setProperty('--c', info.color);
    compBox.style.borderColor = info.color;
    grid.style.setProperty('--c', info.color);
    kicker.textContent = info.title;
    kicker.style.color = info.ink;
    body.replaceChildren(Object.assign(document.createElement('p'), { textContent: info.text }));
    hint.hidden = true;
    comps.forEach(c => { c.hidden = c.dataset.comp !== region; });
    drawCone();
  }
  function drawCone() {
    if (!current) return;
    const lobe = lobes.find(l => l.dataset.region === current);
    // On narrow screens the brain sits below the text: skip the cone there
    if (innerWidth <= 900) return Resu.clear(cone);
    Resu.cone(cone, grid, lobe, textBox);
  }
  lobes.forEach(l => {
    l.addEventListener('click', () => select(l.dataset.region));
    l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(l.dataset.region); } });
  });
  // the labels of the three test lobes are clickable too
  brain.querySelectorAll('.labels [data-region]').forEach(t =>
    t.addEventListener('click', () => select(t.dataset.region)));
  addEventListener('resize', drawCone);


  // ---------- 1. Clock Drawing Test examples (score 3 -> 0) ----------
  function clock(score) {
    let s = '';
    if (score === 3 || score === 2) s += '<circle cx="50" cy="50" r="40"/>';
    if (score === 1) s += '<path d="M62 12 A40 40 0 1 1 40 12"/>';                     // contour not closed
    if (score === 0) s += '<path d="M30 20 C50 5 80 20 70 40 C60 55 85 60 75 80 C60 98 30 90 35 70 C40 55 15 50 20 35 C22 28 26 24 30 20 Z"/>';
    if (score >= 2) {
      for (let h = 1; h <= 12; h++) {
        const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
        // score 2: numbers bunched on one side (wrong placement)
        const aa = score === 3 ? a : (h / 12) * Math.PI * 1.1 - Math.PI / 2;
        s += `<text x="${50 + Math.cos(aa) * 31}" y="${50 + Math.sin(aa) * 31}">${h}</text>`;
      }
    }
    if (score === 3) s += '<path d="M50 50 L36 28 M50 50 L69 40"/>';                   // hands at 11:10
    return s;
  }
  const CAPTIONS = ['Lorem ipsum: contour, numbers and hands.', 'Lorem ipsum: numbers misplaced.', 'Lorem ipsum: contour only.', 'Lorem ipsum: no contour.'];
  document.getElementById('moca-clocks').innerHTML = [3, 2, 1, 0].map((sc, i) =>
    `<div class="clock"><span class="score">${sc}</span><svg viewBox="0 0 100 100" aria-label="Clock scored ${sc}">${clock(sc)}</svg><small>${CAPTIONS[i]}</small></div>`
  ).join('');

  // ---------- 2. Day / Date / Month / Year ----------
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fill = (id, items) => {
    document.getElementById(id).innerHTML = '<option value="">–</option>' +
      items.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  };
  const thisYear = new Date().getFullYear();
  fill('dmy-day', [1, 2, 3, 4, 5, 6, 0].map(d => [d, DAYS[d]]));          // Monday first
  fill('dmy-date', Array.from({ length: 31 }, (_, i) => [i + 1, i + 1]));
  fill('dmy-month', MONTHS.map((m, i) => [i, m]));
  fill('dmy-year', Array.from({ length: 7 }, (_, i) => [thisYear - 3 + i, thisYear - 3 + i]));

  const dmyResult = document.getElementById('dmy-result');
  let jokeTimer = null;
  document.getElementById('moca-dmy').addEventListener('submit', e => {
    e.preventDefault();
    clearTimeout(jokeTimer);
    const now = new Date();
    const val = id => document.getElementById(id).value;
    const correct =
      val('dmy-day') === String(now.getDay()) &&
      val('dmy-date') === String(now.getDate()) &&
      val('dmy-month') === String(now.getMonth()) &&
      val('dmy-year') === String(now.getFullYear());

    // Wrong -> "Wrong". Right -> also "Wrong" first, then 2 s later "Just kidding, correct".
    dmyResult.className = 'dmy-result wrong';
    dmyResult.textContent = 'Wrong ✗';
    if (correct) {
      jokeTimer = setTimeout(() => {
        dmyResult.className = 'dmy-result right';
        dmyResult.textContent = 'Just kidding, correct ✓';
      }, 2000);
    }
  });

  // ---------- 3. Remember the words ----------
  const WORDS = ['red', 'ant', 'bottle', 'microphone', 'eraser'];
  const wordsEl = document.getElementById('moca-words');
  const recall = document.getElementById('moca-recall');
  const recallInput = document.getElementById('recall-input');
  const recallResult = document.getElementById('recall-result');
  const hideBtn = document.getElementById('words-hide');

  hideBtn.addEventListener('click', () => {
    const hiding = !wordsEl.classList.contains('hidden');
    wordsEl.classList.toggle('hidden', hiding);
    recall.hidden = !hiding;
    hideBtn.textContent = hiding ? 'Show the words again' : "I've memorised them";
    recallResult.textContent = '';
    recallResult.className = 'dmy-result';
    if (hiding) { recallInput.value = ''; recallInput.focus(); }
  });
  function checkRecall() {
    const typed = new Set(recallInput.value.toLowerCase().split(/[\s,]+/).filter(Boolean));
    const got = WORDS.filter(w => typed.has(w)).length;
    recallResult.className = 'dmy-result ' + (got === WORDS.length ? 'right' : 'wrong');
    recallResult.textContent = `${got} / ${WORDS.length} recalled`;
  }
  document.getElementById('recall-check').addEventListener('click', checkRecall);
  recallInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkRecall(); });

  // ---------- Hannibal clip: plays muted while on screen ----------
  const video = document.getElementById('hannibal-video');
  if (video && !Resu.reducedMotion) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) video.play().catch(() => {});   // autoplay can be refused; controls still work
      else video.pause();
    }, { threshold: 0.4 }).observe(video);
  }
})();
