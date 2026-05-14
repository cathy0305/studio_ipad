# 개발 명세서

## 1. 개요

iPad Safari에서 작동하는 웹 기반 인터랙티브 프로토타입. ASCII 사람 형상이 영어 텍스트로 구성되어 화면을 걷는다. 사용자가 iPad를 기울이면 사람이 흔들리고, 더 기울이면 넘어지며, 뒤집으면 부서진다. 5초 후 재생성된다.

핵심 경험: 사용자는 자기 손의 각도가 화면 속 존재의 안전을 결정한다는 사실을 통해, 평소 의식하지 않던 자기 자세를 보게 된다.

## 2. 기술 스택

- 언어: HTML, CSS, JavaScript (vanilla, 프레임워크 없음)
- 렌더링: HTML5 Canvas API
- 자이로: DeviceOrientation API (iOS 13+ 권한 요청 포함)
- 폰트: IBM Plex Mono (Google Fonts CDN)
- 개발 도구: VSCode
- 테스트 환경: iPad Safari (iOS 16+ 권장)
- 호스팅: 로컬 개발 시 Vite 또는 단순 HTTP 서버 (Python http.server). iPad에서 접근하려면 같은 Wi-Fi 네트워크 + IP 주소로 접속, 또는 ngrok 사용
- HTTPS 필요: DeviceOrientation API는 HTTPS 환경에서만 작동. 로컬 테스트 시 ngrok이나 mkcert로 HTTPS 설정 필요

## 3. 파일 구조

```
footing/
├── index.html
├── style.css
├── main.js
├── walker.js          # 사람 형상 정의와 상태 관리
├── physics.js         # 글자별 물리 시뮬레이션
├── orientation.js     # 자이로 권한 및 데이터 처리
├── config.js          # 모든 상수와 파라미터
└── assets/
    └── (필요시 폰트 파일 로컬 호스팅)
```

## 4. 화면 사양

- 방향: 세로 모드 (Portrait) 기본. 가로 모드도 작동하되 권장은 세로.
- iPad 크기 기준: iPad Air/Pro 11" 세로 모드 (834 × 1194 px @1x, 디바이스 픽셀 비율 2x)
- 배경: 순흑 (`#000000`)
- 글자 색: 순백 (`#FFFFFF`), opacity로 변화 표현
- 폰트: IBM Plex Mono, 폰트 크기 22–28px (디바이스에 따라 조정)
- 줄 간격: 글자 크기의 1.2배
- 글자 간격: 모노스페이스 자연 간격
- 풀스크린: 메타 태그로 iOS Safari의 주소창과 상단바 숨김. PWA 등록으로 "홈 화면에 추가" 시 풀스크린.

## 5. 텍스트 콘텐츠와 형상 배치

### 5.1 전체 텍스트

> "Hold the iPad level to keep the walker safe. But what if you didn't."

총 67자 (공백 포함). 마침표 두 개. 물음표 없음 (의도된 평서문).

### 5.2 형상 구조

사람 형상은 다음의 부위로 나뉜다. 각 부위는 부위 ID, 글자 배열, *기본 좌표(상대 위치)*를 가진다.

```
HEAD       : "Hold"               (4자)
NECK       : "the"                (3자)
SHOULDERS  : "iPad level"         (10자, 양어깨로 분리)
TORSO      : "to keep the"        (11자, 세 줄로 분리)
WAIST      : "walker safe"        (11자)
HIP        : "But what"           (8자)
LEGS_UPPER : "if you"             (6자)
LEGS_LOWER : "didn't"             (6자)
```

마침표는 시각적으로 발끝 또는 어깨 끝에 배치하여 사람의 마침을 상징한다.

### 5.3 좌표 시스템

좌표는 화면 중앙을 `(0, 0)`으로 하는 상대 좌표. 단위는 글자 크기. 예:

```
HEAD의 "H": (-2, -10)  // 화면 중앙 위 10글자, 왼쪽 2글자
HEAD의 "o": (-1, -10)
HEAD의 "l": (0, -10)
HEAD의 "d": (1, -10)
```

이 좌표를 `config.js`에 정의한다:

```js
export const WALKER_LAYOUT = [
  // HEAD
  { char: 'H', rx: -1.5, ry: -10, part: 'head' },
  { char: 'o', rx: -0.5, ry: -10, part: 'head' },
  { char: 'l', rx:  0.5, ry: -10, part: 'head' },
  { char: 'd', rx:  1.5, ry: -10, part: 'head' },
  // NECK
  { char: 't', rx: -1, ry: -9, part: 'neck' },
  { char: 'h', rx:  0, ry: -9, part: 'neck' },
  { char: 'e', rx:  1, ry: -9, part: 'neck' },
  // SHOULDERS (양어깨로 펼침)
  { char: 'i', rx: -5, ry: -8, part: 'shoulder_l' },
  { char: 'P', rx: -4, ry: -8, part: 'shoulder_l' },
  { char: 'a', rx: -3, ry: -8, part: 'shoulder_l' },
  { char: 'd', rx: -2, ry: -8, part: 'shoulder_l' },
  { char: 'l', rx:  2, ry: -8, part: 'shoulder_r' },
  { char: 'e', rx:  3, ry: -8, part: 'shoulder_r' },
  { char: 'v', rx:  4, ry: -8, part: 'shoulder_r' },
  { char: 'e', rx:  5, ry: -8, part: 'shoulder_r' },
  { char: 'l', rx:  6, ry: -8, part: 'shoulder_r' },
  // TORSO (세 줄)
  { char: 't', rx: -2, ry: -6, part: 'torso' },
  { char: 'o', rx: -1, ry: -6, part: 'torso' },
  { char: 'k', rx:  0, ry: -6, part: 'torso' },
  { char: 'e', rx:  1, ry: -6, part: 'torso' },
  { char: 'e', rx:  2, ry: -6, part: 'torso' },
  { char: 'p', rx:  3, ry: -6, part: 'torso' },
  { char: 't', rx: -1, ry: -5, part: 'torso' },
  { char: 'h', rx:  0, ry: -5, part: 'torso' },
  { char: 'e', rx:  1, ry: -5, part: 'torso' },
  // WAIST
  { char: 'w', rx: -3, ry: -4, part: 'waist' },
  { char: 'a', rx: -2, ry: -4, part: 'waist' },
  { char: 'l', rx: -1, ry: -4, part: 'waist' },
  { char: 'k', rx:  0, ry: -4, part: 'waist' },
  { char: 'e', rx:  1, ry: -4, part: 'waist' },
  { char: 'r', rx:  2, ry: -4, part: 'waist' },
  { char: 's', rx: -1, ry: -3, part: 'waist' },
  { char: 'a', rx:  0, ry: -3, part: 'waist' },
  { char: 'f', rx:  1, ry: -3, part: 'waist' },
  { char: 'e', rx:  2, ry: -3, part: 'waist' },
  { char: '.', rx:  3, ry: -3, part: 'waist' },
  // HIP
  { char: 'B', rx: -3, ry: -1, part: 'hip' },
  { char: 'u', rx: -2, ry: -1, part: 'hip' },
  { char: 't', rx: -1, ry: -1, part: 'hip' },
  { char: 'w', rx:  1, ry: -1, part: 'hip' },
  { char: 'h', rx:  2, ry: -1, part: 'hip' },
  { char: 'a', rx:  3, ry: -1, part: 'hip' },
  { char: 't', rx:  4, ry: -1, part: 'hip' },
  // LEGS_UPPER (양다리로 분리)
  { char: 'i', rx: -2, ry:  1, part: 'leg_l' },
  { char: 'f', rx: -1, ry:  1, part: 'leg_l' },
  { char: 'y', rx:  2, ry:  1, part: 'leg_r' },
  { char: 'o', rx:  3, ry:  1, part: 'leg_r' },
  { char: 'u', rx:  4, ry:  1, part: 'leg_r' },
  // LEGS_LOWER
  { char: 'd', rx: -2, ry:  3, part: 'leg_l' },
  { char: 'i', rx: -1, ry:  3, part: 'leg_l' },
  { char: 'd', rx:  2, ry:  3, part: 'leg_r' },
  { char: 'n', rx:  3, ry:  3, part: 'leg_r' },
  { char: "'", rx:  4, ry:  3, part: 'leg_r' },
  { char: 't', rx:  5, ry:  3, part: 'leg_r' },
  // FOOT (마침표)
  { char: '.', rx: -1, ry:  5, part: 'foot_l' },
];
```

이 좌표는 초안이다. 실제 작업 시 화면에 띄워보고 조정한다. 좌표 설계는 눈으로 보면서 정해야 하니까 Phase 1에서 빠르게 이터레이션할 부분.

### 5.4 좌표를 화면 픽셀로 변환

```js
const CHAR_SIZE = 26; // 폰트 크기
const screenCenterX = canvas.width / 2;
const screenCenterY = canvas.height / 2;

function relativeToScreen(rx, ry) {
  return {
    x: screenCenterX + rx * CHAR_SIZE * 0.65, // 모노스페이스 글자 폭
    y: screenCenterY + ry * CHAR_SIZE * 1.2,  // 줄 간격
  };
}
```

## 6. 자이로 처리 (orientation.js)

### 6.1 권한 요청

```js
export async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+
    const response = await DeviceOrientationEvent.requestPermission();
    return response === 'granted';
  }
  // Android 또는 구버전 iOS
  return true;
}
```

권한 요청은 사용자 제스처 안에서만 호출되어야 함. 첫 화면에 "Tap to begin" 같은 단순한 진입 버튼을 두고, 거기서 요청.

### 6.2 각도 추출

```js
let currentRoll = 0;  // 좌우 기울임 (degrees)
let currentPitch = 0; // 앞뒤 기울임 (degrees)

window.addEventListener('deviceorientation', (event) => {
  currentRoll = event.gamma || 0;  // -90 ~ 90
  currentPitch = event.beta || 0;  // -180 ~ 180
});
```

iPad 세로 모드 기준:

- `gamma`: 좌우 기울임. 평평할 때 0. 오른쪽으로 기울이면 양수.
- `beta`: 앞뒤 기울임. 평평할 때 0. 앞으로 기울이면 양수.

### 6.3 종합 기울임 각도

핵심 상태 결정에 쓸 총 기울임:

```js
function getTotalTilt() {
  return Math.sqrt(currentRoll ** 2 + currentPitch ** 2);
}

function isUpsideDown() {
  return Math.abs(currentPitch) > 120;
}
```

## 7. 상태 머신 (walker.js)

### 7.1 상태 정의

```js
export const STATES = {
  WALKING:   'walking',
  TILTING:   'tilting',
  FALLING:   'falling',
  SHATTERED: 'shattered',
  REFORMING: 'reforming',
};
```

### 7.2 상태 전환 규칙

매 프레임 (60fps) 다음을 평가:

```js
function updateState(currentState, tilt, isFlipped) {
  switch (currentState) {
    case STATES.WALKING:
      if (tilt > THRESHOLDS.TILTING) return STATES.TILTING;
      break;
    case STATES.TILTING:
      if (tilt < THRESHOLDS.TILTING - 2) return STATES.WALKING; // 히스테리시스
      if (tilt > THRESHOLDS.FALLING) return STATES.FALLING;
      if (isFlipped) return STATES.SHATTERED;
      break;
    case STATES.FALLING:
      if (isAllCharsAtFloor()) return STATES.SHATTERED;
      break;
    case STATES.SHATTERED:
      if (timeSinceShattered() > 5000) return STATES.REFORMING;
      break;
    case STATES.REFORMING:
      if (isAllCharsAtOriginalPosition()) return STATES.WALKING;
      break;
  }
  return currentState;
}
```

### 7.3 임계치 (config.js)

```js
export const THRESHOLDS = {
  TILTING:  8,   // 도 단위. 이 이상 기울이면 사람이 멈추고 같이 기울어짐
  FALLING:  22,  // 이 이상이면 넘어짐
  FLIPPED:  120, // pitch 이 이상이면 뒤집힘 (즉시 부서짐)
};
```

이 값들은 실제 들고 테스트하면서 조정한다. 8도는 살짝 기울인 정도, 22도는 명확히 기울인 정도, 120도는 뒤집은 정도. 시작값일 뿐.

## 8. 글자 물리 시뮬레이션 (physics.js)

### 8.1 글자 객체

각 글자는 다음 속성을 가진다:

```js
{
  char:        'H',
  part:        'head',
  origin:      { x: 380, y: 320 },  // 원래 화면 위치 (Walking 시)
  position:    { x: 380, y: 320 },  // 현재 위치
  velocity:    { x: 0, y: 0 },      // 떨어질 때 사용
  rotation:    0,                    // 현재 회전 (라디안)
  rotationVel: 0,                    // 회전 속도
  opacity:     1,                    // 0~1
  state:       'attached',           // 'attached', 'falling', 'on_floor', 'rising'
}
```

### 8.2 상태별 동작

**WALKING 상태**

- 모든 글자 `position = origin` 유지
- 전체 사람이 미세하게 호흡: 모든 글자의 y에 `sin(time * 0.002) * 0.5` 더함
- 다리 글자 (`part: 'leg_l', 'leg_r'`)는 걷는 리듬으로 살짝 위아래 이동: 좌우 다리가 반대 위상

**TILTING 상태**

- 사람 전체가 현재 roll 각도만큼 회전. 회전 중심은 발 바닥.
- 각 글자의 위치를 origin에서 회전 변환:

  ```js
  const angle = degToRad(currentRoll);
  const dx = origin.x - pivotX;
  const dy = origin.y - pivotY;
  position.x = pivotX + dx * cos(angle) - dy * sin(angle);
  position.y = pivotY + dx * sin(angle) + dy * cos(angle);
  ```

- 미세한 진동: 각 글자에 `random() * 0.5` 만큼의 흔들림 추가
- 회전(rotation)도 같이 적용

**FALLING 상태**

- 진입 시 각 글자에 초기 속도 부여:
  - `velocity.x = (현재 roll에 비례) + random(-2, 2)`
  - `velocity.y = random(-3, 0)` // 약간 위로 튀어 오름
  - `rotationVel = random(-0.05, 0.05)`
- 매 프레임:
  - `velocity.y += GRAVITY` (예: 0.4)
  - `position += velocity`
  - `rotation += rotationVel`
  - `opacity` = 떨어지는 정도에 따라 1 → 0.3으로 감소
- 화면 하단에 닿으면 `state = 'on_floor'`, `velocity = 0`

**SHATTERED 상태**

- 모든 글자가 화면 하단에 흩어져 누워있음
- `opacity` 0.3 유지
- 미세한 흔들림 (잔진동)
- 5초 타이머

**REFORMING 상태**

- 각 글자가 `position`에서 `origin`으로 부드럽게 이동:

  ```js
  position.x = lerp(position.x, origin.x, 0.05);
  position.y = lerp(position.y, origin.y, 0.05);
  rotation = lerp(rotation, 0, 0.05);
  opacity = lerp(opacity, 1, 0.05);
  ```

- 모든 글자가 `origin`에 도달하면 (거리 < 1px) WALKING으로 전환

### 8.3 상수

```js
export const PHYSICS = {
  GRAVITY:        0.4,
  FLOOR_Y:        canvas.height - 60,
  REFORM_SPEED:   0.05,
  BREATH_AMPL:    0.5,
  BREATH_FREQ:    0.002,
};
```

## 9. 렌더링 (main.js)

### 9.1 메인 루프

```js
function loop(timestamp) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  updateOrientation();
  const newState = updateState(currentState, getTotalTilt(), isUpsideDown());
  if (newState !== currentState) onStateChange(currentState, newState);
  currentState = newState;

  updatePhysics(timestamp);

  drawAllChars();

  requestAnimationFrame(loop);
}
```

### 9.2 글자 그리기

```js
function drawChar(ch) {
  ctx.save();
  ctx.translate(ch.position.x, ch.position.y);
  ctx.rotate(ch.rotation);
  ctx.globalAlpha = ch.opacity;
  ctx.font = `${CHAR_SIZE}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch.char, 0, 0);
  ctx.restore();
}
```

### 9.3 폰트 로딩

Google Fonts를 통한 IBM Plex Mono. `index.html`의 `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
```

폰트가 로드된 후에 첫 렌더링 시작:

```js
document.fonts.ready.then(() => {
  initWalker();
  requestAnimationFrame(loop);
});
```

## 10. 진입 화면

DeviceOrientation 권한 요청은 사용자 제스처 안에서만 가능. 다음의 단순한 진입:

```html
<div id="intro">
  <p>Tap to begin</p>
</div>
```

```css
#intro {
  position: fixed;
  inset: 0;
  background: #000;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "IBM Plex Mono", monospace;
  font-size: 18px;
  cursor: pointer;
}
```

탭하면:

1. 권한 요청
2. 권한 받으면 intro 숨김
3. 캔버스 보이고 walker 시작

## 11. iOS Safari 풀스크린 설정

`index.html`의 `<head>`에:

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Footing">
<link rel="apple-touch-icon" href="/icon.png">
<title>Footing</title>
```

사용자가 Safari에서 "공유 → 홈 화면에 추가"를 하면 풀스크린으로 작동. 사용자 세션에서는 이걸 미리 해두고 진행.

## 12. 캔버스 설정

```js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
}
window.addEventListener('resize', resize);
resize();
```

레티나 디스플레이에서 선명하게 보이려면 `devicePixelRatio` 적용 필수.

## 13. 개발 일정

### Phase 1: 기초 (Day 1–3)

- Day 1: 프로젝트 세팅, HTML/CSS 골격, 폰트 로딩, 검은 배경에 흰 글자 "Hello" 띄우기, iPad Safari에서 확인
- Day 2: DeviceOrientation 권한 요청, 각도 데이터 받기, 화면에 실시간 roll/pitch 숫자 표시해서 확인. ngrok이나 mkcert로 HTTPS 설정
- Day 3: 글자 좌표 배열 정의, 사람 형상을 정적으로 화면에 띄우기, 좌표 미세 조정

### Phase 2: 핵심 (Day 4–7)

- Day 4: WALKING 상태 — 호흡과 걷는 리듬 애니메이션
- Day 5: TILTING 상태 — 기울임에 따른 전체 회전, 진동
- Day 6: FALLING 상태 — 중력, 회전, opacity 변화
- Day 7: SHATTERED + REFORMING — 5초 대기, 재구성 애니메이션

### Phase 3: 디테일 (Day 8–10)

- Day 8: 임계치 조정 (실제 들고 테스트하면서). 각 상태의 느낌 다듬기
- Day 9: 시각 디테일 — opacity 변화 곡선, 회전 자연스러움, 재구성 이징
- Day 10: 진입 화면, 풀스크린, PWA 설정. iPad에 설치해서 최종 확인

### Phase 4: 일지와 세션 준비 (Day 11–12)

- Day 11: 디자인 일지 작성 — 만들면서 한 모든 결정과 그 근거를 기록
- Day 12: 사용자 세션 프로토콜, 영상 녹화 세팅, 인터뷰 질문 준비

총 12일 (약 2주). 디자인 학교 일정에서 현실적인 범위.

## 14. 주의사항

**자이로 캘리브레이션 문제.** iPad를 어떻게 들고 있느냐가 기준점에 영향을 줘. 사용자가 평소 들고 보는 각도 (보통 약간 앞으로 기울어진 상태)가 0도가 되어야 자연스러움. 해결: 진입 후 첫 0.5초의 각도를 기준 자세로 저장하고, 이후 그 기준으로부터의 상대 각도를 사용. `config.js`에 이 기능 토글 가능하게.

**60fps 유지.** 글자 수가 67개 정도라 큰 문제 없을 것. 캔버스 `fillRect` 한 번으로 전체 클리어하고, 각 글자를 한 번씩 그리면 충분.

**iPad 가로 vs 세로.** 세로 모드 기준으로 좌표 설계. 사용자가 가로로 들면 사람이 누워있는 형상이 됨 — 이걸 원래 그렇다로 받아들일지, 처음부터 세로로 고정할지 결정 필요. 권유: 자동 회전 방지를 위해 진입 시 세로 모드를 권장하는 안내. 강제하지는 않음.

**디버그 모드.** 개발 중 임계치와 각도를 화면에 표시할 수 있는 디버그 오버레이. `?debug=1` URL 파라미터로 켜기:

```js
if (new URLSearchParams(location.search).get('debug')) {
  drawDebugInfo(); // 현재 상태, roll, pitch, tilt 총합 표시
}
```

## 15. 코드 시작점

준비됐으면 `index.html`, `style.css`, `main.js`, `config.js` 네 파일의 작동하는 첫 버전을 작성해줄 수 있어. Phase 1 Day 1–3에 해당하는 — 검은 화면에 사람 형상이 정적으로 떠 있고, 자이로 데이터를 받는 — 골격까지.
