import type { CutId, Design, Stock } from './domain.js'

/** Target elevations. x runs along grain; z runs from the near cheek to the far cheek. */
export function blueprint(design: Design, stock: Stock, selected: CutId): string {
  const { length, tenonLength, tenonWidth } = design
  const shoulder = length - tenonLength
  const near = (stock.width - tenonWidth) / 2
  function line(x1: number, y1: number, x2: number, y2: number, id: CutId) {
    const path = `M${x1} ${y1}L${x2} ${y2}`
    return `<g data-cut="${id}"><path class="hit" d="${path}"/><path class="${id === selected ? 'focus' : 'seam'}" d="${path}"/></g>`
  }
  const label = (x: number, y: number, t: string) =>
    `<text x="${x}" y="${y}" text-anchor="middle">${t}</text>`
  function elevation(name: string, width: number, height: number, draw: (k: number) => string, wide = false) {
    const sheetWidth = wide ? 270 : 170
    const k = Math.min((sheetWidth - 28) / width, (wide ? 63 : 48) / height)
    return `<figure><figcaption>${name}</figcaption><svg viewBox="0 0 ${sheetWidth} ${wide ? 88 : 74}" role="img" aria-label="${name}，尺寸为毫米"><g transform="translate(${(sheetWidth - width * k) / 2},5)">${draw(k)}</g></svg></figure>`
  }
  const top = elevation(
    '俯视 · 长 × 宽',
    length,
    stock.width,
    (k) => {
      const [x, s, w, a, b] = [length, shoulder, stock.width, near, near + tenonWidth].map((v) => v * k)
      return `<path class="outline" d="M0 0H${s}V${a}H${x}V${b}H${s}V${w}H0Z"/>${line(s, 0, s, a, 'shoulderFar')}${line(s, b, s, w, 'shoulderNear')}${line(s, b, x, b, 'cheekNear')}${line(s, a, x, a, 'cheekFar')}${line(x, a, x, b, 'trim')}${label(s / 2, w + 13, `${shoulder} mm`)}${label((s + x) / 2, w + 13, `${tenonLength}`)}`
    },
    true,
  )
  const side = elevation('侧视 · 长 × 高', length, stock.height, (k) => {
    const x = length * k,
      h = stock.height * k,
      s = shoulder * k
    return `<rect class="outline" width="${x}" height="${h}"/>${line(s, 0, s, h, selected === 'shoulderFar' ? 'shoulderFar' : 'shoulderNear')}${line(x, 0, x, h, 'trim')}${label(x / 2, h + 14, `总长 ${length} mm`)}`
  })
  const end = elevation('端视 · 宽 × 高', stock.width, stock.height, (k) => {
    const w = stock.width * k,
      h = stock.height * k,
      a = near * k,
      b = (near + tenonWidth) * k
    return `<rect class="outline" width="${w}" height="${h}"/><rect class="tongue" x="${a}" width="${b - a}" height="${h}"/>${line(a, 0, a, h, 'cheekNear')}${line(b, 0, b, h, 'cheekFar')}${label(w / 2, h + 14, `榫宽 ${tenonWidth} mm`)}`
  })
  return top + side + end
}
