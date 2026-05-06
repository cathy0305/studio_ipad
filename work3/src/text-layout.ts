// Pretext로 텍스트를 segment 단위로 측정하고
// 각 segment의 화면 좌표를 계산해서 파티클 초기 데이터를 만든다.

import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

export type Particle = {
  char: string
  // 원래 자리 (홈 포지션)
  homeX: number
  homeY: number
  // 현재 위치 (글자 중앙 기준)
  x: number
  y: number
  // 속도
  vx: number
  vy: number
  // 측정값
  width: number     // segment 폭
  halfH: number     // 글자 높이의 절반 (충돌 처리용)
  // 상태
  freed: boolean    // 자리에서 이탈했는가
  settled: boolean  // 정착(정지)했는가
  // 시각
  rotation: number  // 누적 회전
  // 식별
  index: number
  // 글자별 작은 랜덤 (떨림/타이밍 분산)
  jitter: number
}

export type LayoutOptions = {
  text: string
  font: string         // canvas font 문자열, 예: '28px "Pretendard Variable"'
  fontSize: number
  lineHeight: number
  maxWidth: number
  // 텍스트 블록의 좌상단 위치
  blockX: number
  blockY: number
  // 텍스트 정렬
  align?: 'center' | 'left'
}

export type LayoutResult = {
  particles: Particle[]
  blockHeight: number
}

/**
 * Pretext로 텍스트를 라인 단위로 줄바꿈하고, 각 segment를 파티클로 변환한다.
 *
 * 각 파티클의 (homeX, homeY)는 글자의 중앙(centroid) 좌표 — 회전과 충돌을 다루기 좋게.
 */
export function buildParticles(opts: LayoutOptions): LayoutResult {
  const { text, font, fontSize, lineHeight, maxWidth, blockX, blockY } = opts
  const align = opts.align ?? 'center'

  const prepared = prepareWithSegments(text, font)

  // 내부 PreparedCore 필드 — 공개 타입에는 없지만 런타임에 존재
  const segments = (prepared as unknown as { segments: string[] }).segments
  const widths = (prepared as unknown as { widths: number[] }).widths

  const { lines, height } = layoutWithLines(prepared, maxWidth, lineHeight)

  const particles: Particle[] = []
  let runningIndex = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lineY = blockY + li * lineHeight + lineHeight / 2 // 줄 중앙
    const startX =
      align === 'center'
        ? blockX + (maxWidth - line.width) / 2
        : blockX

    let x = startX
    const startSeg = line.start.segmentIndex
    const endSeg = line.end.segmentIndex
    for (let s = startSeg; s < endSeg; s++) {
      const seg = segments[s]
      const w = widths[s]

      // 빈 segment(폭 0)도 있을 수 있음 → 건너뜀
      if (!seg) {
        x += w
        continue
      }

      const cx = x + w / 2
      const cy = lineY

      particles.push({
        char: seg,
        homeX: cx,
        homeY: cy,
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        width: w,
        halfH: fontSize * 0.5,
        freed: false,
        settled: false,
        rotation: 0,
        index: runningIndex++,
        jitter: (Math.random() - 0.5) * 2, // -1..1
      })

      x += w
    }
  }

  return { particles, blockHeight: height }
}
