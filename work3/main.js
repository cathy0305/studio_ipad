import { FEATURES, CALIBRATION_MS, THRESHOLDS } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SENTENCE = "Hold the iPad level to keep the walker safe. But what if you didn't. ";
const FILL_SIZE   = 11;   // px, font size inside limbs
const FILL_LINE_H = 13;   // line height
const FILL_CHAR_W = 6.6;  // monospace char width at FILL_SIZE

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
const CADENCE    = 0.0022;  // rad/ms
const WALK_SPEED = 0.45;    // px/frame at 60 fps
const GROUND_Y   = 0.70;    // fraction of viewport height
const WALK_MARGIN = 200;

// ── DOM ───────────────────────────────────────────────────────
const stage = document.getElementById('stage');
const intro = document.getElementById('intro');
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

let viewportW = 0, viewportH = 0;

function resize() {
  viewportW = window.innerWidth;
  viewportH = window.innerHeight;
  stage.setAttribute('viewBox', `0 0 ${viewportW} ${viewportH}`);
  stage.setAttribute('width',  viewportW);
  stage.setAttribute('height', viewportH);
}

// ── SVG helpers ───────────────────────────────────────────────
function svgEl(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

function setRot(el, deg) {
  el.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
}

// ── orientation ───────────────────────────────────────────────
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

// ── text fill ─────────────────────────────────────────────────
// Each limb is filled with horizontal text lines clipped to its shape.
// Coordinates are in the limb's *local* space (origin = joint pivot).
// When the joint rotates, both clip and text rotate together. ✓
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

// ── figure construction ───────────────────────────────────────
const defs = svgEl('defs', {}, stage);
let gFig, gBob;
const jt = {};  // joint element refs keyed by name

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

// ── walk math ─────────────────────────────────────────────────
// For a figure walking RIGHT (+x):
//   Negative SVG rotation = limb tip moves right (forward).
//   Leg A leads when sin(phase) > 0; arm A is contralateral (opposite).

function updateJoints(phase) {
  const s   = Math.sin(phase);
  const bob = 4 * (1 - Math.cos(2 * phase)) / 2;

  // Thighs: negative = forward for right-walking figure
  setRot(jt.thigha, -26 * s);
  setRot(jt.thighb,  26 * s);

  // Calves: relative to thigh, bent when leg is in forward swing
  setRot(jt.calfa,  22 * Math.max(0,  s));
  setRot(jt.calfb,  22 * Math.max(0, -s));

  // Arms: contralateral — arm A backward when leg A forward
  setRot(jt.uaa,  18 * s);
  setRot(jt.uab, -18 * s);

  // Forearms: constant slight forward bend
  setRot(jt.faa, 12);
  setRot(jt.fab, 12);

  // Body bob (translate gBob up slightly mid-stride)
  gBob.setAttribute('transform', `translate(0,${(-bob).toFixed(2)})`);
}

// ── speech system ─────────────────────────────────────────────
const LINES = {
  WALKING:  ['La la la~', 'Nice day', 'Just walking', 'Hmm hmm~', 'La di da~'],
  WOBBLING: ['Whoa!', 'Hey hey!', 'Wait!', 'Easy!', 'Hold on!'],
  FALLING:  ['Ouch', 'Owww', 'Why?', 'Come on...', 'Oof'],
  RISING:   ['Okay, again', 'Try again', 'Here we go', 'One more time'],
  STABLE:   ['Steady hands!', 'Wow, calm', 'So smooth', 'Nice', 'Perfect~'],
  ASIDE:    ['You okay?', 'Are you nervous?', 'Coffee?'],
};

const FADE_MS = 350;
const SHOW_MS = 2000;

let figState   = 'WALKING';
let figStateMs = 0;
const bubble   = { text: '', alpha: 0, phase: 'hidden', showTimer: 0 };
let nextSpeechMs = 3000 + Math.random() * 2000;
let asideMs      = 30000 + Math.random() * 20000;
let speechEl     = null;   // SVG <text> element for speech

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

function rawState(tilt) {
  if (!hasOrientationData) return 'WALKING';
  if (tilt >= THRESHOLDS.FALLING)  return 'FALLING';
  if (tilt >= THRESHOLDS.TILTING)  return 'WOBBLING';
  if (tilt < 3)                    return 'STABLE';
  return 'WALKING';
}

function tickSpeech(dt) {
  const tilt = Math.sqrt(currentRoll ** 2 + currentPitch ** 2);
  const raw  = rawState(tilt);

  // State transitions
  if (figState === 'FALLING' && raw !== 'FALLING') {
    figState = 'RISING'; figStateMs = 0;
    showBubble(pickRandom(LINES.RISING));
    nextSpeechMs = 5000;
  } else if (figState === 'RISING') {
    figStateMs += dt;
    if (figStateMs > 1500) { figState = raw; figStateMs = 0; }
  } else if (raw !== figState) {
    figState = raw; figStateMs = 0;
    showBubble(pickRandom(LINES[figState]));
    nextSpeechMs = 4000 + Math.random() * 3000;
  } else {
    figStateMs += dt;
  }

  tickBubble(dt);

  // Periodic idle speech
  if (bubble.phase === 'hidden') {
    nextSpeechMs -= dt;
    if (nextSpeechMs <= 0 && figState !== 'FALLING') {
      showBubble(pickRandom(LINES[figState] ?? LINES.WALKING));
      nextSpeechMs = 4000 + Math.random() * 4000;
    }
  }

  // Occasional aside
  asideMs -= dt;
  if (asideMs <= 0) {
    if (figState === 'WALKING' && bubble.phase === 'hidden')
      showBubble(pickRandom(LINES.ASIDE));
    asideMs = 30000 + Math.random() * 20000;
  }
}

// ── main loop ─────────────────────────────────────────────────
let walkerX   = null;
let walkPhase = 0;
let lastMs    = null;

function loop(now) {
  const dt = lastMs === null ? 16.67 : Math.min(now - lastMs, 64);
  lastMs = now;

  if (walkerX === null) walkerX = -WALK_MARGIN;
  walkerX += WALK_SPEED * (dt / 16.67);
  if (walkerX > viewportW + WALK_MARGIN) walkerX = -WALK_MARGIN;
  walkPhase += CADENCE * dt;

  const groundY = viewportH * GROUND_Y;
  gFig.setAttribute('transform', `translate(${walkerX.toFixed(1)},${groundY.toFixed(1)})`);

  updateJoints(walkPhase);
  tickSpeech(dt);

  requestAnimationFrame(loop);
}

// ── start ─────────────────────────────────────────────────────
async function start() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r === 'granted') window.addEventListener('deviceorientation', onOrientation);
    } catch {}
  } else {
    window.addEventListener('deviceorientation', onOrientation);
  }
  intro.classList.add('hidden');
  setTimeout(() => { intro.style.display = 'none'; }, 500);
  await document.fonts.ready;
  buildFigure();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
intro.addEventListener('click', start, { once: true });
