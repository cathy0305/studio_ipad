import { FEATURES, CALIBRATION_MS, THRESHOLDS } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SENTENCE = "Hold the iPad level to keep the walker safe. But what if you didn't. ";
const FILL_SIZE   = 11;
const FILL_LINE_H = 13;
const FILL_CHAR_W = 6.6;

// ── figure geometry (px, ground = 0, up = negative y) ────────
const G = {
  HIP_Y: -120,

  THIGH_LEN: 68, THIGH_W: 20,
  CALF_LEN:  58, CALF_W:  14,

  SHOULDER_X: 8,  SHOULDER_Y: -196,
  UPPER_ARM_LEN: 50, UPPER_ARM_W: 14,
  FOREARM_LEN:   42, FOREARM_W:   10,

  TORSO_TOP_Y: -196, TORSO_BOT_Y: -106,
  TORSO_TOP_W: 44, TORSO_WAIST_W: 28, TORSO_BOT_W: 40,

  HEAD_CX: 6, HEAD_CY: -230, HEAD_RX: 22, HEAD_RY: 28,
};

// ── walk params ───────────────────────────────────────────────
const CADENCE     = 0.0022;
const WALK_SPEED  = 0.45;
const GROUND_Y    = 0.70;
const WALK_MARGIN = 200;

// ── body state machine ───────────────────────────────────────
const BODY = {
  UPRIGHT:  'upright',   // walking normally; subtle tilt visible
  TILTING:  'tilting',   // visibly tilted with iPad
  FALLING:  'falling',   // toppling toward ground (animated)
  DOWN:     'down',      // lying on ground, waiting
  RISING:   'rising',    // animating back to standing
};
const FALL_DURATION_MS  = 700;
const DOWN_DURATION_MS  = 1800;
const RISE_DURATION_MS  = 900;

let bodyState   = BODY.UPRIGHT;
let bodyStateMs = 0;
let fallDir     = 1;     // +1 right, -1 left
let visualTilt  = 0;     // smoothed tilt applied to figure
let visualTiltTarget = 0;

// ── journey state machine ────────────────────────────────────
const PHASE = {
  WALKING:  'walking',   // walking toward target
  ARRIVED:  'arrived',   // reached target; trail showing
};
let phase = PHASE.WALKING;

// ── DOM ──────────────────────────────────────────────────────
const stage = document.getElementById('stage');
const intro = document.getElementById('intro');
const overlay = document.getElementById('overlay');
const trailSvg = document.getElementById('trailSvg');
const restartBtn = document.getElementById('restartBtn');
const stopBtn = document.getElementById('stopBtn');
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

let viewportW = 0, viewportH = 0;
let targetX = 0;

function resize() {
  viewportW = window.innerWidth;
  viewportH = window.innerHeight;
  stage.setAttribute('viewBox', `0 0 ${viewportW} ${viewportH}`);
  stage.setAttribute('width',  viewportW);
  stage.setAttribute('height', viewportH);
  targetX = viewportW - 110;
  if (targetGroup) positionTarget();
}

// ── SVG helpers ──────────────────────────────────────────────
function svgEl(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

function setRot(el, deg) {
  el.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
}

// ── orientation ──────────────────────────────────────────────
let currentRoll = 0, currentPitch = 0, hasOrientationData = false;
const calibration = { roll: 0, pitch: 0, done: !FEATURES.CALIBRATE_ON_START };
let calibrationStart = null;
const calibrationSamples = [];

function onOrientation(event) {
  const rawRoll  = event.gamma ?? 0;
  const rawPitch = event.beta  ?? 0;
  hasOrientationData = true;
  if (FEATURES.CALIBRATE_ON_START && !calibration.done) {
    if (calibrationStart === null) calibrationStart = performance.now();
    calibrationSamples.push({ r: rawRoll, p: rawPitch });
    if (performance.now() - calibrationStart >= CALIBRATION_MS) {
      const n = calibrationSamples.length;
      calibration.roll  = calibrationSamples.reduce((s, v) => s + v.r, 0) / n;
      calibration.pitch = calibrationSamples.reduce((s, v) => s + v.p, 0) / n;
      calibration.done  = true;
    }
  }
  currentRoll  = rawRoll  - calibration.roll;
  currentPitch = rawPitch - calibration.pitch;
}

function getTilt() {
  return Math.sqrt(currentRoll ** 2 + currentPitch ** 2);
}

// ── text fill ────────────────────────────────────────────────
let sentenceCursor = 0;

function makeTextFill(clipId, x, y, w, h) {
  const g = svgEl('g', { 'clip-path': `url(#${clipId})` });
  const numLines    = Math.ceil(h / FILL_LINE_H) + 1;
  const charsPerRow = Math.ceil(w / FILL_CHAR_W) + 2;
  const quad = SENTENCE.repeat(4);

  for (let i = 0; i < numLines; i++) {
    const lineY  = y + FILL_LINE_H * (i + 1);
    const offset = (sentenceCursor + i * 7) % SENTENCE.length;
    const text   = quad.slice(offset, offset + charsPerRow);
    svgEl('text', { x, y: lineY }, g).textContent = text;
  }
  sentenceCursor = (sentenceCursor + charsPerRow) % SENTENCE.length;
  return g;
}

// ── figure construction ──────────────────────────────────────
const defs = svgEl('defs', {}, stage);
let gFig, gBob;
let targetGroup = null;
const jt = {};

function addClip(id, tag, attrs) {
  svgEl(tag, attrs, svgEl('clipPath', { id }, defs));
}

function makeLeg(side) {
  const tw = G.THIGH_W, tl = G.THIGH_LEN;
  const cw = G.CALF_W,  cl = G.CALF_LEN;

  addClip(`cp-thigh-${side}`, 'rect', { x: -tw/2, y: 0, width: tw, height: tl, rx: tw/2 });
  addClip(`cp-calf-${side}`,  'rect', { x: -cw/2, y: 0, width: cw, height: cl, rx: cw/2 });

  const gHip   = svgEl('g', { transform: `translate(0,${G.HIP_Y})` });
  const gThigh = svgEl('g', {}, gHip);
  gThigh.appendChild(makeTextFill(`cp-thigh-${side}`, -tw/2, 0, tw, tl));

  const gKnee = svgEl('g', { transform: `translate(0,${tl})` }, gThigh);
  const gCalf  = svgEl('g', {}, gKnee);
  gCalf.appendChild(makeTextFill(`cp-calf-${side}`, -cw/2, 0, cw, cl));

  jt[`thigh${side}`] = gThigh;
  jt[`calf${side}`]  = gCalf;
  return gHip;
}

function makeArm(side) {
  const uw = G.UPPER_ARM_W, ul = G.UPPER_ARM_LEN;
  const fw = G.FOREARM_W,   fl = G.FOREARM_LEN;

  addClip(`cp-ua-${side}`, 'rect', { x: -uw/2, y: 0, width: uw, height: ul, rx: uw/2 });
  addClip(`cp-fa-${side}`, 'rect', { x: -fw/2, y: 0, width: fw, height: fl, rx: fw/2 });

  const gShoulder = svgEl('g', { transform: `translate(${G.SHOULDER_X},${G.SHOULDER_Y})` });
  const gUA       = svgEl('g', {}, gShoulder);
  gUA.appendChild(makeTextFill(`cp-ua-${side}`, -uw/2, 0, uw, ul));

  const gElbow = svgEl('g', { transform: `translate(0,${ul})` }, gUA);
  const gFA    = svgEl('g', {}, gElbow);
  gFA.appendChild(makeTextFill(`cp-fa-${side}`, -fw/2, 0, fw, fl));

  jt[`ua${side}`] = gUA;
  jt[`fa${side}`] = gFA;
  return gShoulder;
}

function makeTorso() {
  const { TORSO_TOP_Y: ty, TORSO_BOT_Y: by,
          TORSO_TOP_W: tw, TORSO_WAIST_W: mw, TORSO_BOT_W: bw } = G;
  const midY = ty + (by - ty) * 0.42;
  const d = `M${-tw/2} ${ty} L${tw/2} ${ty} L${mw/2} ${midY} `
          + `L${bw/2} ${by} L${-bw/2} ${by} L${-mw/2} ${midY} Z`;
  svgEl('path', { d }, svgEl('clipPath', { id: 'cp-torso' }, defs));
  return makeTextFill('cp-torso', -tw/2, ty, tw, by - ty);
}

function makeHead() {
  const { HEAD_CX: cx, HEAD_CY: cy, HEAD_RX: rx, HEAD_RY: ry } = G;
  svgEl('ellipse', { cx, cy, rx, ry }, svgEl('clipPath', { id: 'cp-head' }, defs));
  return makeTextFill('cp-head', cx - rx, cy - ry, rx * 2, ry * 2);
}

// ── target marker (Magic Circle) ─────────────────────────────
function buildTarget() {
  targetGroup = svgEl('g', { id: 'target', opacity: '0.55' }, stage);
  // Vertical pole + small flag
  svgEl('line', { x1: 0, y1: 0, x2: 0, y2: -90, stroke: '#fff', 'stroke-width': 1.5 }, targetGroup);
  svgEl('polygon', { points: '0,-90 38,-78 0,-66', fill: '#fff' }, targetGroup);
  // Ground tick
  svgEl('line', { x1: -16, y1: 0, x2: 16, y2: 0, stroke: '#fff', 'stroke-width': 1.5 }, targetGroup);
  // Subtle pulsing label
  const label = svgEl('text', {
    x: 0, y: -110, 'text-anchor': 'middle', 'font-size': 11, fill: '#fff', opacity: 0.7,
  }, targetGroup);
  label.textContent = 'here';
  positionTarget();
}

function positionTarget() {
  const gy = viewportH * GROUND_Y;
  targetGroup.setAttribute('transform', `translate(${targetX},${gy})`);
}

// ── figure assembly ──────────────────────────────────────────
function buildFigure() {
  gFig = svgEl('g', {}, stage);
  gBob = svgEl('g', {}, gFig);

  // Draw order: back leg → back arm → torso → head → front arm → front leg
  gBob.appendChild(makeLeg('b'));
  gBob.appendChild(makeArm('b'));
  gBob.appendChild(makeTorso());
  gBob.appendChild(makeHead());
  gBob.appendChild(makeArm('a'));
  gBob.appendChild(makeLeg('a'));

  // Speech bubble: above head, moves with figure (inside gFig, not gBob)
  const aboveHead = G.HEAD_CY - G.HEAD_RY - 14;
  speechEl = svgEl('text', {
    x: G.HEAD_CX, y: aboveHead,
    'text-anchor': 'middle',
    'font-size': 13,
    opacity: 0,
  }, gFig);
}

// ── walk math ────────────────────────────────────────────────
function updateJoints(phase) {
  const s   = Math.sin(phase);
  const bob = 4 * (1 - Math.cos(2 * phase)) / 2;

  setRot(jt.thigha, -26 * s);
  setRot(jt.thighb,  26 * s);
  setRot(jt.calfa,  22 * Math.max(0,  s));
  setRot(jt.calfb,  22 * Math.max(0, -s));
  setRot(jt.uaa,  18 * s);
  setRot(jt.uab, -18 * s);
  setRot(jt.faa, 12);
  setRot(jt.fab, 12);

  gBob.setAttribute('transform', `translate(0,${(-bob).toFixed(2)})`);
}

function setJointsCollapsed(p) {
  // p: 0→1 transition from walking pose to collapsed pose
  // Collapsed pose: knees bent, arms loose, body folded
  const lerp = (a, b) => a + (b - a) * p;
  setRot(jt.thigha,  lerp(0, -45));
  setRot(jt.thighb,  lerp(0,  45));
  setRot(jt.calfa,   lerp(0,  60));
  setRot(jt.calfb,   lerp(0,  60));
  setRot(jt.uaa,     lerp(0, -55));
  setRot(jt.uab,     lerp(0,  55));
  setRot(jt.faa,     lerp(12, 30));
  setRot(jt.fab,     lerp(12, 30));
  gBob.setAttribute('transform', `translate(0,0)`);
}

// ── speech system ────────────────────────────────────────────
const LINES = {
  WALKING:  ['La la la~', 'Nice day', 'Just walking', 'Hmm hmm~', 'La di da~'],
  WOBBLING: ['Whoa!', 'Hey hey!', 'Wait!', 'Easy!', 'Hold on!'],
  FALLING:  ['Ouch', 'Owww', 'Why?', 'Come on...', 'Oof'],
  RISING:   ['Okay, again', 'Try again', 'Here we go', 'One more time'],
  STABLE:   ['Steady hands!', 'Wow, calm', 'So smooth', 'Nice', 'Perfect~'],
  ARRIVED:  ['Thanks!', 'We made it!', 'Yay :)', 'Thank you!'],
  ASIDE:    ['You okay?', 'Are you nervous?', 'Coffee?'],
};

const FADE_MS = 350;
const SHOW_MS = 2000;

let speechState   = 'WALKING';
const bubble   = { text: '', alpha: 0, phase: 'hidden', showTimer: 0 };
let nextSpeechMs = 3000 + Math.random() * 2000;
let asideMs      = 30000 + Math.random() * 20000;
let speechEl     = null;

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function showBubble(text) {
  bubble.text      = text;
  bubble.alpha     = 0;
  bubble.phase     = 'in';
  bubble.showTimer = SHOW_MS;
  if (speechEl) speechEl.textContent = `"${text}"`;
}

function tickBubble(dt) {
  if (bubble.phase === 'in') {
    bubble.alpha = Math.min(1, bubble.alpha + dt / FADE_MS);
    if (bubble.alpha >= 1) bubble.phase = 'show';
  } else if (bubble.phase === 'show') {
    bubble.showTimer -= dt;
    if (bubble.showTimer <= 0) bubble.phase = 'out';
  } else if (bubble.phase === 'out') {
    bubble.alpha = Math.max(0, bubble.alpha - dt / FADE_MS);
    if (bubble.alpha <= 0) { bubble.phase = 'hidden'; bubble.text = ''; }
  }
  if (speechEl) speechEl.setAttribute('opacity', bubble.alpha.toFixed(3));
}

function deriveSpeechCategory() {
  if (bodyState === BODY.DOWN || bodyState === BODY.FALLING) return 'FALLING';
  if (bodyState === BODY.RISING) return 'RISING';
  if (bodyState === BODY.TILTING) return 'WOBBLING';
  const tilt = getTilt();
  if (hasOrientationData && tilt < 3) return 'STABLE';
  return 'WALKING';
}

function tickSpeech(dt) {
  const cat = deriveSpeechCategory();

  if (cat !== speechState) {
    speechState = cat;
    showBubble(pickRandom(LINES[cat]));
    nextSpeechMs = 4000 + Math.random() * 3000;
  }

  tickBubble(dt);

  if (bubble.phase === 'hidden' && bodyState !== BODY.FALLING && bodyState !== BODY.DOWN) {
    nextSpeechMs -= dt;
    if (nextSpeechMs <= 0) {
      showBubble(pickRandom(LINES[speechState] ?? LINES.WALKING));
      nextSpeechMs = 4000 + Math.random() * 4000;
    }
  }

  asideMs -= dt;
  if (asideMs <= 0) {
    if (bodyState === BODY.UPRIGHT && bubble.phase === 'hidden')
      showBubble(pickRandom(LINES.ASIDE));
    asideMs = 30000 + Math.random() * 20000;
  }
}

// ── trail (round logger) ─────────────────────────────────────
let trail = [];           // { t, r, p }
let trailStartMs = null;

function resetTrail() {
  trail = [];
  trailStartMs = null;
}

function sampleTrail(now) {
  if (!hasOrientationData) return;
  if (trailStartMs === null) trailStartMs = now;
  // Sample at ~30fps; cap to keep render light
  if (trail.length === 0 || now - trail[trail.length - 1].t > 33) {
    trail.push({ t: now - trailStartMs, r: currentRoll, p: currentPitch });
    if (trail.length > 600) trail.shift();
  }
}

function renderTrail() {
  // Clear previous
  while (trailSvg.firstChild) trailSvg.removeChild(trailSvg.firstChild);

  const W = 300, H = 90, PAD = 8;
  trailSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Axis line (zero)
  const ax = document.createElementNS(SVG_NS, 'line');
  ax.setAttribute('x1', PAD); ax.setAttribute('y1', H / 2);
  ax.setAttribute('x2', W - PAD); ax.setAttribute('y2', H / 2);
  ax.setAttribute('stroke', '#fff'); ax.setAttribute('stroke-opacity', '0.25');
  ax.setAttribute('stroke-dasharray', '2 3');
  trailSvg.appendChild(ax);

  if (trail.length < 2) {
    const txt = document.createElementNS(SVG_NS, 'text');
    txt.setAttribute('x', W / 2); txt.setAttribute('y', H / 2 + 4);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('fill', '#fff'); txt.setAttribute('font-size', '11');
    txt.setAttribute('opacity', '0.5');
    txt.textContent = 'no tilt data';
    trailSvg.appendChild(txt);
    return;
  }

  const tMax = trail[trail.length - 1].t || 1;
  // Track actual peak (for label) and axis scale (with min 12° floor for readability)
  let actualPeak = 0;
  for (const s of trail) {
    actualPeak = Math.max(actualPeak, Math.abs(s.r), Math.abs(s.p));
  }
  const mag = Math.min(Math.max(actualPeak, 12), 60);

  const x = (t) => PAD + (t / tMax) * (W - 2 * PAD);
  const y = (v) => H / 2 - (v / mag) * (H / 2 - PAD);

  // roll line (white, strong)
  const rollPath = trail.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)} ${y(s.r).toFixed(1)}`).join(' ');
  const rp = document.createElementNS(SVG_NS, 'path');
  rp.setAttribute('d', rollPath); rp.setAttribute('fill', 'none');
  rp.setAttribute('stroke', '#fff'); rp.setAttribute('stroke-width', '1.2');
  trailSvg.appendChild(rp);

  // pitch line (white dashed, weaker)
  const pitchPath = trail.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)} ${y(s.p).toFixed(1)}`).join(' ');
  const pp = document.createElementNS(SVG_NS, 'path');
  pp.setAttribute('d', pitchPath); pp.setAttribute('fill', 'none');
  pp.setAttribute('stroke', '#fff'); pp.setAttribute('stroke-width', '1');
  pp.setAttribute('stroke-dasharray', '2 3');
  pp.setAttribute('stroke-opacity', '0.55');
  trailSvg.appendChild(pp);

  // Stats text — show actual peak, not axis scale
  const dur = (tMax / 1000).toFixed(1);
  const peak = actualPeak.toFixed(0);
  const stat = document.createElementNS(SVG_NS, 'text');
  stat.setAttribute('x', PAD); stat.setAttribute('y', H - 4);
  stat.setAttribute('fill', '#fff'); stat.setAttribute('font-size', '9');
  stat.setAttribute('opacity', '0.55');
  stat.textContent = `${dur}s · peak ±${peak}°`;
  trailSvg.appendChild(stat);
}

// ── round / phase transitions ────────────────────────────────
function startFalling() {
  bodyState = BODY.FALLING;
  bodyStateMs = 0;
  fallDir = currentRoll >= 0 ? 1 : -1;
  speechState = 'FALLING';
  showBubble(pickRandom(LINES.FALLING));
  nextSpeechMs = 3500;
}

function enterArrived() {
  phase = PHASE.ARRIVED;
  bodyState = BODY.UPRIGHT;
  speechState = 'ARRIVED';
  showBubble(pickRandom(LINES.ARRIVED));
  renderTrail();
  // Brief delay so the user sees the figure standing at the goal before overlay
  setTimeout(() => overlay.classList.add('visible'), 650);
}

function restartRound() {
  overlay.classList.remove('visible');
  resetTrail();
  bodyState = BODY.UPRIGHT;
  bodyStateMs = 0;
  walkerX = -WALK_MARGIN;
  walkPhase = 0;
  visualTilt = 0;
  visualTiltTarget = 0;
  speechState = 'WALKING';
  bubble.alpha = 0; bubble.phase = 'hidden'; bubble.text = '';
  if (speechEl) speechEl.setAttribute('opacity', '0');
  nextSpeechMs = 3000 + Math.random() * 2000;
  asideMs = 30000 + Math.random() * 20000;
  phase = PHASE.WALKING;
}

function stopSession() {
  // Reset to intro screen
  overlay.classList.remove('visible');
  intro.style.display = '';
  intro.classList.remove('hidden');
  resetTrail();
  bodyState = BODY.UPRIGHT;
  walkerX = -WALK_MARGIN;
  walkPhase = 0;
  phase = PHASE.WALKING;
}

// ── main loop ────────────────────────────────────────────────
let walkerX   = null;
let walkPhase = 0;
let lastMs    = null;

function easeOut(t) { return 1 - Math.pow(1 - t, 2); }
function easeIn(t)  { return t * t; }

function loop(now) {
  const dt = lastMs === null ? 16.67 : Math.min(now - lastMs, 64);
  lastMs = now;

  // ── Update body state machine ──
  bodyStateMs += dt;
  const tilt = getTilt();

  if (phase === PHASE.WALKING) {
    if (bodyState === BODY.UPRIGHT) {
      if (hasOrientationData && tilt > THRESHOLDS.FALLING) startFalling();
      else if (hasOrientationData && tilt > THRESHOLDS.TILTING) {
        bodyState = BODY.TILTING; bodyStateMs = 0;
      }
    } else if (bodyState === BODY.TILTING) {
      if (tilt > THRESHOLDS.FALLING) startFalling();
      else if (tilt < THRESHOLDS.TILTING - 2) {
        bodyState = BODY.UPRIGHT; bodyStateMs = 0;
      }
    } else if (bodyState === BODY.FALLING) {
      if (bodyStateMs >= FALL_DURATION_MS) {
        bodyState = BODY.DOWN; bodyStateMs = 0;
      }
    } else if (bodyState === BODY.DOWN) {
      // Wait, but if user holds level we recover faster
      const ready = tilt < THRESHOLDS.TILTING && bodyStateMs >= DOWN_DURATION_MS;
      if (ready) { bodyState = BODY.RISING; bodyStateMs = 0; showBubble(pickRandom(LINES.RISING)); }
    } else if (bodyState === BODY.RISING) {
      if (bodyStateMs >= RISE_DURATION_MS) {
        bodyState = BODY.UPRIGHT; bodyStateMs = 0;
      }
    }
  }

  // ── Walker x position ──
  if (walkerX === null) walkerX = -WALK_MARGIN;
  // Only advance when walking upright or tilting (not while down)
  if (phase === PHASE.WALKING && (bodyState === BODY.UPRIGHT || bodyState === BODY.TILTING)) {
    // Slow down while tilting heavily
    const speedScale = bodyState === BODY.TILTING ? Math.max(0.2, 1 - tilt / 30) : 1;
    walkerX += WALK_SPEED * speedScale * (dt / 16.67);
    walkPhase += CADENCE * dt * (speedScale * 0.8 + 0.2);
  }

  // Check arrival
  if (phase === PHASE.WALKING && walkerX >= targetX && bodyState === BODY.UPRIGHT) {
    enterArrived();
  }

  // ── Compute visual transform ──
  // Smooth tilt toward target
  const tiltStrength = 0.85;
  if (bodyState === BODY.UPRIGHT) {
    visualTiltTarget = currentRoll * 0.15;  // very mild lean when upright
  } else if (bodyState === BODY.TILTING) {
    visualTiltTarget = currentRoll * tiltStrength;
  } else if (bodyState === BODY.FALLING) {
    // smoothing freezes; explicit angle below
  } else if (bodyState === BODY.RISING) {
    visualTiltTarget = currentRoll * 0.15;
  }
  if (bodyState !== BODY.FALLING && bodyState !== BODY.DOWN && bodyState !== BODY.RISING) {
    visualTilt += (visualTiltTarget - visualTilt) * 0.18;
  }

  let yOffset = 0;
  let figRotation = visualTilt;

  if (bodyState === BODY.FALLING) {
    const p = Math.min(1, bodyStateMs / FALL_DURATION_MS);
    const e = easeIn(p);
    figRotation = visualTilt + e * 90 * fallDir;
    yOffset = e * 40;
    setJointsCollapsed(e);
  } else if (bodyState === BODY.DOWN) {
    figRotation = visualTilt + 90 * fallDir;
    yOffset = 40;
    setJointsCollapsed(1);
  } else if (bodyState === BODY.RISING) {
    const p = Math.min(1, bodyStateMs / RISE_DURATION_MS);
    const e = easeOut(p);
    figRotation = (1 - e) * 90 * fallDir + visualTilt;
    yOffset = (1 - e) * 40;
    setJointsCollapsed(1 - e);
    if (e >= 0.999) updateJoints(walkPhase);
  } else {
    updateJoints(walkPhase);
  }

  const groundY = viewportH * GROUND_Y;
  gFig.setAttribute('transform',
    `translate(${walkerX.toFixed(1)},${(groundY + yOffset).toFixed(1)}) rotate(${figRotation.toFixed(2)})`);

  // ── Target opacity: brighter as walker approaches ──
  if (targetGroup) {
    const dist = Math.max(0, targetX - walkerX);
    const proximity = 1 - Math.min(1, dist / 400);
    targetGroup.setAttribute('opacity', (0.35 + 0.55 * proximity).toFixed(2));
  }

  // ── Trail sampling ──
  if (phase === PHASE.WALKING && bodyState !== BODY.DOWN) {
    sampleTrail(now);
  }

  // ── Speech ──
  tickSpeech(dt);

  requestAnimationFrame(loop);
}

// ── start ────────────────────────────────────────────────────
let started = false;
let orientationBound = false;

async function start() {
  if (!started) {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r === 'granted' && !orientationBound) {
          window.addEventListener('deviceorientation', onOrientation);
          orientationBound = true;
        }
      } catch {}
    } else if (!orientationBound) {
      window.addEventListener('deviceorientation', onOrientation);
      orientationBound = true;
    }
    await document.fonts.ready;
    buildTarget();
    buildFigure();
    started = true;
    requestAnimationFrame(loop);
  } else {
    // Recalibrate on second start (in case session was paused)
    calibration.done = !FEATURES.CALIBRATE_ON_START;
    calibrationStart = null;
    calibrationSamples.length = 0;
  }

  intro.classList.add('hidden');
  setTimeout(() => { intro.style.display = 'none'; }, 500);
  restartRound();
}

window.addEventListener('resize', resize);
resize();
intro.addEventListener('click', () => { start(); });

// Overlay controls
if (restartBtn) restartBtn.addEventListener('click', restartRound);
if (stopBtn) stopBtn.addEventListener('click', stopSession);
