/* =============================================
   FOOTBALL INJURY SCROLLYTELLING
   script.js — One Stand Per Season Edition

   Architecture:
   ─────────────
   1.  Constants & Config
   2.  Stand geometry — generateStandSeats()
   3.  Data mapping — mapSeasonToDots()
   4.  Stadium SVG background — drawStadiumBackground()
   5.  D3 init & seat rendering
   6.  Narrative step handlers
   7.  Stadium Scrollama
   8.  Headline Evidence Scrollama
   9.  Congestion Chart Scrollama
   10. Learn More panel
   11. Resize handler + mobile helpers

   Season layout (bottom = earliest, top = latest):
     Stand 0 (bottom) → 2020/21
     Stand 1           → 2021/22
     Stand 2           → 2022/23
     Stand 3           → 2023/24
     Stand 4 (top)     → 2024/25
   ============================================= */

/* =============================================
   1. CONSTANTS & CONFIG
   ============================================= */

const INJURY_COLORS = {
  muscle:   '#ff6b6b',
  joint:    '#63b3ed',
  ligament: '#48cfad',
  tendon:   '#ffd166',
};

const TYPE_ORDER = ['muscle', 'joint', 'ligament', 'tendon'];

const SEASONS = [
  { label: '2020/21', muscle: 6023, joint: 3404, ligament: 2432, tendon: 383  },
  { label: '2021/22', muscle: 6145, joint: 3592, ligament: 2303, tendon: 429  },
  { label: '2022/23', muscle: 5930, joint: 3339, ligament: 2423, tendon: 672  },
  { label: '2023/24', muscle: 6494, joint: 4168, ligament: 2744, tendon: 449  },
  { label: '2024/25', muscle: 7352, joint: 3760, ligament: 2719, tendon: 728  },
];

const N_STANDS = SEASONS.length;

const CFG = {
  GAP_FRAC:        0.30,
  TRAPEZOID_TAPER: 0.04,
  STAND_GAP_FRAC:  0.12,
  STAND_PAD_V:     0.08,
  STAND_PAD_H:     0.035,
  DOT_R_MIN:       2.5,
  DOT_R_MAX:       6.0,
  DOT_R_FRAC:      0.0085,
  DAYS_PER_DOT:    100,
};

const SEAT_EMPTY_FILL = 'rgba(255,255,255,0.08)';

/* =============================================
   2. STAND GEOMETRY
   ─────────────────────────────────────────────
   Stand 0 = bottom of stadium (highest y in SVG).
   ============================================= */

function generateStandSeats(standIndex, W, H) {
  const r    = Math.max(CFG.DOT_R_MIN, Math.min(CFG.DOT_R_MAX, W * CFG.DOT_R_FRAC));
  const cell = r * 2 * (1 + CFG.GAP_FRAC);

  /* Invert so stand 0 draws at the bottom */
  const svgBandIndex = standIndex;

  const bandH   = H / N_STANDS;
  const gapH    = bandH * CFG.STAND_GAP_FRAC;
  const bandTop = svgBandIndex * bandH + gapH * 0.5;
  const bandBot = bandTop + bandH - gapH;
  const innerH  = bandBot - bandTop;

  const padV    = innerH * CFG.STAND_PAD_V;
  const usableH = innerH - padV * 2;
  const startY  = bandTop + padV + r;

  const nRows   = Math.max(1, Math.floor(usableH / cell));

  const padH       = W * CFG.STAND_PAD_H;
  const maxUsableW = W - padH * 2;
  const totalTaper = CFG.TRAPEZOID_TAPER * maxUsableW * 2;

  const seats = [];
  let seatIndex = 0;

  for (let row = 0; row < nRows; row++) {
    const cy = startY + row * cell;
    if (cy + r > bandBot) break;

    const taperFrac = nRows > 1 ? row / (nRows - 1) : 0;
    const rowShrink = totalTaper * taperFrac;
    const rowW      = maxUsableW - rowShrink;
    const rowLeft   = padH + rowShrink * 0.5;

    const nCols  = Math.max(1, Math.floor(rowW / cell));
    const gridW  = (nCols - 1) * cell;
    const startX = rowLeft + (rowW - gridW) * 0.5;

    for (let col = 0; col < nCols; col++) {
      seats.push({
        id:         `st${standIndex}_s${seatIndex}`,
        standIndex,
        seatIndex,
        x:          startX + col * cell,
        y:          cy,
        r,
      });
      seatIndex++;
    }
  }

  return seats;
}

/* =============================================
   3. DATA MAPPING
   ─────────────────────────────────────────────
   Packs [muscle][joint][ligament][tendon] blocks
   sequentially into the stand's seat array.
   ============================================= */

function mapSeasonToDots(season, standSeats) {
  const total = standSeats.length;

  const rawCounts = TYPE_ORDER.map(t => Math.round((season[t] || 0) / CFG.DAYS_PER_DOT));
  const rawTotal  = rawCounts.reduce((a, b) => a + b, 0);

  let dotCounts;
  if (rawTotal <= total) {
    dotCounts = rawCounts;
  } else {
    const scale = total / rawTotal;
    dotCounts   = rawCounts.map(c => Math.round(c * scale));
    let diff    = total - dotCounts.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0 && i < dotCounts.length; i++) {
      dotCounts[i] += Math.sign(diff);
      diff -= Math.sign(diff);
    }
  }

  /* Cumulative boundaries */
  const boundaries = [0];
  dotCounts.forEach(c => boundaries.push(boundaries[boundaries.length - 1] + c));

  const fillMap = new Map();
  standSeats.forEach((seat, idx) => {
    let fill   = SEAT_EMPTY_FILL;
    let active = false;
    for (let ti = 0; ti < TYPE_ORDER.length; ti++) {
      if (idx >= boundaries[ti] && idx < boundaries[ti + 1]) {
        fill   = INJURY_COLORS[TYPE_ORDER[ti]];
        active = true;
        break;
      }
    }
    fillMap.set(seat.id, { fill, active });
  });

  return fillMap;
}

/* =============================================
   4. STADIUM SVG BACKGROUND
   ============================================= */

function drawStadiumBackground(svgSel, W, H) {
  // Remove any previous background layer
  svgSel.select('g.bg-layer').remove();

  // Insert a new, simple pale background
  const bg = svgSel.insert('g', ':first-child').attr('class', 'bg-layer');

  // Pale background behind everything
  bg.append('rect')
    .attr('width', W)
    .attr('height', H)
    .attr('fill', '#fffbe8'); // your page background

  // Draw light-grey trapezoids for each stand
  const r    = Math.max(CFG.DOT_R_MIN, Math.min(CFG.DOT_R_MAX, W * CFG.DOT_R_FRAC));
  const cell = r * 2 * (1 + CFG.GAP_FRAC);
  const padH = W * CFG.STAND_PAD_H;

  for (let si = 0; si < N_STANDS; si++) {
    const svgBandIndex = (N_STANDS - 1) - si;
    const bandH      = H / N_STANDS;
    const gapH       = bandH * CFG.STAND_GAP_FRAC;
    const bandTop    = svgBandIndex * bandH + gapH * 0.5;
    const bandBot    = bandTop + bandH - gapH;
    const innerH     = bandBot - bandTop;
    const padV       = innerH * CFG.STAND_PAD_V;
    const usableH    = innerH - padV * 2;
    const nRows      = Math.max(1, Math.floor(usableH / cell));
    const maxUsableW = W - padH * 2;
    const totalTaper = CFG.TRAPEZOID_TAPER * maxUsableW * 2;

    const topX = padH;
    const topW = maxUsableW;
    const botX = padH + totalTaper * 0.5;
    const botW = maxUsableW - totalTaper;

    const trapPath = [
      `M ${topX} ${bandTop}`,
      `L ${topX + topW} ${bandTop}`,
      `L ${botX + botW} ${bandBot}`,
      `L ${botX} ${bandBot}`,
      'Z',
    ].join(' ');

    bg.append('path')
      .attr('d', trapPath)
      .attr('fill', '#e6e6e6')   // ← fixed light grey
      .attr('stroke', 'rgba(0,0,0,0.12)')
      .attr('stroke-width', 1)
      .attr('class', `stand-bg stand-bg-${si}`)
      .style('opacity', 1);      // animation still works
  }
}

/* =============================================
   5. D3 INIT & SEAT RENDERING
   ============================================= */

const stadiumEl     = document.getElementById('stadium');
const legendEl      = document.getElementById('injuryLegend');
const seasonLabelEl = document.getElementById('seasonLabel');

let W = 0, H = 0;
let allStandSeats = [];

const svg         = d3.select('#stadium').append('svg').attr('width', '100%').attr('height', '100%');
const dotsLayer   = svg.append('g').attr('class', 'dots-layer');
const labelsLayer = svg.append('g').attr('class', 'stand-labels-layer');

function isMobile()    { return window.innerWidth <= 900; }
function getStepOffset() { return isMobile() ? 0.72 : 0.5; }

function ensureStadiumReady() {
  const rect = stadiumEl.getBoundingClientRect();
  if (rect.height < 20 || rect.width < 20 || allStandSeats.length === 0) initStadium();
}

function initStadium() {
  const rect = stadiumEl.getBoundingClientRect();
  W = rect.width  || 560;
  H = rect.height || 420;

  /* Guard: if dimensions are still zero (e.g. element not yet laid out),
     bail out — the ResizeObserver will call us again once it has real size. */
  if (W < 10 || H < 10) return;

  allStandSeats = SEASONS.map((_, si) => generateStandSeats(si, W, H));

  drawStadiumBackground(svg, W, H);

  /* Paint all seats empty instantly.
     Do NOT add .active here — visibility is controlled by handleStep()
     so the stadium only appears when the user has scrolled to it. */
  allStandSeats.forEach(seats => {
    const emptyMap = new Map();
    seats.forEach(s => emptyMap.set(s.id, { fill: SEAT_EMPTY_FILL, active: false }));
    renderSeats(seats, emptyMap, { duration: 0, staggerDelay: 0 });
  });
}

/* ---- renderSeats — keyed enter/update/exit for one stand ---- */
function renderSeats(seats, fillMap, opts = {}) {
  if (!seats || seats.length === 0) return;
  const { staggerDelay = 0.4, duration = 400 } = opts;

  const standIdx = seats[0].standIndex;

  const join = dotsLayer.selectAll(`circle.seat-dot[data-stand="${standIdx}"]`)
    .data(seats, d => d.id);

  const entering = join.enter()
    .append('circle')
    .attr('class', 'seat-dot')
    .attr('data-stand', standIdx)
    .attr('cx', d => d.x)
    .attr('cy', d => duration === 0 ? d.y : d.y + 10)
    .attr('r',  d => duration === 0 ? d.r : d.r * 0.3)
    .attr('fill', SEAT_EMPTY_FILL)
    .attr('opacity', duration === 0 ? 1 : 0);

  if (duration > 0) {
    entering.transition().duration(duration)
      .delay((d, i) => i * staggerDelay).ease(d3.easeCubicOut)
      .attr('cy', d => d.y).attr('r', d => d.r).attr('opacity', 1)
      .attr('fill', d => { const s = fillMap.get(d.id); return s ? s.fill : SEAT_EMPTY_FILL; });
  } else {
    entering.attr('fill', d => { const s = fillMap.get(d.id); return s ? s.fill : SEAT_EMPTY_FILL; });
  }

  join.transition().duration(duration || 1)
    .delay((d, i) => i * staggerDelay).ease(d3.easeCubicInOut)
    .attr('cx', d => d.x).attr('cy', d => d.y).attr('r', d => d.r).attr('opacity', 1)
    .attr('fill', d => { const s = fillMap.get(d.id); return s ? s.fill : SEAT_EMPTY_FILL; });

  join.exit().transition().duration(150).attr('r', 0).attr('opacity', 0).remove();
}

/* ---- Track last revealed state for resize re-application ---- */
let _lastRevealedIndex = -1;

/* ---- Reveal stands 0…upToIndex, empty the rest ---- */
function revealSeasonsUpTo(upToIndex, opts = {}) {
  _lastRevealedIndex = upToIndex;

  for (let si = 0; si < N_STANDS; si++) {
    const seats = allStandSeats[si];
    if (!seats) continue;

    const alreadyRevealed = si < upToIndex;
    const isNew           = si === upToIndex;
    const isHidden        = si > upToIndex;

    if (!isHidden) {
      const fillMap = mapSeasonToDots(SEASONS[si], seats);
      renderSeats(seats, fillMap, {
        staggerDelay: alreadyRevealed ? 0        : (opts.staggerDelay ?? 0.45),
        duration:     alreadyRevealed ? 0        : (opts.duration     ?? 460),
      });
      labelsLayer.select(`.stand-label-g[data-stand="${si}"]`)
        .transition().duration(alreadyRevealed ? 0 : 300).delay(80).style('opacity', 1);
    } else {
      const emptyMap = new Map();
      seats.forEach(s => emptyMap.set(s.id, { fill: SEAT_EMPTY_FILL, active: false }));
      renderSeats(seats, emptyMap, { duration: 200, staggerDelay: 0 });
      labelsLayer.select(`.stand-label-g[data-stand="${si}"]`)
        .transition().duration(200).style('opacity', 0);
    }
  }
}

/* ---- Show all stands empty (structural overview) ---- */
function showEmptyStadium() {
  _lastRevealedIndex = -1;
  for (let si = 0; si < N_STANDS; si++) {
    const seats = allStandSeats[si];
    if (!seats) continue;
    const emptyMap = new Map();
    seats.forEach(s => emptyMap.set(s.id, { fill: SEAT_EMPTY_FILL, active: false }));
    renderSeats(seats, emptyMap, { duration: 300, staggerDelay: 0.3 });
    labelsLayer.select(`.stand-label-g[data-stand="${si}"]`)
      .transition().duration(300).style('opacity', 0);
  }
}

function setSeasonLabel(text) {
  if (!text) { seasonLabelEl.classList.remove('active'); return; }
  seasonLabelEl.textContent = text;
  seasonLabelEl.classList.add('active');
}

function colorInjuryText(el) {
  if (!el) return;
  el.querySelectorAll('.injury-text').forEach(item => {
    const t = item.dataset.type;
    if (INJURY_COLORS[t]) item.style.color = INJURY_COLORS[t];
  });
}
function resetInjuryText(el) {
  if (!el) return;
  el.querySelectorAll('.injury-text').forEach(item => { item.style.color = ''; });
}

/* =============================================
   6. NARRATIVE STEP HANDLERS
   ─────────────────────────────────────────────
   data-step values used in HTML:
     "intro"      → show photograph
     "empty"      → empty stadium structure
     "season-0"   → reveal stand 0 (2020/21)
     "season-1"   → reveal stands 0–1
     "season-2"   → reveal stands 0–2
     "season-3"   → reveal stands 0–3
     "season-4"   → reveal stands 0–4
   ============================================= */

function handleStep(element) {
  const step = element.dataset.step;

  // Empty structural view
  if (step === 'empty') {
    ensureStadiumReady();
    stadiumEl.classList.add('active');
    legendEl.classList.remove('active');
    setSeasonLabel(null);
    showEmptyStadium();
    return;
  }

  // Season stands: reveal cumulatively
  if (step && step.startsWith('season-')) {
    const seasonIdx = parseInt(step.replace('season-', ''), 10);
    if (isNaN(seasonIdx)) return;
    ensureStadiumReady();
    stadiumEl.classList.add('active');
    legendEl.classList.add('active');
    setSeasonLabel(SEASONS[seasonIdx].label);
    colorInjuryText(element);
    revealSeasonsUpTo(seasonIdx, { staggerDelay: 0.45, duration: 460 });
  }
}


/* =============================================
   7. STADIUM SCROLLAMA
   ============================================= */

/* Initialise the stadium as soon as the DOM is interactive.
   On mobile the sticky panel is sized by CSS before this fires,
   so getBoundingClientRect() will return real dimensions. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initStadium());
} else {
  initStadium();
}

/* Also re-init after all resources (fonts, images) have loaded — this
   handles the edge case where a font reflow changes the container size. */
window.addEventListener('load', () => {
  initStadium();
  stadiumScroller.resize();
});

const stadiumScroller = scrollama();
stadiumScroller.setup({ step: '#stadiumScrolly .step', offset: getStepOffset() })
  .onStepEnter(({ element }) => { handleStep(element); })
  .onStepExit(({ element, direction }) => { if (direction === 'up') resetInjuryText(element); });

/* =============================================
   8. HEADLINE EVIDENCE SCROLLAMA
   ============================================= */

const headlineCards = Array.from(document.querySelectorAll('.headline-card'));

const headlineScroller = scrollama();
headlineScroller.setup({ step: '.headline-step', offset: isMobile() ? 0.65 : 0.55 })
  .onStepEnter(({ element }) => {
    const idx = parseInt(element.dataset.headline, 10);
    if (isNaN(idx)) return;
    headlineCards.forEach((card, i) => {
      card.classList.toggle('active',     i <= idx);
      card.classList.toggle('superseded', i < idx);
    });
  })
  .onStepExit(({ element, direction }) => {
    if (direction !== 'up') return;
    const idx = parseInt(element.dataset.headline, 10);
    if (isNaN(idx)) return;
    headlineCards.forEach((card, i) => {
      if (i >= idx) card.classList.remove('active', 'superseded');
      if (i === idx - 1) card.classList.remove('superseded');
    });
  });

/* =============================================
   9. CONGESTION CHART SCROLLAMA
   ============================================= */

const congestionScroller = scrollama();
congestionScroller.setup({ step: '.congestion-scrolly .step', offset: isMobile() ? 0.65 : 0.55, debug: false })
  .onStepEnter(({ element }) => {
    const n = element.dataset.chart;
    /* Deactivate all iframes and images */
    document.querySelectorAll('.congestion-scrolly .chart-iframe').forEach(f => f.classList.remove('active'));
    document.querySelectorAll('.congestion-scrolly .chart-img').forEach(f => f.classList.remove('active'));
    /* Activate the matching iframe (desktop) or image (mobile) */
    const iframe = document.getElementById('chart' + n);
    if (iframe) iframe.classList.add('active');
    const img = document.getElementById('chart-img' + n);
    if (img) img.classList.add('active');
  });

/* =============================================
   10. LEARN MORE PANEL
   ============================================= */

const learnMoreBtn     = document.getElementById('learnMoreBtn');
const methodologyPanel = document.getElementById('methodologyPanel');

learnMoreBtn.addEventListener('click', () => {
  const expanded = learnMoreBtn.getAttribute('aria-expanded') === 'true';
  learnMoreBtn.setAttribute('aria-expanded', String(!expanded));
  methodologyPanel.hidden = expanded;
});

/* =============================================
   11. RESIZE — debounced + mobile helpers
   ============================================= */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    initStadium();
    if (_lastRevealedIndex >= 0) {
      revealSeasonsUpTo(_lastRevealedIndex, { duration: 0, staggerDelay: 0 });
    }
    stadiumScroller.resize();
    headlineScroller.resize();
    congestionScroller.resize();
  }, 220);
});

/* Mobile breakpoint crossing — re-setup scrollers */
let _wasMobile = isMobile();
window.addEventListener('resize', () => {
  const _isMobile = isMobile();
  if (_isMobile === _wasMobile) return;
  _wasMobile = _isMobile;
  stadiumScroller.setup({ step: '#stadiumScrolly .step', offset: getStepOffset(), debug: false });
  headlineScroller.setup({ step: '.headline-step', offset: _isMobile ? 0.65 : 0.55, debug: false });
  congestionScroller.setup({ step: '.congestion-scrolly .step', offset: _isMobile ? 0.65 : 0.55 });
});

/* ─────────────────────────────────────────────
   MOBILE FIX: RESIZE OBSERVER
   Guarantees dots render even when #stadium's
   bounding rect is 0 at parse time on mobile.
   ───────────────────────────────────────────── */
(function setupStadiumResizeGuard() {
  if (!('ResizeObserver' in window)) return;
  let _lastW = 0, _lastH = 0, _reinitTimer = null;

  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width < 10 || height < 10) continue;
      if (Math.abs(width - _lastW) < 2 && Math.abs(height - _lastH) < 2) continue;
      _lastW = width; _lastH = height;

      clearTimeout(_reinitTimer);
      _reinitTimer = setTimeout(() => {
        initStadium();
        if (_lastRevealedIndex >= 0) {
          revealSeasonsUpTo(_lastRevealedIndex, { duration: 0, staggerDelay: 0 });
        }
        stadiumScroller.resize();
      }, 60);
    }
  });

  if (stadiumEl) ro.observe(stadiumEl);
})();

/* ─────────────────────────────────────────────
   MOBILE: IFRAME TOUCH GUARD
   ───────────────────────────────────────────── */
(function setupIframeTouchGuard() {
  const allIframes = document.querySelectorAll('.congestion-scrolly .chart-iframe');
  function applyPointerEvents() {
    if (!isMobile()) { allIframes.forEach(f => { f.style.pointerEvents = ''; }); return; }
    allIframes.forEach(f => { f.style.pointerEvents = f.classList.contains('active') ? 'auto' : 'none'; });
  }
  const observer = new MutationObserver(applyPointerEvents);
  allIframes.forEach(f => observer.observe(f, { attributes: true, attributeFilter: ['class'] }));
  window.addEventListener('resize', applyPointerEvents);
  applyPointerEvents();
})();

/* ─────────────────────────────────────────────
   MOBILE: STEP CARD ENTRANCE ANIMATION
   ───────────────────────────────────────────── */
(function setupStepCardFade() {
  if (!('IntersectionObserver' in window)) return;
  const cards = document.querySelectorAll('.step__card');
  cards.forEach(card => {
    card.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
    if (isMobile()) { card.style.opacity = '0'; card.style.transform = 'translateY(16px)'; }
  });
  const io = new IntersectionObserver(entries => {
    if (!isMobile()) {
      entries.forEach(e => { e.target.style.opacity = ''; e.target.style.transform = ''; });
      return;
    }
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  cards.forEach(card => io.observe(card));
  window.addEventListener('resize', () => {
    cards.forEach(card => { if (!isMobile()) { card.style.opacity = ''; card.style.transform = ''; } });
  });
})();

/* ─────────────────────────────────────────────
   MOBILE: HERO SCROLL-HINT AUTO-HIDE
   ───────────────────────────────────────────── */
(function setupScrollHintHide() {
  const hint = document.querySelector('.hero__scroll-hint');
  if (!hint) return;
  let hidden = false;
  function hideHint() {
    if (hidden || window.scrollY < 60) return;
    hidden = true;
    hint.style.transition    = 'opacity 0.5s ease';
    hint.style.opacity       = '0';
    hint.style.pointerEvents = 'none';
    window.removeEventListener('scroll', hideHint, { passive: true });
  }
  window.addEventListener('scroll', hideHint, { passive: true });
})();