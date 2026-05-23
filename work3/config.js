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

// 한 사이클 (= 두 걸음) ≈ 3140ms. SPEED·CADENCE 비율은 발이 땅에서 안 미끄러지도록 유지 (SPEED ≈ 210·CADENCE).
export const WALK = {
  SPEED:     0.4,    // px/frame at 60fps — 느긋한 산책 페이스
  MARGIN:    180,    // off-screen padding before wrapping
  CADENCE:   0.002,  // rad/ms
  STRIDE:    1.5,    // 발이 hip 기준 앞뒤로 ±STRIDE char unit
  LIFT:      1.0,    // swing 정점에서 발 들리는 높이
  ARM_SWING: 0.35,   // 팔의 좌우 흔들림 각도 (radian), 직하강 기준
  BODY_BOB:  0.18,
};

// 옆모습 골격 — 양쪽 사지가 같은 관절(hip / shoulder)에서 나옴.
export const SKELETON = {
  HIP_RX:        1.0,
  HIP_RY:       -1.0,
  THIGH_LEN:     3.0,
  CALF_LEN:      2.8,
  FOOT_FORWARD:  0.85,

  SHOULDER_RX:   1.5,
  SHOULDER_RY:  -7.5,
  UPPER_ARM_LEN: 2.0,
  FOREARM_LEN:   2.0,
  ARM_REACH_RATIO: 0.9,  // 손이 닿는 반지름 = 팔 전체 길이 × 비율 (< 1 이어야 팔꿈치가 굽음)

  LIMB_THICKNESS: 1,     // 본 중심선 양옆으로 ±N 셀씩 두께
};

// 두툼한 옆모습 실루엣 — 머리·어깨·골반이 또렷하게 채워져 문장이 가로로 흐름.
export const BODY_GRID = [
  { ry: -13, rxs: [1, 2] },                          // crown
  { ry: -12, rxs: [0, 1, 2, 3] },                    // 머리 위쪽
  { ry: -11, rxs: [-1, 0, 1, 2, 3] },                // 머리
  { ry: -10, rxs: [-1, 0, 1, 2, 3] },                // 얼굴
  { ry:  -9, rxs: [0, 1, 2, 3] },                    // 턱/목
  { ry:  -8, rxs: [-1, 0, 1, 2, 3] },                // 어깨선
  { ry:  -7, rxs: [-1, 0, 1, 2, 3, 4] },             // 가슴 위
  { ry:  -6, rxs: [-1, 0, 1, 2, 3, 4] },             // 가슴
  { ry:  -5, rxs: [-1, 0, 1, 2, 3, 4] },             // 갈비
  { ry:  -4, rxs: [0, 1, 2, 3] },                    // 허리 (잘록)
  { ry:  -3, rxs: [-1, 0, 1, 2, 3, 4] },             // 엉덩이 위
  { ry:  -2, rxs: [-1, 0, 1, 2, 3, 4] },             // 골반
  { ry:  -1, rxs: [0, 1, 2, 3] },                    // 사타구니 접속부
];

const SENTENCE = "Hold the iPad level to keep the walker safe. But what if you didn't. ";
export const TEXT_LOOP = SENTENCE.replace(/\s+/g, '');
