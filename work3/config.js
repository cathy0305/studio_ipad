export const CHAR_SIZE = 22;

// IBM Plex Mono 셀 비율. 0.6 이면 좌우 거의 붙고, 1.0 이면 줄간격이 글자 높이와 같음.
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

export const WALK = {
  SPEED: 1.4,        // px/frame at 60fps ≈ 84 px/s
  MARGIN: 160,       // off-screen padding before wrapping
  CADENCE: 0.009,    // rad/ms — full step pair ≈ 700ms
  BODY_BOB: 1.2,     // px vertical body bob
  LEG_LIFT: 2.4,     // px max leg lift
};

// 문장은 부족하면 반복해서 채운다. 공백은 시각 텍스처 위해 제거.
const SENTENCE = "Hold the iPad level to keep the walker safe. But what if you didn't. ";
const TEXT_LOOP = SENTENCE.replace(/\s+/g, '');

// 사람 형상: 각 행은 ry (위→아래 -ry 만큼 위쪽) 와 그 행에 채울 rx 셀 목록.
// 폭은 보통 4~7 셀, 다리부터는 좌/우로 분리.
const FIGURE_ROWS = [
  // 머리
  { ry: -11, rxs: [-1, 0, 1],                  part: 'head' },
  { ry: -10, rxs: [-2, -1, 0, 1, 2],           part: 'head' },
  { ry:  -9, rxs: [-2, -1, 0, 1, 2],           part: 'head' },
  // 목
  { ry:  -8, rxs: [-1, 0, 1],                  part: 'neck' },
  // 어깨
  { ry:  -7, rxs: [-3, -2, -1, 0, 1, 2, 3],    part: 'shoulder' },
  // 가슴
  { ry:  -6, rxs: [-3, -2, -1, 0, 1, 2, 3],    part: 'torso' },
  { ry:  -5, rxs: [-3, -2, -1, 0, 1, 2, 3],    part: 'torso' },
  { ry:  -4, rxs: [-3, -2, -1, 0, 1, 2, 3],    part: 'torso' },
  // 허리
  { ry:  -3, rxs: [-3, -2, -1, 0, 1, 2, 3],    part: 'waist' },
  { ry:  -2, rxs: [-3, -2, -1, 0, 1, 2, 3],    part: 'waist' },
  // 골반
  { ry:  -1, rxs: [-3, -2, -1, 0, 1, 2, 3],    part: 'hip' },
  // 허벅지 (분리 시작)
  { ry:   0, rxs: [-3, -2, 1, 2],              part: 'leg' },
  { ry:   1, rxs: [-3, -2, 1, 2],              part: 'leg' },
  { ry:   2, rxs: [-3, -2, 1, 2],              part: 'leg' },
  // 종아리
  { ry:   3, rxs: [-3, -2, 1, 2],              part: 'leg' },
  { ry:   4, rxs: [-3, -2, 1, 2],              part: 'leg' },
  { ry:   5, rxs: [-3, -2, 1, 2],              part: 'leg' },
  // 발
  { ry:   6, rxs: [-3, -2, 1, 2],              part: 'foot' },
];

function buildLayout() {
  const out = [];
  let i = 0;
  for (const row of FIGURE_ROWS) {
    for (const rx of row.rxs) {
      let part = row.part;
      if (part === 'leg' || part === 'foot') {
        part += rx < 0 ? '_l' : '_r';
      }
      out.push({
        char: TEXT_LOOP[i % TEXT_LOOP.length],
        rx,
        ry: row.ry,
        part,
      });
      i++;
    }
  }
  return out;
}

export const WALKER_LAYOUT = buildLayout();
