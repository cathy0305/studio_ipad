// Canvas 2D로 글자 파티클을 그린다. devicePixelRatio로 Retina 대응.

import type { Particle } from './text-layout.ts'

export type RenderConfig = {
  font: string
  color: string
  background: string
}

export class Renderer {
  ctx: CanvasRenderingContext2D
  canvas: HTMLCanvasElement
  width = 0
  height = 0
  dpr = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx
  }

  /** CSS 픽셀 → 백킹 픽셀 매핑. resize / 회전 시 호출. */
  resize(cssWidth: number, cssHeight: number): void {
    this.width = cssWidth
    this.height = cssHeight
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(cssWidth * this.dpr)
    this.canvas.height = Math.round(cssHeight * this.dpr)
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    // 기본 스케일을 dpr로 — 이후 그릴 때는 CSS 픽셀 좌표 사용
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  draw(particles: Particle[], cfg: RenderConfig): void {
    const { ctx } = this
    ctx.clearRect(0, 0, this.width, this.height)
    // 배경은 body가 그려주므로 canvas는 투명 유지
    ctx.font = cfg.font
    ctx.fillStyle = cfg.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (const p of particles) {
      const opacity = p.settled ? 0.4 : 1.0
      if (p.freed) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = opacity
        ctx.fillText(p.char, 0, 0)
        ctx.restore()
      } else {
        ctx.globalAlpha = 1.0
        ctx.fillText(p.char, p.x, p.y)
      }
    }
    ctx.globalAlpha = 1.0
  }
}
