export const CHAR_SIZE = 22;
export const CHAR_WIDTH_RATIO = 0.6;
export const LINE_HEIGHT_RATIO = 1.0;

export const FEATURES = {
  CALIBRATE_ON_START: true,
};

export const CALIBRATION_MS = 500;

export const THRESHOLDS = {
  TILTING: 8,
  FALLING: 22,
  FLIPPED: 120,
};

export const PHYSICS = {
  GRAVITY: 0.4,
  REFORM_SPEED: 0.05,
  BREATH_AMPL: 0.5,
  BREATH_FREQ: 0.002,
};

// 걷기 사이클 — STRIDE × CADENCE × SPEED 가 서로 어울려야 발이 미끄러지지 않는다.
// 한 사이클 (= 두 걸음) ≈ 1047ms, 본체가 사이클당 4*STRIDE char unit ≈ 5.6 char ≈ 74px 이동.
// 60fps 기준 SPEED ≈ 4*STRIDE / cycleMs * frameMs * pxPerChar ≈ 1.2 px/frame.
export const WALK = {
  SPEED:    1.2,    // px/frame at 60fps
  MARGIN:   180,    // off-screen padding before wrapping
  CADENCE:  0.006,  // rad/ms — 한 걸음 쌍 ≈ 1047ms
  STRIDE:   1.4,    // 발이 hip 기준 앞뒤로 ±STRIDE char unit 만큼 움직임
  LIFT:     1.1,    // swing 정점에서 발이 들리는 높이 (char unit)
  BODY_BOB: 0.35,   // 몸통 상하 진동 진폭 (char unit)
};

// 골격
export const SKELETON = {
  HIP_L_RX:  -1.5,  // 왼쪽 고관절 x
  HIP_R_RX:   1.5,  // 오른쪽 고관절 x
  HIP_RY:    -0.3,  // 고관절 y (몸통 마지막 행 -1 아래에 살짝 붙음)
  THIGH_LEN:  3.2,
  CALF_LEN:   3.0,
  FOOT_FORWARD: 0.7, // 발이 발목 기준 앞쪽으로 뻗는 거리
};

// 몸통 (강체). 폭 -3..3 안에서 모양 잡음. 살짝 호리한 sillhouette.
export const BODY_GRID = [
  { ry: -10, rxs: [-1, 0, 1] },                 // 머리 위
  { ry:  -9, rxs: [-2, -1, 0, 1, 2] },          // 머리
  { ry:  -8, rxs: [-2, -1, 0, 1, 2] },          // 얼굴
  { ry:  -7, rxs: [-1, 0, 1] },                 // 목 (좁게)
  { ry:  -6, rxs: [-3, -2, -1, 0, 1, 2, 3] },   // 어깨 (제일 넓게)
  { ry:  -5, rxs: [-3, -2, -1, 0, 1, 2, 3] },   // 상체
  { ry:  -4, rxs: [-2, -1, 0, 1, 2] },          // 가슴 안쪽
  { ry:  -3, rxs: [-2, -1, 0, 1, 2] },          // 허리 (좁게)
  { ry:  -2, rxs: [-3, -2, -1, 0, 1, 2, 3] },   // 골반 위
  { ry:  -1, rxs: [-3, -2, -1, 0, 1, 2, 3] },   // 골반
];

// 다리 세그먼트 — 매 프레임 IK 로 위치 계산.
export const LEG_SEGMENTS = [
  { id: 'thigh_l', count: 3 },
  { id: 'calf_l',  count: 3 },
  { id: 'foot_l',  count: 2 },
  { id: 'thigh_r', count: 3 },
  { id: 'calf_r',  count: 3 },
  { id: 'foot_r',  count: 2 },
];

const SENTENCE = "Hold the iPad level to keep the walker safe. But what if you didn't. ";
const TEXT_LOOP = SENTENCE.replace(/\s+/g, '');

function buildBodyChars() {
  const out = [];
  let i = 0;
  for (const row of BODY_GRID) {
    for (const rx of row.rxs) {
      out.push({ char: TEXT_LOOP[i % TEXT_LOOP.length], rx, ry: row.ry });
      i++;
    }
  }
  return { chars: out, nextIndex: i };
}

function buildLegChars(startIndex) {
  const out = {};
  let i = startIndex;
  for (const seg of LEG_SEGMENTS) {
    out[seg.id] = [];
    for (let c = 0; c < seg.count; c++) {
      out[seg.id].push(TEXT_LOOP[i % TEXT_LOOP.length]);
      i++;
    }
  }
  return out;
}

const _body = buildBodyChars();
export const BODY_CHARS = _body.chars;
export const LEG_CHARS = buildLegChars(_body.nextIndex);
