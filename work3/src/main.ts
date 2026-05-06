// 진입점. 자이로 권한, Pretext 레이아웃, 물리 루프, Canvas 렌더링.

import { buildParticles, type Particle } from './text-layout.ts'
import { step, DEFAULT_PHYSICS, type Vec2 } from './physics.ts'
import { Renderer } from './renderer.ts'

// === 설정 ===
const TEXT = '이 글자들은 지금 당신이 들고 있는 힘으로 여기 있습니다.'
const FONT_FAMILY = '"Pretendard Variable", -apple-system, system-ui, sans-serif'
const FONT_SIZE = 28
const LINE_HEIGHT = FONT_SIZE * 1.85
const TEXT_COLOR = '#1A1A1A'
const BG_COLOR = '#FAFAFA'
// 중력 변환 — sin(angle) * GRAVITY_PX = 가속도(px/s²). 90° 기울임에서 GRAVITY_PX.
const GRAVITY_PX = 1600
// 가속도 임계 (releaseThreshold) — DEFAULT_PHYSICS.releaseThreshold 사용
const DEBUG = new URLSearchParams(location.search).has('debug')

// === DOM ===
const canvas = document.getElementById('scene') as HTMLCanvasElement
const entry = document.getElementById('entry') as HTMLElement
const debugEl = document.getElementById('debug') as HTMLElement

const renderer = new Renderer(canvas)

// === 상태 ===
let particles: Particle[] = []
const gravity: Vec2 = { x: 0, y: 0 }
let baseBeta = 0
let baseGamma = 0
let calibrated = false
let started = false

// === 레이아웃 ===
function relayout(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.resize(w, h)

  // 텍스트 블록: 가로 80%, 화면 위쪽 25% 위치에서 시작 (떨어질 공간 확보)
  const blockMaxWidth = Math.min(w * 0.84, 720)
  const blockX = (w - blockMaxWidth) / 2
  const blockY = h * 0.22

  const result = buildParticles({
    text: TEXT,
    font: `${FONT_SIZE}px ${FONT_FAMILY}`,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    maxWidth: blockMaxWidth,
    blockX,
    blockY,
    align: 'center',
  })
  particles = result.particles
}

// === 자이로 ===
async function requestGyroPermission(): Promise<boolean> {
  try {
    const D = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    if (typeof D.requestPermission === 'function') {
      const r = await D.requestPermission()
      if (r !== 'granted') return false
    }
    window.addEventListener('deviceorientation', onOrientation, true)
    return true
  } catch (e) {
    console.warn('gyro permission error', e)
    return false
  }
}

function onOrientation(event: DeviceOrientationEvent): void {
  if (event.beta == null || event.gamma == null) return
  if (!calibrated) {
    baseBeta = event.beta
    baseGamma = event.gamma
    calibrated = true
  }
  const beta = (event.beta - baseBeta) * Math.PI / 180
  const gamma = (event.gamma - baseGamma) * Math.PI / 180
  // sin(angle) → 0..1 (90도에서 1)
  gravity.x = Math.sin(gamma) * GRAVITY_PX
  gravity.y = Math.sin(beta) * GRAVITY_PX
}

// === 데스크탑 디버그: 마우스 위치로 중력 시뮬 ===
function setupMouseGravity(): void {
  window.addEventListener('mousemove', e => {
    if (!DEBUG && started) return // 디버그 모드 또는 자이로 안 붙은 상태에서만
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    // 중심 → 마우스 방향으로 중력
    const dx = (e.clientX - cx) / cx
    const dy = (e.clientY - cy) / cy
    gravity.x = Math.max(-1, Math.min(1, dx)) * GRAVITY_PX
    gravity.y = Math.max(-1, Math.min(1, dy)) * GRAVITY_PX
  })
}

// === 메인 루프 ===
let lastTime = performance.now()

function loop(now: number): void {
  const dt = Math.max(0, (now - lastTime) / 1000)
  lastTime = now

  step(
    particles,
    gravity,
    renderer.width,
    renderer.height,
    dt,
    DEFAULT_PHYSICS,
  )

  renderer.draw(particles, {
    font: `${FONT_SIZE}px ${FONT_FAMILY}`,
    color: TEXT_COLOR,
    background: BG_COLOR,
  })

  if (DEBUG) {
    const mag = Math.hypot(gravity.x, gravity.y)
    debugEl.textContent =
      `g.x ${gravity.x.toFixed(0)}\n` +
      `g.y ${gravity.y.toFixed(0)}\n` +
      `mag ${mag.toFixed(0)}\n` +
      `freed ${particles.filter(p => p.freed).length}/${particles.length}`
  }

  requestAnimationFrame(loop)
}

// === 진입 플로우 ===
async function start(): Promise<void> {
  if (started) return
  started = true
  await requestGyroPermission() // 거부되어도 진행

  entry.classList.add('hidden')

  // 폰트 로드 후 레이아웃 — Pretext가 측정한 폭이 정확하려면 폰트가 로드돼 있어야 함
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready
  }
  relayout()
  lastTime = performance.now()
  requestAnimationFrame(loop)
}

// === 이벤트 ===
entry.addEventListener('click', start, { once: true })
entry.addEventListener('touchend', start, { once: true })

window.addEventListener('resize', () => {
  if (started) relayout()
})

if (DEBUG) {
  debugEl.classList.add('visible')
  setupMouseGravity()
}

// 폰트 로드 실패 등 대비 — 데스크탑에서 디버그 키로 시작 가능 (스페이스바)
window.addEventListener('keydown', e => {
  if (e.key === ' ' && !started) start()
})

// 캔버스를 일단 한 번 사이즈 잡아둠 (진입 화면일 때도)
renderer.resize(window.innerWidth, window.innerHeight)
