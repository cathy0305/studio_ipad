import {
  CHAR_SIZE, CHAR_WIDTH_RATIO, LINE_HEIGHT_RATIO,
  BODY_CHARS, LEG_CHARS, SKELETON,
  WALK, FEATURES, CALIBRATION_MS,
} from './config.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const intro = document.getElementById('intro');
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

let viewportW = 0;
let viewportH = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  viewportW = window.innerWidth;
  viewportH = window.innerHeight;
  canvas.width = viewportW * dpr;
  canvas.height = viewportH * dpr;
  canvas.style.width = viewportW + 'px';
  canvas.style.height = viewportH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── orientation ──────────────────────────────────────────────
let currentRoll = 0, currentPitch = 0, rawRoll = 0, rawPitch = 0;
let hasOrientationData = false;
const calibration = { roll: 0, pitch: 0, done: !FEATURES.CALIBRATE_ON_START };
let calibrationStart = null;
const calibrationSamples = [];

function onOrientation(event) {
  rawRoll = event.gamma ?? 0;
  rawPitch = event.beta ?? 0;
  hasOrientationData = true;
  if (FEATURES.CALIBRATE_ON_START && !calibration.done) {
    if (calibrationStart === null) calibrationStart = performance.now();
    calibrationSamples.push({ r: rawRoll, p: rawPitch });
    if (performance.now() - calibrationStart >= CALIBRATION_MS) {
      const n = calibrationSamples.length;
      calibration.roll = calibrationSamples.reduce((s, v) => s + v.r, 0) / n;
      calibration.pitch = calibrationSamples.reduce((s, v) => s + v.p, 0) / n;
      calibration.done = true;
    }
  }
  currentRoll = rawRoll - calibration.roll;
  currentPitch = rawPitch - calibration.pitch;
}

// ── walker world position ────────────────────────────────────
let walkerX = null;
let walkerY = 0;
let lastFrameMs = null;
let walkPhase = 0;  // 누적 위상 — dt 기반으로 진행시켜야 프레임 드롭에도 일정

function initWalker() {
  walkerX = -WALK.MARGIN;
  walkerY = viewportH * 0.55;
  walkPhase = 0;
}

function updateWalking(now) {
  if (walkerX === null) initWalker();
  const dt = lastFrameMs === null ? 16.67 : Math.min(now - lastFrameMs, 64);
  lastFrameMs = now;
  walkerX += WALK.SPEED * (dt / 16.67);
  walkPhase += WALK.CADENCE * dt;
  if (walkerX > viewportW + WALK.MARGIN) walkerX = -WALK.MARGIN;
}

// ── math helpers ─────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 발 궤적 — stance 구간(0..π): 등속 후진, 들리지 않음. swing 구간(π..2π): 호를 그리며 전진.
function footTrajectory(phase, strideAmp, liftAmp) {
  const p = ((phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (p < Math.PI) {
    const t = p / Math.PI;        // 0..1
    return {
      dx: strideAmp * (1 - 2 * t),  // +amp → -amp
      dy: 0,
    };
  } else {
    const t = (p - Math.PI) / Math.PI;  // 0..1
    return {
      dx: strideAmp * (2 * t - 1),       // -amp → +amp
      dy: -liftAmp * Math.sin(t * Math.PI),
    };
  }
}

// 2-bone IK — hip-foot 거리와 thigh/calf 길이로 무릎 위치 계산.
// 무릎은 항상 진행 방향(+X)으로 굽음 → 자연스러운 보행.
function ikKnee(hipRx, hipRy, footRx, footRy, thighLen, calfLen) {
  const dx = footRx - hipRx;
  const dy = footRy - hipRy;
  const dist = Math.hypot(dx, dy);
  const reach = thighLen + calfLen;

  if (dist >= reach - 1e-4) {
    // overstretched: 무릎을 직선 위에 둠
    const ratio = thighLen / Math.max(dist, 1e-4);
    return { rx: hipRx + dx * ratio, ry: hipRy + dy * ratio };
  }
  const cosA = (thighLen * thighLen + dist * dist - calfLen * calfLen) / (2 * thighLen * dist);
  const angleAtHip = Math.acos(clamp(cosA, -1, 1));
  const baseAngle = Math.atan2(dy, dx);
  // Y-down + 진행 방향 +X → baseAngle - angleAtHip 가 무릎을 앞으로 보낸다
  const kneeAngle = baseAngle - angleAtHip;
  return {
    rx: hipRx + Math.cos(kneeAngle) * thighLen,
    ry: hipRy + Math.sin(kneeAngle) * thighLen,
  };
}

// 몸통 상하 진동 — 한 사이클 동안 두 번 위로 올라감 (각 다리의 mid-stance).
function bodyBobRy(phase) {
  // mid-stance 가 phase=π/2, 3π/2 → 이때 가장 높음 (ry 가장 작음).
  // bob = -cos(2*phase) → phase=π/2 에서 -cos(π) = 1, * -amp = -amp (위로) ✓
  return -WALK.BODY_BOB * 0.5 * (1 - Math.cos(2 * phase));
}

function ruToScreenX(rx) { return walkerX + rx * CHAR_SIZE * CHAR_WIDTH_RATIO; }
function ruToScreenY(ry) { return walkerY + ry * CHAR_SIZE * LINE_HEIGHT_RATIO; }

// ── drawing ──────────────────────────────────────────────────
function setTextStyle() {
  ctx.font = `${CHAR_SIZE}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 1;
}

function drawBody(phase) {
  const bob = bodyBobRy(phase);
  for (const c of BODY_CHARS) {
    ctx.fillText(c.char, ruToScreenX(c.rx), ruToScreenY(c.ry + bob));
  }
}

function drawLegSide(side, phase) {
  const legPhase = phase + (side === 'r' ? Math.PI : 0);
  const hipRxBase = side === 'l' ? SKELETON.HIP_L_RX : SKELETON.HIP_R_RX;
  const bob = bodyBobRy(phase);
  // 시각적 hip 은 bob 따라가지만 발 궤적의 기준은 bob 없는 baseHipRy → 발이 땅에서 미끄러지지 않음.
  const baseHipRy = SKELETON.HIP_RY;
  const hipRy = baseHipRy + bob;

  const traj = footTrajectory(legPhase, WALK.STRIDE, WALK.LIFT);
  const footRx = hipRxBase + traj.dx;
  const footRy = baseHipRy + SKELETON.THIGH_LEN + SKELETON.CALF_LEN + traj.dy;

  const knee = ikKnee(
    hipRxBase, hipRy,
    footRx,    footRy,
    SKELETON.THIGH_LEN, SKELETON.CALF_LEN,
  );

  // 허벅지: hip → knee 사이에 균등 배치 (양 끝점은 비워두고)
  const thigh = LEG_CHARS[`thigh_${side}`];
  for (let i = 0; i < thigh.length; i++) {
    const t = (i + 1) / (thigh.length + 1);
    const rx = lerp(hipRxBase, knee.rx, t);
    const ry = lerp(hipRy,     knee.ry, t);
    ctx.fillText(thigh[i], ruToScreenX(rx), ruToScreenY(ry));
  }

  // 종아리: knee → foot
  const calf = LEG_CHARS[`calf_${side}`];
  for (let i = 0; i < calf.length; i++) {
    const t = (i + 1) / (calf.length + 1);
    const rx = lerp(knee.rx, footRx, t);
    const ry = lerp(knee.ry, footRy, t);
    ctx.fillText(calf[i], ruToScreenX(rx), ruToScreenY(ry));
  }

  // 발: 발목에서 앞쪽으로 살짝 뻗어서 가로로 배치
  const foot = LEG_CHARS[`foot_${side}`];
  for (let i = 0; i < foot.length; i++) {
    const rx = footRx + (i + 0.5) * SKELETON.FOOT_FORWARD;
    const ry = footRy + 0.3;
    ctx.fillText(foot[i], ruToScreenX(rx), ruToScreenY(ry));
  }
}

function drawDebug(phase) {
  ctx.save();
  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const tilt = Math.sqrt(currentRoll ** 2 + currentPitch ** 2);
  const calibStr = calibration.done
    ? `r=${calibration.roll.toFixed(1)} p=${calibration.pitch.toFixed(1)}`
    : 'pending…';
  const lines = [
    `roll  (γ): ${currentRoll.toFixed(2)}°`,
    `pitch (β): ${currentPitch.toFixed(2)}°`,
    `tilt:      ${tilt.toFixed(2)}°`,
    `orient:    ${hasOrientationData ? 'live' : 'no data'}`,
    `calib:     ${calibStr}`,
    `walkerX:   ${walkerX !== null ? walkerX.toFixed(1) : '—'}`,
    `walkPhase: ${(phase % (2 * Math.PI)).toFixed(2)}`,
    `viewport:  ${viewportW}×${viewportH}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 12, 12 + i * 16));
  ctx.restore();
}

// ── main loop ────────────────────────────────────────────────
function loop(now) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, viewportW, viewportH);
  updateWalking(now);

  setTextStyle();
  drawBody(walkPhase);
  drawLegSide('l', walkPhase);
  drawLegSide('r', walkPhase);

  if (DEBUG) drawDebug(walkPhase);
  requestAnimationFrame(loop);
}

async function start() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response === 'granted') window.addEventListener('deviceorientation', onOrientation);
    } catch {}
  } else {
    window.addEventListener('deviceorientation', onOrientation);
  }
  intro.classList.add('hidden');
  setTimeout(() => { intro.style.display = 'none'; }, 500);
  await document.fonts.ready;
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
intro.addEventListener('click', start, { once: true });
