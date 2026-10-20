/**
 * The two questions a theme has to answer, answered numerically.
 *
 * The app's themes are sets of tokens, and a token set is only good if the
 * surfaces it draws are *visible* and the text on them is *readable*. Both of
 * those are questions about contrast, and both have a number. This is where
 * that number comes from, so the rules can be checked rather than argued
 * about — by `theme.test.ts`, which is the thing that stops a new palette from
 * being broken in one mode and fine in the other.
 *
 * The conversions are the standard ones: OKLCH to sRGB, and the WCAG
 * relative-luminance contrast ratio. A colour in the app is an OKLCH value
 * with an optional alpha, because that is what the stylesheet holds.
 */

/** A colour, as sRGB in the 0–1 range with an alpha. */
export type Rgba = { r: number; g: number; b: number; a: number }

/** The channels of an OKLCH colour. */
export type Oklch = { l: number; c: number; h: number }

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * OKLCH to sRGB.
 *
 * The gamut is clipped rather than mapped: a theme token that falls outside
 * sRGB is a token the browser will clip anyway, and clipping it here means
 * the number the rules are checked against is the number that gets painted.
 */
export function oklchToRgba({ l, c, h }: Oklch, alpha = 1): Rgba {
  const hue = (h * Math.PI) / 180
  const a = c * Math.cos(hue)
  const b = c * Math.sin(hue)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ * l_ * l_
  const m3 = m_ * m_ * m_
  const s3 = s_ * s_ * s_

  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]

  const gamma = (v: number) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055

  return {
    r: clamp(gamma(linear[0]), 0, 1),
    g: clamp(gamma(linear[1]), 0, 1),
    b: clamp(gamma(linear[2]), 0, 1),
    a: alpha,
  }
}

/** The relative luminance of a colour, per WCAG. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (v: number) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * The contrast ratio between two opaque colours, per WCAG: 1 is identical,
 * 21 is black on white.
 */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [high, low] = la > lb ? [la, lb] : [lb, la]
  return (high + 0.05) / (low + 0.05)
}

/**
 * The contrast of a colour against the surface it is painted on.
 *
 * A token can be translucent — and the app's edges and surface tints are,
 * because that is how one token covers "a hairline" and "a faint fill" at
 * once — so it has to be laid over the surface before it means anything. A
 * translucent white is not white: over a near-black canvas it is a grey, and
 * over a white one it is white. Measuring it without compositing it would
 * answer a question nobody asked.
 */
export function contrastOn(color: Rgba, surface: Rgba): number {
  return contrastRatio(composite(color, surface), surface)
}

/** A colour laid over another one, which is what an alpha does. */
export function composite(over: Rgba, under: Rgba): Rgba {
  const alpha = over.a + under.a * (1 - over.a)
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
  return {
    r: (over.r * over.a + under.r * under.a * (1 - over.a)) / alpha,
    g: (over.g * over.a + under.g * under.a * (1 - over.a)) / alpha,
    b: (over.b * over.a + under.b * under.a * (1 - over.a)) / alpha,
    a: alpha,
  }
}

/**
 * Parses a colour out of a CSS value.
 *
 * The forms the app's stylesheet actually uses: `oklch()` with an optional
 * percentage or fraction alpha, `rgb()`, and hex. Anything else — a
 * `color-mix()`, a relative colour, a named colour — reads as `null`, because
 * a token the rules cannot read is a token the rules cannot check, and the
 * test says so rather than skipping it silently.
 */
export function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase()
  if (!text) return null

  if (text.startsWith("#")) {
    const hex = text.slice(1)
    const expand = hex.length === 3 || hex.length === 4
    const part = (index: number) => {
      const slice = hex.slice(index * (expand ? 1 : 2), index * (expand ? 1 : 2) + (expand ? 1 : 2))
      const value = Number.parseInt(expand ? slice + slice : slice, 16)
      return Number.isNaN(value) ? 0 : value / 255
    }
    if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) {
      return null
    }
    return {
      r: part(0),
      g: part(1),
      b: part(2),
      a: hex.length === 4 || hex.length === 8 ? part(3) : 1,
    }
  }

  const functional = text.match(/^(oklch|rgb|rgba)\((.*)\)$/)
  if (!functional) return null
  const name = functional[1]
  const body = functional[2]

  const [colourPart, alphaPart] = body.split("/")
  const parts = colourPart.trim().split(/[\s,]+/).filter(Boolean)

  const alpha = alphaPart
    ? alphaPart.trim().endsWith("%")
      ? Number.parseFloat(alphaPart) / 100
      : Number.parseFloat(alphaPart)
    : 1

  if (name === "oklch") {
    if (parts.length < 3) return null
    const l = parts[0].endsWith("%") ? Number.parseFloat(parts[0]) / 100 : Number.parseFloat(parts[0])
    const c = parts[1].endsWith("%") ? Number.parseFloat(parts[1]) / 100 : Number.parseFloat(parts[1])
    const h = parts[2].endsWith("deg") ? Number.parseFloat(parts[2]) : Number.parseFloat(parts[2])
    if ([l, c, h, alpha].some((n) => Number.isNaN(n))) return null
    return oklchToRgba({ l, c, h }, alpha)
  }

  if (parts.length < 3) return null
  const channel = (raw: string) =>
    raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw) / 255
  const [r, g, b] = parts.slice(0, 3).map(channel)
  if ([r, g, b, alpha].some((n) => Number.isNaN(n))) return null
  return { r, g, b, a: alpha }
}

/** The colour a token paints, once it is laid over the surface beneath it. */
export function flatten(color: Rgba, under: Rgba): Rgba {
  return composite(color, under)
}
