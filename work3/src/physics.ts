// 글자 파티클의 물리 시뮬레이션.
// 입력: 중력 벡터 (px/s²), dt(s)
// 단계: 자유낙하 판정 → 가속도 적분 → 마찰 → 경계 충돌 → 글자간 충돌 → 정착 판정

import type { Particle } from './text-layout.ts'

export type Vec2 = { x: number; y: number }

export type PhysicsConfig = {
  // 글자가 자리를 떠나는 임계 가속도(px/s²). 이 미만이면 떨림만.
  releaseThreshold: number
  // 마찰 계수 (1 프레임당 곱해지는 비율) — 작을수록 빨리 멈춤
  friction: number
  // 경계 충돌 반발계수
  bounce: number
  // 떨림 진폭 (releaseThreshold 미만일 때 사용)
  shakeAmplitude: number
  // 정착 판정 속도 임계
  settleSpeed: number
  // 자유낙하 시 트리거되는 약간의 초기 속도 (정적인 출발 방지)
  freeKick: number
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  releaseThreshold: 320,
  friction: 0.985,
  bounce: 0.28,
  shakeAmplitude: 0.012, // 가속도에 곱해서 px 단위 미세이동량으로 변환
  settleSpeed: 14,
  freeKick: 18,
}

/** 글자가 자리를 떠나는지 판정. 중력 방향 기준 "선두" 글자가 먼저 떠난다. */
export function updateRelease(
  particles: Particle[],
  gravity: Vec2,
  cfg: PhysicsConfig,
): void {
  const mag = Math.hypot(gravity.x, gravity.y)
  if (mag < cfg.releaseThreshold * 0.6) return // 충분히 약하면 누구도 자유 안됨

  const ux = gravity.x / mag
  const uy = gravity.y / mag

  // 모든 파티클의 home 위치를 gravity 방향으로 투영해서 0..1로 정규화
  let minP = Infinity
  let maxP = -Infinity
  for (const p of particles) {
    const proj = p.homeX * ux + p.homeY * uy
    if (proj < minP) minP = proj
    if (proj > maxP) maxP = proj
  }
  const span = maxP - minP || 1

  for (const p of particles) {
    if (p.freed) continue
    const proj = p.homeX * ux + p.homeY * uy
    const lead = (proj - minP) / span // 0(=후미) ~ 1(=선두)
    // 선두는 임계의 70%, 후미는 130%에서 자유.
    // 글자별 jitter로 ±10% 변동 — 동시에 떨어지지 않게.
    const localThreshold =
      cfg.releaseThreshold * (1.3 - lead * 0.6 + p.jitter * 0.1)
    if (mag > localThreshold) {
      p.freed = true
      // 살짝 초기 속도 + 랜덤한 회전 시드
      p.vx += ux * cfg.freeKick + p.jitter * 8
      p.vy += uy * cfg.freeKick + Math.abs(p.jitter) * 4
    }
  }
}

/** 자유 상태인 파티클에 가속도 적분 + 마찰. 정적인 글자는 떨림만. */
export function integrate(
  particles: Particle[],
  gravity: Vec2,
  dt: number,
  cfg: PhysicsConfig,
): void {
  const mag = Math.hypot(gravity.x, gravity.y)

  for (const p of particles) {
    if (p.settled) continue

    if (!p.freed) {
      // 미세 떨림 — 중력 강도에 비례해서 home에서 살짝 흔들림
      const offX = gravity.x * cfg.shakeAmplitude
      const offY = gravity.y * cfg.shakeAmplitude
      const wob =
        Math.sin(performance.now() * 0.012 + p.index * 0.7) *
        Math.min(1, mag / 200)
      p.x = p.homeX + offX + wob * 1.5 * p.jitter
      p.y = p.homeY + offY + wob * 1.0 * p.jitter
      continue
    }

    // 가속도 적분
    p.vx += gravity.x * dt
    p.vy += gravity.y * dt

    // 마찰 — 프레임 보정 (60fps 기준 cfg.friction을 dt에 맞게 적용)
    const fr = Math.pow(cfg.friction, dt * 60)
    p.vx *= fr
    p.vy *= fr

    p.x += p.vx * dt
    p.y += p.vy * dt

    // 회전 — 속도가 클수록 더 회전. 살짝 angular velocity처럼.
    const speed = Math.hypot(p.vx, p.vy)
    p.rotation += (p.jitter * speed * dt * 0.012)
  }
}

/** 화면 경계 충돌. */
export function resolveBounds(
  particles: Particle[],
  width: number,
  height: number,
  cfg: PhysicsConfig,
): void {
  for (const p of particles) {
    if (!p.freed) continue
    const r = Math.max(p.width, p.halfH * 2) * 0.5

    if (p.x - r < 0) {
      p.x = r
      p.vx = -p.vx * cfg.bounce
    } else if (p.x + r > width) {
      p.x = width - r
      p.vx = -p.vx * cfg.bounce
    }
    if (p.y - r < 0) {
      p.y = r
      p.vy = -p.vy * cfg.bounce
    } else if (p.y + r > height) {
      p.y = height - r
      p.vy = -p.vy * cfg.bounce
    }
  }
}

/** 글자끼리 원형 충돌로 겹침 해소. 단순 1패스. */
export function resolveCollisions(particles: Particle[]): void {
  const n = particles.length
  for (let i = 0; i < n; i++) {
    const a = particles[i]
    if (!a.freed) continue
    const ar = Math.max(a.width, a.halfH * 2) * 0.42
    for (let j = i + 1; j < n; j++) {
      const b = particles[j]
      if (!b.freed) continue
      const br = Math.max(b.width, b.halfH * 2) * 0.42

      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist2 = dx * dx + dy * dy
      const minDist = ar + br
      if (dist2 >= minDist * minDist || dist2 === 0) continue

      const dist = Math.sqrt(dist2)
      const overlap = minDist - dist
      const nx = dx / dist
      const ny = dy / dist
      // 위치 보정 — 절반씩 밀어냄
      const push = overlap * 0.5
      a.x -= nx * push
      a.y -= ny * push
      b.x += nx * push
      b.y += ny * push

      // 속도도 살짝 분리 — 1D 탄성 충돌 (n축 방향 성분만)
      const va = a.vx * nx + a.vy * ny
      const vb = b.vx * nx + b.vy * ny
      const restitution = 0.3
      const exch = (vb - va) * restitution
      a.vx += nx * exch
      a.vy += ny * exch
      b.vx -= nx * exch
      b.vy -= ny * exch
    }
  }
}

/** 속도가 충분히 작고 경계나 다른 글자 위에 있으면 정착시킴. */
export function updateSettle(
  particles: Particle[],
  width: number,
  height: number,
  gravity: Vec2,
  cfg: PhysicsConfig,
): void {
  const mag = Math.hypot(gravity.x, gravity.y)
  // 중력이 거의 없으면 정착시키지 않음 (수평 복귀 시 글자가 영원히 안정)
  // 대신, 중력이 있는데도 속도가 죽었으면 = 어딘가 막혀있음 = 정착
  if (mag < 50) return

  for (const p of particles) {
    if (!p.freed || p.settled) continue
    const speed = Math.hypot(p.vx, p.vy)
    if (speed > cfg.settleSpeed) continue

    const r = Math.max(p.width, p.halfH * 2) * 0.5
    const atBound =
      p.x - r <= 1 || p.x + r >= width - 1 ||
      p.y - r <= 1 || p.y + r >= height - 1
    if (atBound) {
      p.settled = true
      p.vx = 0
      p.vy = 0
    }
  }
}

export function step(
  particles: Particle[],
  gravity: Vec2,
  width: number,
  height: number,
  dt: number,
  cfg: PhysicsConfig,
): void {
  // dt 너무 큰 프레임(탭 백그라운드 등)은 잘라서 안정성 확보
  const clamped = Math.min(dt, 1 / 30)
  updateRelease(particles, gravity, cfg)
  integrate(particles, gravity, clamped, cfg)
  resolveCollisions(particles)
  resolveBounds(particles, width, height, cfg)
  updateSettle(particles, width, height, gravity, cfg)
}
