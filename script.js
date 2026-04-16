/* =============================================
   FOOTBALL INJURY SCROLLYTELLING
   script.js — Rectangular Tier Edition
   =============================================

   Architecture:
   ─────────────
   1.  Constants & Config
   2.  Rectangular tier geometry — generateTierSeats()
       Grid-packed dots. Zero overlap guaranteed.
       Each tier is a flat trapezoid (wider at top,
       slightly narrower at bottom — stadium-rake look).
   3.  Data mapping — mapDataToDots()
   4.  Stadium SVG background — drawStadiumBackground()
   5.  D3 init & seat rendering
       – initStadium()
       – renderSeats()     keyed enter/update/exit
       – updateTierDots()
   6.  Narrative step handlers
   7.  Stadium Scrollama
   8.  Headline Evidence Scrollama
   9.  Congestion Chart Scrollama
   10. Learn More panel
   11. Resize handler

   Geometry guarantee:
   ───────────────────
   Dots are placed on a strict integer grid.
   Cell size = 2r + gap.  No two dots can share
   a cell, so overlap is structurally impossible.
   The grid is computed fresh from container
   dimensions on every init/resize.
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

const TIER_ORDER  = ['muscle', 'joint', 'ligament', 'tendon'];
const TIER_LABELS = {
  muscle:   'Muscle',
  joint:    'Joint & Cartilage',
  ligament: 'Ligament',
  tendon:   'Tendon',
};

const CFG = {
  /*
    GAP_FRAC: inter-dot gap as a fraction of dot diameter.
    0.30 means a 30% gap between dots.
  */
  GAP_FRAC: 0.30,

  /*
    TRAPEZOID_TAPER: how much narrower the bottom edge of each
    tier is relative to the full usable width, on each side.
    0.04 = bottom is 4% shorter per side = very mild rake.
  */
  TRAPEZOID_TAPER: 0.04,

  /*
    Vertical gap between the 4 tier bands, as fraction of
    each band's allocated height.
  */
  TIER_GAP_FRAC: 0.14,

  /* Padding inside each tier band */
  TIER_PAD_V: 0.08,   /* fraction of tier inner height */
  TIER_PAD_H: 0.035,  /* fraction of container width   */

  /* Dot radius bounds */
  DOT_R_MIN: 3.5,
  DOT_R_MAX: 7.0,

  /*
    DOT_R_FRAC: target radius relative to container width.
    ~0.0095 gives r ≈ 5.5 px at 580 px wide.
  */
  DOT_R_FRAC: 0.0095,
};

const SEAT_EMPTY_FILL = 'rgba(255,255,255,0.08)';

/* =============================================
   2. RECTANGULAR TIER GEOMETRY
   ─────────────────────────────────────────────

   generateTierSeats(tierIndex, W, H, capacity)
   ──────────────────────────────────────────────
   Returns seat objects: { id, tierIndex, seatIndex, x, y, r }

   Strategy
   ─────────
   1.  Container H is divided into 4 equal bands.
   2.  Each band gets inner padding and a per-row
       width that tapers slightly toward the bottom
       (trapezoid rake effect).
   3.  Dot radius r is derived from W, clamped.
   4.  Cell = 2r × (1 + GAP_FRAC).
       Columns = floor(row_width / cell)
       Rows    = floor(usable_height / cell)
       → zero overlap by construction.
   5.  Seats are ordered left→right, top→bottom.
       capacity trims the list from the end if the
       geometry would produce more seats than needed.
   ============================================= */

function generateTierSeats(tierIndex, W, H, capacity) {
  const r    = Math.max(CFG.DOT_R_MIN, Math.min(CFG.DOT_R_MAX, W * CFG.DOT_R_FRAC));
  const cell = r * 2 * (1 + CFG.GAP_FRAC);   /* centre-to-centre spacing */

  /* Band bounds */
  const bandH   = H / 4;
  const gapH    = bandH * CFG.TIER_GAP_FRAC;
  const bandTop = tierIndex * bandH + gapH * 0.5;
  const bandBot = bandTop + bandH - gapH;
  const innerH  = bandBot - bandTop;

  /* Vertical padding and usable height */
  const padV    = innerH * CFG.TIER_PAD_V;
  const usableH = innerH - padV * 2;
  const startY  = bandTop + padV + r;

  /* Number of dot rows */
  const nRows   = Math.max(1, Math.floor(usableH / cell));

  /* Horizontal usable width */
  const padH       = W * CFG.TIER_PAD_H;
  const maxUsableW = W - padH * 2;

  /*
    Trapezoid taper: top row is widest, bottom row narrowest.
    Each side tapers by (TRAPEZOID_TAPER * maxUsableW).
    Total width reduction at bottom = 2 × that.
  */
  const totalTaper = CFG.TRAPEZOID_TAPER * maxUsableW * 2;

  const seats = [];
  let seatIndex = 0;

  for (let row = 0; row < nRows; row++) {
    const cy = startY + row * cell;
    if (cy + r > bandBot) break;   /* don't overflow the band */

    /* Taper fraction: 0 at top, 1 at bottom */
    const taperFrac = nRows > 1 ? row / (nRows - 1) : 0;
    const rowShrink = totalTaper * taperFrac;
    const rowW      = maxUsableW - rowShrink;
    const rowLeft   = padH + rowShrink * 0.5;   /* keep row centred */

    /* Columns in this row */
    const nCols  = Math.max(1, Math.floor(rowW / cell));

    /* Centre the dot grid horizontally within the row */
    const gridW  = (nCols - 1) * cell;
    const startX = rowLeft + (rowW - gridW) * 0.5;

    for (let col = 0; col < nCols; col++) {
      seats.push({
        id:        `t${tierIndex}_s${seatIndex}`,
        tierIndex,
        seatIndex,
        x:         startX + col * cell,
        y:         cy,
        r,
      });
      seatIndex++;
    }
  }

  /* Trim to shared capacity (trims from the bottom-right) */
  if (capacity !== undefined && seats.length > capacity) {
    seats.length = capacity;
  }

  return seats;
}

/**
 * computeCapacity — count how many seats tier 0 can hold
 * (widest tier = largest capacity) then use that as the
 * shared scale for all 4 tiers so fills are comparable.
 */
function computeCapacity(W, H) {
  return generateTierSeats(0, W, H).length;
}

/* =============================================
   3. DATA MAPPING
   ─────────────────────────────────────────────
   1 dot = 10 injury days.
   Counts passed in are already in dot units
   (the HTML data attributes store dot counts).
   Each tier is clamped to its available seats.
   ============================================= */

function mapDataToDots(counts, allSeats, capacity) {
  const dotCounts = {
    muscle:   Math.min(Math.round((counts.muscle   || 0) / 50), capacity),
    joint:    Math.min(Math.round((counts.joint    || 0) / 50), capacity),
    ligament: Math.min(Math.round((counts.ligament || 0) / 50), capacity),
    tendon:   Math.min(Math.round((counts.tendon   || 0) / 50), capacity),
  };

  const fillMap = new Map();
  allSeats.forEach(seat => {
    const cat    = TIER_ORDER[seat.tierIndex];
    const active = seat.seatIndex < dotCounts[cat];
    fillMap.set(seat.id, {
      fill:   active ? INJURY_COLORS[cat] : SEAT_EMPTY_FILL,
      active,
    });
  });
  return fillMap;
}

/* =============================================
   4. STADIUM SVG BACKGROUND
   ─────────────────────────────────────────────
   Flat trapezoidal backdrops matching the dot
   geometry exactly, plus roof, hoarding, glows.
   ============================================= */

function drawStadiumBackground(svgSel, W, H) {
  svgSel.select('g.bg-layer').remove();
  const bg = svgSel.insert('g', ':first-child').attr('class', 'bg-layer');

  let defs = svgSel.select('defs');
  if (defs.empty()) defs = svgSel.insert('defs', ':first-child');

  /* helpers */
  function linearGrad(id, fn) {
    defs.select('#'+id).remove();
    fn(defs.append('linearGradient').attr('id', id));
  }
  function radialGrad(id, attrs, stops) {
    defs.select('#'+id).remove();
    const g = defs.append('radialGradient').attr('id', id);
    Object.entries(attrs).forEach(([k,v]) => g.attr(k,v));
    stops.forEach(([off,col,op]) =>
      g.append('stop').attr('offset',off).style('stop-color',col).style('stop-opacity',op));
  }

  linearGrad('bg-sky', g => {
    g.attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',1);
    g.append('stop').attr('offset','0%').style('stop-color','#04060f').style('stop-opacity',1);
    g.append('stop').attr('offset','100%').style('stop-color','#090d1c').style('stop-opacity',1);
  });
  radialGrad('bg-vig', {cx:'50%',cy:'40%',r:'72%',gradientUnits:'objectBoundingBox'}, [
    ['0%',  'transparent', 0], ['100%','#000',0.65]]);
  radialGrad('bg-glowL', {cx:'2%', cy:'4%',r:'55%',gradientUnits:'objectBoundingBox'}, [
    ['0%','#b8d8ff',0.11], ['100%','#090d1c',0]]);
  radialGrad('bg-glowR', {cx:'98%',cy:'4%',r:'55%',gradientUnits:'objectBoundingBox'}, [
    ['0%','#b8d8ff',0.11], ['100%','#090d1c',0]]);

  /* Sky */
  bg.append('rect').attr('width',W).attr('height',H).attr('fill','url(#bg-sky)');

  /* ---- Tier backgrounds ---- */
  const r    = Math.max(CFG.DOT_R_MIN, Math.min(CFG.DOT_R_MAX, W * CFG.DOT_R_FRAC));
  const cell = r * 2 * (1 + CFG.GAP_FRAC);
  const padH = W * CFG.TIER_PAD_H;

  TIER_ORDER.forEach((cat, ti) => {
    const bandH      = H / 4;
    const gapH       = bandH * CFG.TIER_GAP_FRAC;
    const bandTop    = ti * bandH + gapH * 0.5;
    const bandBot    = bandTop + bandH - gapH;
    const innerH     = bandBot - bandTop;
    const padV       = innerH * CFG.TIER_PAD_V;
    const usableH    = innerH - padV * 2;
    const startY     = bandTop + padV + r;
    const nRows      = Math.max(1, Math.floor(usableH / cell));
    const maxUsableW = W - padH * 2;
    const totalTaper = CFG.TRAPEZOID_TAPER * maxUsableW * 2;

    /* Filled background of the whole tier band */
    const topX  = padH;
    const topW  = maxUsableW;
    const botX  = padH + totalTaper * 0.5;
    const botW  = maxUsableW - totalTaper;

    const trapPath = [
      `M ${topX} ${bandTop}`,
      `L ${topX + topW} ${bandTop}`,
      `L ${botX + botW} ${bandBot}`,
      `L ${botX} ${bandBot}`,
      'Z',
    ].join(' ');

    bg.append('path')
      .attr('d', trapPath)
      .attr('fill', 'rgba(14,20,38,0.88)')
      .attr('stroke', 'rgba(255,255,255,0.045)')
      .attr('stroke-width', 1);

    /* Row-step divider lines — one per dot row */
    for (let row = 0; row <= nRows; row++) {
      const lineY    = startY + row * cell - cell * 0.5;
      if (lineY < bandTop - 1 || lineY > bandBot + 1) continue;
      const rowFrac  = nRows > 1 ? row / nRows : 0;
      const shrink   = totalTaper * rowFrac;
      const lx       = padH + shrink * 0.5;
      const rx       = lx + (maxUsableW - shrink);
      bg.append('line')
        .attr('x1', lx).attr('y1', lineY)
        .attr('x2', rx).attr('y2', lineY)
        .attr('stroke', 'rgba(255,255,255,0.05)')
        .attr('stroke-width', 0.8);
    }

    /* Outline border */
    bg.append('path')
      .attr('d', trapPath)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.10)')
      .attr('stroke-width', 1);
  });

  /* ---- Roof canopy ---- */
  const roofH = Math.round(H * 0.046);
  bg.append('rect').attr('width',W).attr('height',roofH).attr('fill','#07091a');
  bg.append('line').attr('x1',0).attr('y1',roofH).attr('x2',W).attr('y2',roofH)
    .attr('stroke','rgba(255,255,255,0.17)').attr('stroke-width',1.5);
  for (let i = 0; i <= 9; i++) {
    const sx = Math.round((i / 9) * W);
    bg.append('line').attr('x1',sx).attr('y1',roofH)
      .attr('x2',sx).attr('y2',roofH + Math.round(H * 0.038))
      .attr('stroke','rgba(255,255,255,0.07)').attr('stroke-width',1.1);
  }

  /* ---- Hoarding ---- */
  const hoardY = H * 0.955;
  bg.append('rect')
    .attr('x', W*0.04).attr('y', hoardY)
    .attr('width', W*0.92).attr('height', H*0.027)
    .attr('rx', 1).attr('fill','#c8f05c').attr('opacity',0.65);

  /* Glows & vignette */
  bg.append('rect').attr('width',W).attr('height',H).attr('fill','url(#bg-glowL)');
  bg.append('rect').attr('width',W).attr('height',H).attr('fill','url(#bg-glowR)');
  bg.append('rect').attr('width',W).attr('height',H).attr('fill','url(#bg-vig)');
}

/* =============================================
   5. D3 INIT & SEAT RENDERING
   ============================================= */

const stadiumEl     = document.getElementById('stadium');
const introImgEl    = document.getElementById('intro-image');
const legendEl      = document.getElementById('injuryLegend');
const seasonLabelEl = document.getElementById('seasonLabel');

let W = 0, H = 0, tierCapacity = 0;
let allSeats = [];

const svg         = d3.select('#stadium').append('svg').attr('width','100%').attr('height','100%');
const dotsLayer   = svg.append('g').attr('class','dots-layer');
const labelsLayer = svg.append('g').attr('class','tier-labels-layer');

function initStadium() {
  const rect = stadiumEl.getBoundingClientRect();
  W = rect.width  || 560;
  H = rect.height || 420;

  tierCapacity = computeCapacity(W, H);

  allSeats = [];
  TIER_ORDER.forEach((_, ti) => {
    allSeats = allSeats.concat(generateTierSeats(ti, W, H, tierCapacity));
  });

  drawStadiumBackground(svg, W, H);
  buildTierLabels();

  /* Paint all seats empty instantly (no animation on first draw) */
  renderSeats(allSeats, new Map(), { duration: 0, staggerDelay: 0 });
}

/* ---- Tier labels ---- */
function buildTierLabels() {
  labelsLayer.selectAll('.tier-label-g').remove();

  TIER_ORDER.forEach((cat, ti) => {
    const bandH   = H / 4;
    const gapH    = bandH * CFG.TIER_GAP_FRAC;
    const bandTop = ti * bandH + gapH * 0.5;
    const bandBot = bandTop + bandH - gapH;
    const midY    = (bandTop + bandBot) / 2;
    const padH    = W * CFG.TIER_PAD_H;

    /* Label sits outside the left padding margin */
    const labelX  = Math.max(2, padH - 2);
    const fontSize = Math.max(8, Math.min(11, W / 54));

    const g = labelsLayer.append('g')
      .attr('class', 'tier-label-g')
      .attr('data-tier', cat)
      .style('opacity', 0);

    /* Colour swatch bar */
    g.append('rect')
      .attr('x', labelX).attr('y', midY - 5)
      .attr('width', 3).attr('height', 10)
      .attr('rx', 1.5)
      .attr('fill', INJURY_COLORS[cat]);

    /* Label text */
    g.append('text')
      .attr('class', 'tier-label-text')
      .attr('x', labelX + 7)
      .attr('y', midY)
      .attr('dominant-baseline', 'middle')
      .attr('fill', INJURY_COLORS[cat])
      .attr('font-family', '"DM Mono", monospace')
      .attr('font-size', fontSize)
      .attr('letter-spacing', '0.07em')
      .text(TIER_LABELS[cat].toUpperCase());
  });
}

function setTierLabelsVisible(visible) {
  labelsLayer.selectAll('.tier-label-g')
    .transition().duration(300)
    .delay((d, i) => i * 65)
    .style('opacity', visible ? 1 : 0);
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

/* ---- renderSeats — keyed enter/update/exit ---- */
function renderSeats(seats, fillMap, opts = {}) {
  const {
    staggerDelay   = 0.4,
    duration       = 400,
    enterFromAbove = true,
  } = opts;

  const join = dotsLayer.selectAll('circle.seat-dot')
    .data(seats, d => d.id);

  /* ENTER */
  const entering = join.enter()
    .append('circle')
    .attr('class', 'seat-dot')
    .attr('cx', d => d.x)
    .attr('cy', d => {
      if (duration === 0) return d.y;
      return enterFromAbove ? d.y - 10 : d.y + 10;
    })
    .attr('r',  d => duration === 0 ? d.r : d.r * 0.3)
    .attr('fill', SEAT_EMPTY_FILL)
    .attr('opacity', duration === 0 ? 1 : 0);

  if (duration > 0) {
    entering.transition()
      .duration(duration)
      .delay((d, i) => i * staggerDelay)
      .ease(d3.easeCubicOut)
      .attr('cy', d => d.y)
      .attr('r',  d => d.r)
      .attr('opacity', 1)
      .attr('fill', d => {
        const s = fillMap.get(d.id);
        return s ? s.fill : SEAT_EMPTY_FILL;
      });
  } else {
    entering.attr('fill', d => {
      const s = fillMap.get(d.id);
      return s ? s.fill : SEAT_EMPTY_FILL;
    });
  }

  /* UPDATE */
  join.transition()
    .duration(duration || 1)
    .delay((d, i) => i * staggerDelay)
    .ease(d3.easeCubicInOut)
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('r',  d => d.r)
    .attr('opacity', 1)
    .attr('fill', d => {
      const s = fillMap.get(d.id);
      return s ? s.fill : SEAT_EMPTY_FILL;
    });

  /* EXIT */
  join.exit()
    .transition().duration(150)
    .attr('r', 0).attr('opacity', 0)
    .remove();
}

function updateTierDots(counts, opts = {}) {
  const fillMap = mapDataToDots(counts, allSeats, tierCapacity);
  renderSeats(allSeats, fillMap, opts);
}

/* =============================================
   6. NARRATIVE STEP HANDLERS
   ============================================= */

function handleStep(element) {
  const step     = element.dataset.step;
  const muscle   = parseInt(element.dataset.muscle,   10) || 0;
  const joint    = parseInt(element.dataset.joint,    10) || 0;
  const ligament = parseInt(element.dataset.ligament, 10) || 0;
  const tendon   = parseInt(element.dataset.tendon,   10) || 0;
  const season   = element.dataset.season || null;

  switch (step) {

    case 'intro':
      introImgEl.classList.add('active');
      stadiumEl.classList.remove('active');
      legendEl.classList.remove('active');
      setSeasonLabel(null);
      setTierLabelsVisible(false);
      break;

    case 'empty':
      introImgEl.classList.remove('active');
      stadiumEl.classList.add('active');
      legendEl.classList.remove('active');
      setSeasonLabel(null);
      setTierLabelsVisible(false);
      updateTierDots({ muscle:0, joint:0, ligament:0, tendon:0 }, {
        staggerDelay: 0.35, duration: 550,
      });
      break;

    case 'label-tiers':
      introImgEl.classList.remove('active');
      stadiumEl.classList.add('active');
      legendEl.classList.add('active');
      setSeasonLabel(null);
      setTierLabelsVisible(true);
      updateTierDots({ muscle:0, joint:0, ligament:0, tendon:0 }, {
        staggerDelay: 0, duration: 200,
      });
      break;

    case 'fill-muscle':
      setTierLabelsVisible(true);
      legendEl.classList.add('active');
      setSeasonLabel(season);
      updateTierDots({ muscle, joint:0, ligament:0, tendon:0 }, {
        staggerDelay: 0.55, duration: 440,
      });
      break;

    case 'fill-joint':
      setTierLabelsVisible(true);
      legendEl.classList.add('active');
      setSeasonLabel(season);
      updateTierDots({ muscle, joint, ligament:0, tendon:0 }, {
        staggerDelay: 0.45, duration: 400,
      });
      break;

    case 'fill-ligament':
      setTierLabelsVisible(true);
      legendEl.classList.add('active');
      setSeasonLabel(season);
      updateTierDots({ muscle, joint, ligament, tendon:0 }, {
        staggerDelay: 0.45, duration: 400,
      });
      break;

    case 'fill-all':
      setTierLabelsVisible(true);
      legendEl.classList.add('active');
      setSeasonLabel(season);
      updateTierDots({ muscle, joint, ligament, tendon }, {
        staggerDelay: 0.40, duration: 380,
      });
      break;

    case 'season':
      setTierLabelsVisible(true);
      legendEl.classList.add('active');
      setSeasonLabel(season);
      colorInjuryText(element);
      updateTierDots({ muscle, joint, ligament, tendon }, {
        staggerDelay: 0.25, duration: 480, enterFromAbove: false,
      });
      break;
  }
}

/* =============================================
   7. STADIUM SCROLLAMA
   ============================================= */

requestAnimationFrame(() => { initStadium(); });

const stadiumScroller = scrollama();
stadiumScroller.setup({
  step:   '#stadiumScrolly .step',
  offset: 0.5,
  debug:  false,
})
.onStepEnter(({ element }) => { handleStep(element); })
.onStepExit(({ element, direction }) => {
  if (direction === 'up') resetInjuryText(element);
});

/* =============================================
   8. HEADLINE EVIDENCE SCROLLAMA
   ============================================= */

const headlineCards    = Array.from(document.querySelectorAll('.headline-card'));
const headlineScroller = scrollama();

headlineScroller.setup({
  step: '.headline-step', offset: 0.55, debug: false, progress: false,
})
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
congestionScroller.setup({
  step: '.congestion-scrolly .step', offset: 0.55, debug: false,
})
.onStepEnter(({ element }) => {
  const n = element.dataset.chart;
  document.querySelectorAll('.congestion-scrolly iframe')
    .forEach(f => f.classList.remove('active'));
  const t = document.getElementById('chart' + n);
  if (t) t.classList.add('active');
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
   11. RESIZE — debounced
   ============================================= */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    initStadium();
    stadiumScroller.resize();
    headlineScroller.resize();
    congestionScroller.resize();
  }, 220);
});