import {
  CHAR_SIZE,
  CHAR_WIDTH_RATIO,
  LINE_HEIGHT_RATIO,
  WALKER_LAYOUT,
  WALK,
  FEATURES,
  CALIBRATION_MS,
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
  // reset and re-scale so resizes don't accumulate transforms
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let currentRoll = 0;
let currentPitch = 0;
let rawRoll = 0;
let rawPitch = 0;
let hasOrientationData = false;

const calibration = {
  roll: 0,
  pitch: 0,
  done: !FEATURES.CALIBRATE_ON_START,
};
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

// 걷기 상태: 사람 형상 전체의 화면상 위치 (사람의 발 중심 기준 X).
let walkerX = null;
let walkerY = 0;          // 화면 세로 중심 + 약간 위 (발이 화면 아래쪽에 닿도록)
let lastFrameMs = null;

function initWalker() {
  walkerX = -WALK.MARGIN;            // 왼쪽 바깥에서 시작
  walkerY = viewportH * 0.55;        // 발이 살짝 화면 아래쪽에 오도록 발 중심을 약간 아래
}

function updateWalking(now) {
  if (walkerX === null) initWalker();
  const dt = lastFrameMs === null ? 16.67 : Math.min(now - lastFrameMs, 64);
  lastFrameMs = now;
  // dt 60fps 기준으로 정규화
  walkerX += WALK.SPEED * (dt / 16.67);
  if (walkerX > viewportW + WALK.MARGIN) {
    walkerX = -WALK.MARGIN;
  }
}

function getCharOffset(part, t) {
  const phase = t * WALK.CADENCE;
  // 몸 전체 상하 진동: 한 걸음 쌍에 두 번 (피크가 위→아래 두 번)
  const bob = -Math.abs(Math.sin(phase * 2)) * WALK.BODY_BOB;
  let legLift = 0;
  if (part === 'leg_l' || part === 'foot_l') {
    legLift = -Math.max(0, Math.sin(phase)) * WALK.LEG_LIFT;
  } else if (part === 'leg_r' || part === 'foot_r') {
    legLift = -Math.max(0, -Math.sin(phase)) * WALK.LEG_LIFT;
  }
  return bob + legLift;
}

function relativeToScreen(rx, ry, part, t) {
  const dy = getCharOffset(part, t);
  return {
    x: walkerX + rx * CHAR_SIZE * CHAR_WIDTH_RATIO,
    y: walkerY + ry * CHAR_SIZE * LINE_HEIGHT_RATIO + dy,
  };
}

function drawWalker(t) {
  ctx.font = `${CHAR_SIZE}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 1;
  for (const item of WALKER_LAYOUT) {
    const p = relativeToScreen(item.rx, item.ry, item.part, t);
    ctx.fillText(item.char, p.x, p.y);
  }
}

function drawDebug() {
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
    `roll  (γ): ${currentRoll.toFixed(2)}°  (raw ${rawRoll.toFixed(2)})`,
    `pitch (β): ${currentPitch.toFixed(2)}°  (raw ${rawPitch.toFixed(2)})`,
    `tilt:      ${tilt.toFixed(2)}°`,
    `orient:    ${hasOrientationData ? 'live' : 'no data'}`,
    `calib:     ${calibStr}`,
    `walkerX:   ${walkerX !== null ? walkerX.toFixed(1) : '—'}`,
    `viewport:  ${viewportW}×${viewportH} dpr=${(window.devicePixelRatio || 1).toFixed(2)}`,
    `chars:     ${WALKER_LAYOUT.length}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 12, 12 + i * 16));
  ctx.restore();
}

function loop(now) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, viewportW, viewportH);
  updateWalking(now);
  drawWalker(now);
  if (DEBUG) drawDebug();
  requestAnimationFrame(loop);
}

async function start() {
  // Permission request must happen inside the user-gesture handler.
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response === 'granted') {
        window.addEventListener('deviceorientation', onOrientation);
      }
    } catch {
      // proceed without orientation
    }
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
