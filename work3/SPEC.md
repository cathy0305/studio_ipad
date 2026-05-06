# 작품 — 흘러내리는 텍스트
## Pretext 기반 기획 + 개발 명세서

---

## 컨셉

아이패드를 기울이면 글자가 중력을 받아 흘러내린다. 뒤집으면 쏟아진다. 되돌릴 수 없다.

---

## 왜 Pretext인가

Pretext는 Cheng Lou가 만든 DOM-free 텍스트 레이아웃 엔진이다. 글자 하나하나의 위치를 Canvas 위에서 완전히 제어할 수 있다. DOM에서 span을 수백 개 만들어 CSS transition으로 흉내 내는 게 아니라, Canvas 위에서 글자별로 물리 시뮬레이션을 돌릴 수 있다.

커뮤니티 데모에 이미 gravity(중력 낙하), explode(폭발), vortex(소용돌이) 같은 텍스트 물리 효과가 있다. 이 작품은 거기에 아이패드 자이로스코프를 연결해서, 기울기 = 중력 방향으로 만드는 것이다.

핵심 차이: CSS로 만들면 "글자가 이동하는" 느낌이지만, Pretext + Canvas + 물리 엔진으로 만들면 "글자가 쏟아지는" 느낌이 된다. 질량, 속도, 충돌, 마찰이 있는 글자.

---

## 경험 시나리오

### 시작
아이패드를 수평으로 들고 있으면, 화면에 텍스트가 정상적으로 보인다. 깔끔한 타이포그래피. 아무런 이상 없음.

### 미세한 기울임 (5~15도)
글자들이 살짝 불안해진다. 미세하게 떨리거나, 기울기 방향으로 아주 조금 밀린다. "어?" 수준. 아직 읽을 수 있다.

### 분명한 기울임 (15~40도)
글자가 자리를 이탈한다. 아래쪽 글자부터 하나둘 떨어져 나가기 시작. 각 글자는 질량을 가진 것처럼 가속하며 미끄러진다. 글자끼리 부딪히고, 화면 가장자리에 쌓인다. 문장의 구조가 무너진다.

### 크게 기울임 / 뒤집기 (40도 이상)
글자가 전부 쏟아진다. 화면 아래쪽(중력 방향)에 글자들이 뒤죽박죽 쌓인다. 더 이상 문장이 아니라 글자의 잔해.

### 수평 복귀
다시 수평으로 돌려놓으면 — 글자가 제자리로 돌아오지 않는다. 쏟아진 곳에 그대로 쌓여 있다. 원래 문장은 이미 사라졌다.

---

## 기술 구현

### 스택

| 구분 | 기술 |
|------|------|
| 텍스트 레이아웃 | @chenglou/pretext |
| 렌더링 | Canvas 2D |
| 물리 시뮬레이션 | 자체 구현 (간단한 verlet integration) |
| 센서 | DeviceOrientationEvent (자이로스코프) |
| 빌드 | Vite |
| 배포 | GitHub Pages |

### 아키텍처

```
자이로스코프 (beta, gamma)
      │
      ▼
중력 벡터 계산 (gx, gy)
      │
      ▼
물리 시뮬레이션 (글자별 위치, 속도, 충돌)
      │
      ▼
Canvas 렌더링 (requestAnimationFrame)
```

### Pretext 사용법

```javascript
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

// 1. 텍스트 준비 — 글자별 위치 계산
const prepared = prepareWithSegments(text, '24px Pretendard')
const lines = layoutWithLines(prepared, canvasWidth, lineHeight)

// 2. 각 글자를 물리 파티클로 변환
//    prepared.segments[i] = i번째 segment의 텍스트 (글자/이모지 단위)
//    prepared.widths[i]   = i번째 segment의 측정된 폭
//    line.start/end       = segments 배열 안에서의 cursor (segmentIndex)
const particles = []
for (const line of lines) {
  let x = lineStartX
  for (let s = line.start.segmentIndex; s < line.end.segmentIndex; s++) {
    const seg = prepared.segments[s]
    const w = prepared.widths[s]
    particles.push({
      char: seg,
      homeX: x, homeY: line.y,
      x, y: line.y,
      vx: 0, vy: 0,
      mass: 1, friction: 0.95,
      width: w,
      settled: false, freed: false,
    })
    x += w
  }
}
```

### 물리 시뮬레이션

```javascript
function updatePhysics(particles, gravity, dt) {
  for (const p of particles) {
    if (p.settled) continue

    // 기울기 강도가 임계값을 넘으면 글자가 해방됨
    const tiltMagnitude = Math.sqrt(gravity.x ** 2 + gravity.y ** 2)

    if (!p.freed && tiltMagnitude > RELEASE_THRESHOLD) {
      // 아래쪽 글자(y가 큰 글자)부터 먼저 해방
      const positionFactor = p.homeY / canvasHeight
      if (tiltMagnitude > RELEASE_THRESHOLD * (1 - positionFactor * 0.5)) {
        p.freed = true
      }
    }

    if (!p.freed) {
      // 해방되지 않은 글자: 원래 자리에서 미세하게 떨림
      p.x = p.homeX + (tiltMagnitude * gravity.x * 3)
      p.y = p.homeY + (tiltMagnitude * gravity.y * 3)
      continue
    }

    // 해방된 글자: 중력 + 마찰 + 충돌
    p.vx += gravity.x * GRAVITY_STRENGTH * dt
    p.vy += gravity.y * GRAVITY_STRENGTH * dt

    p.vx *= p.friction
    p.vy *= p.friction

    p.x += p.vx * dt
    p.y += p.vy * dt

    // 화면 경계 충돌
    if (p.x < 0) { p.x = 0; p.vx *= -0.3 }
    if (p.x > canvasWidth) { p.x = canvasWidth; p.vx *= -0.3 }
    if (p.y < 0) { p.y = 0; p.vy *= -0.3 }
    if (p.y > canvasHeight) { p.y = canvasHeight; p.vy *= -0.3 }

    // 속도가 거의 0이면 정착
    if (Math.abs(p.vx) < 0.1 && Math.abs(p.vy) < 0.1 &&
        isAtBoundary(p)) {
      p.settled = true
    }
  }

  // 글자 간 충돌
  resolveCollisions(particles)
}
```

### 자이로 → 중력 벡터 변환

```javascript
function handleOrientation(event) {
  const beta = event.beta   // 앞뒤 (-180 ~ 180)
  const gamma = event.gamma // 좌우 (-90 ~ 90)

  const betaRad = beta * Math.PI / 180
  const gammaRad = gamma * Math.PI / 180

  // 중력 벡터 (화면 좌표계)
  gravity.x = Math.sin(gammaRad) * 9.8
  gravity.y = Math.sin(betaRad) * 9.8
}
```

### Canvas 렌더링

```javascript
function render(ctx, particles) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  ctx.font = '24px Pretendard'
  ctx.fillStyle = '#1A1A1A'
  ctx.textBaseline = 'alphabetic'

  for (const p of particles) {
    if (p.freed) {
      ctx.save()
      ctx.translate(p.x, p.y)
      const rotation = Math.atan2(p.vy, p.vx) * 0.1
      ctx.rotate(rotation)
      ctx.globalAlpha = p.settled ? 0.4 : 1.0
      ctx.fillText(p.char, 0, 0)
      ctx.restore()
    } else {
      ctx.fillText(p.char, p.x, p.y)
    }
  }
}
```

---

## 텍스트 내용

짧되 읽고 싶어지는 텍스트. 30~50자.

**후보 A — 자기지시적 텍스트**
> 이 글자들은 지금 당신이 들고 있는 힘으로 여기 있습니다.

**후보 B — 지시문**
> 기울이지 마세요.

**후보 C — 이용약관 (아무도 안 읽는 텍스트)**
> 본 서비스를 이용함으로써 귀하는 다음 조건에 동의하는 것으로 간주됩니다...

---

## 시각 디자인

- Canvas 배경: #FAFAFA
- 글자 색: #1A1A1A
- 폰트: Pretendard 24px (또는 Inter)
- 화면 중앙 상단에 텍스트 배치 (쏟아질 공간 확보)
- 쏟아진 글자: opacity 0.4로 잔해처럼
- 그 외 UI 요소 없음 — 순수하게 텍스트와 빈 화면만

---

## 진입 플로우

```
1. 화면에 "화면을 터치하세요" 한 줄
2. 터치 → iOS 자이로 권한 요청 팝업
3. 허용 → 텍스트가 페이드인으로 나타남
4. 아무 안내 없음. 기울이면 뭐가 되는지 스스로 발견.
```

---

## 파일 구조

```
/work3
├── index.html
├── src/
│   ├── main.ts          — 진입점, 자이로 권한, 이벤트 루프
│   ├── physics.ts       — 물리 시뮬레이션 (중력, 충돌, 마찰)
│   ├── text-layout.ts   — Pretext로 글자별 위치 계산
│   └── renderer.ts      — Canvas 렌더링
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### package.json 핵심

```json
{
  "dependencies": {
    "@chenglou/pretext": "latest"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## 개발 순서

### 1단계: Pretext로 텍스트 배치 (2시간)
- pretext 설치, Canvas에 텍스트 렌더링
- 글자별 위치 추출
- 화면에 정상적인 텍스트가 보이는 상태
- **완료 기준:** Canvas에 한글 텍스트가 깔끔하게 보임

### 2단계: 물리 파티클 시스템 (3시간)
- 각 글자를 파티클로 변환
- 마우스 클릭(데스크톱 테스트용) → 중력 방향 변경
- 중력, 마찰, 경계 충돌 구현
- 글자 간 충돌 (간단한 원형 충돌)
- **완료 기준:** 클릭하면 글자가 쏟아져서 바닥에 쌓임

### 3단계: 자이로 연결 (1시간)
- DeviceOrientationEvent 연결
- iOS 권한 요청 플로우
- 자이로 데이터 → 중력 벡터 매핑
- **완료 기준:** 아이패드를 기울이면 글자가 기울기 방향으로 쏟아짐

### 4단계: 경험 다듬기 (2시간)
- 해방 임계값 조정 (어느 정도 기울여야 글자가 떨어지는가)
- 아래쪽 글자부터 먼저 떨어지는 순서
- 미세 기울임에서의 떨림 효과
- 쏟아진 글자의 시각적 처리 (opacity, 회전)
- 복귀 불가 확인
- 텍스트 내용 결정
- 진입 화면

### 5단계: 배포 (30분)
- Vite build → dist
- GitHub Pages 배포
- 아이패드 Safari에서 최종 확인

---

## 아이패드 Safari 주의사항

- Canvas 해상도: `devicePixelRatio` 적용 (Retina 대응)
- 터치 이벤트로 기본 스크롤/줌 방지
- `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`
- DeviceOrientationEvent.requestPermission()은 반드시 사용자 제스처 안에서 호출
- Canvas 크기: `100dvh` 사용 (Safari 주소창 문제 회피)
- 성능: 글자 50자 이내면 60fps 유지 가능

---

## 테스트 체크리스트

- [ ] 수평 상태에서 텍스트가 정상으로 보이는가
- [ ] 5도 기울임에서 미세한 불안감이 느껴지는가
- [ ] 20도에서 글자가 떨어지기 시작하는가
- [ ] 쏟아지는 방향이 기울기 방향과 일치하는가
- [ ] 글자끼리 쌓이는 느낌이 물리적으로 그럴듯한가
- [ ] 뒤집었을 때 전부 쏟아지는 순간 웃음 또는 놀라움이 오는가
- [ ] 다시 수평으로 해도 복귀하지 않는가
- [ ] 전체 경험이 "버그"가 아니라 "의도"로 읽히는가
- [ ] 60fps가 유지되는가
