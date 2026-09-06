/**
 * shapes — MaterialShapes clips for Retone.
 *
 * Two jobs: (1) static clip-path strings for the hero composition, and
 * (2) a 7-shape morph sequence for the loading indicator. Morphing via CSS
 * clip-path interpolation only works when every polygon has the same
 * vertex count, so the loader sequence is sampled at 24 points each —
 * circles, squircles, polygons, and lobed cookies all reduced to the
 * same representation, then cycled with a CSS transition doing the
 * actual morphing between steps.
 */
import { useEffect, useRef, useState } from "react"
import { prefersReducedMotion } from "./lib/materialEngine"

const fmt = (n: number) => `${Math.round(n * 10) / 10}%`

function toPolygon(pts: Array<[number, number]>): string {
  return `polygon(${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(", ")})`
}

/** Lobed cookie with n folds (9-sided cookie, 6-sided cookie, …). */
export function cookieClip(n: number, wobble = 0.76, R = 48): string {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? R : R * wobble
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)])
  }
  return toPolygon(pts)
}

/** Sunny burst: 12 soft points. */
export function sunnyClip(R = 48, inner = 30): string {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? R : inner
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)])
  }
  return toPolygon(pts)
}

/** Static clips for the hero composition (vertex count is free here). */
export const STATIC_CLIPS = {
  triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  pentagon: "polygon(50% 2%, 98% 37%, 79% 98%, 21% 98%, 2% 37%)",
  gem: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
  crystal: "polygon(50% 0%, 90% 20%, 100% 70%, 50% 100%, 0% 70%, 10% 20%)",
  shield: "polygon(50% 0%, 100% 15%, 85% 75%, 50% 100%, 15% 75%, 0% 15%)",
  flower: "polygon(50% 0%, 65% 15%, 85% 15%, 85% 35%, 100% 50%, 85% 65%, 85% 85%, 65% 85%, 50% 100%, 35% 85%, 15% 85%, 15% 65%, 0% 50%, 15% 35%, 15% 15%, 35% 15%)",
} as const

// ─── Morph-sequence samplers (all 24 points, 0–100 space) ───────────────────

type Pt = [number, number]

function sampleCircle(): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    pts.push([50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)])
  }
  return pts
}

function sampleSquircle(): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    // Superellipse n=4 ≈ rounded square.
    pts.push([
      50 + 46 * Math.sign(c) * Math.sqrt(Math.abs(c)),
      50 + 46 * Math.sign(s) * Math.sqrt(Math.abs(s)),
    ])
  }
  return pts
}

/** Walk a vertex loop uniformly — works for pentagons, gems, anything. */
function sampleLoop(verts: Pt[]): Pt[] {
  const pts: Pt[] = []
  const per = 24 / verts.length
  for (let e = 0; e < verts.length; e++) {
    const [x0, y0] = verts[e]
    const [x1, y1] = verts[(e + 1) % verts.length]
    for (let k = 0; k < per; k++) {
      const t = k / per
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
    }
  }
  return pts.slice(0, 24)
}

/** Smooth lobes: `folds` bumps between rMin and 46. */
function sampleLobes(folds: number, rMin: number, sharpness: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const r =
      rMin +
      (46 - rMin) * Math.pow(Math.abs(Math.cos((folds * a) / 2)), sharpness)
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)])
  }
  return pts
}

const PENTAGON: Pt[] = [
  [50, 4],
  [94, 35],
  [75, 93],
  [25, 93],
  [6, 35],
]
const GEM: Pt[] = [
  [50, 4],
  [90, 36],
  [74, 94],
  [26, 94],
  [10, 36],
]

/**
 * The loader loop: Circle → Cookie(4) → Pentagon → Gem → Cookie(6) →
 * Soft Burst → Pill → Circle. Same vertex count throughout, so CSS
 * interpolates instead of cutting.
 */
export const MORPH_SHAPES: string[] = [
  toPolygon(sampleCircle()),
  toPolygon(sampleSquircle()),
  toPolygon(sampleLoop(PENTAGON)),
  toPolygon(sampleLoop(GEM)),
  toPolygon(sampleLobes(6, 36, 0.8)),
  toPolygon(sampleLobes(12, 30, 0.6)),
  toPolygon(samplePill()),
  toPolygon(sampleCircle()),
]

/** Stadium (pill) outline sampled at 24 points. */
function samplePill(): Pt[] {
  const pts: Pt[] = []
  // Top edge, left → right.
  for (let k = 0; k < 6; k++) pts.push([32 + (36 * k) / 5, 22])
  // Right semicircle, -90° → 90°.
  for (let k = 0; k < 6; k++) {
    const a = (-90 + 36 * k) * (Math.PI / 180)
    pts.push([68 + 28 * Math.cos(a), 50 + 28 * Math.sin(a)])
  }
  // Bottom edge, right → left.
  for (let k = 0; k < 6; k++) pts.push([68 - (36 * k) / 5, 78])
  // Left semicircle, 90° → 270°.
  for (let k = 0; k < 6; k++) {
    const a = (90 + 36 * k) * (Math.PI / 180)
    pts.push([32 + 28 * Math.cos(a), 50 + 28 * Math.sin(a)])
  }
  return pts
}

// ─── Reusable shape-morph loading indicator ─────────────────────────────────

const STEP_MS = 420
const MORPH_MS = 380

/**
 * Real M3 loading indicator behavior: a looping shape morph at 48dp. The
 * interval steps the shape; the CSS transition performs the morph. Static
 * circle under reduced motion. Contained mode switches the shape to
 * on-primary-container for contrast against the container.
 */
export function ShapeMorphLoader({
  size = 48,
  label,
  contained = false,
}: {
  size?: number
  label: string
  contained?: boolean
}) {
  const [reduced] = useState(() => prefersReducedMotion())
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(
      () => setStep((v) => (v + 1) % MORPH_SHAPES.length),
      STEP_MS,
    )
    return () => window.clearInterval(id)
  }, [reduced])

  const shape = (
    <div
      aria-hidden="true"
      className="shape-loader"
      style={{
        width: size,
        height: size,
        background: contained
          ? "var(--md-sys-color-on-primary-container)"
          : "var(--md-sys-color-primary, var(--rt-p))",
        clipPath: MORPH_SHAPES[reduced ? 0 : step],
        transition: reduced
          ? undefined
          : `clip-path ${MORPH_MS}ms linear, background-color var(--transition-theme)`,
      }}
    />
  )

  if (!contained) return shape
  return (
    <div
      className="shape-loader-container"
      style={{ width: size + 16, height: size + 16 }}
    >
      {shape}
    </div>
  )
}

// ─── Contained pull-to-refresh indicator ────────────────────────────────────

const SHOW_DELAY_MS = 200
const MIN_DISPLAY_MS = 400
const EXIT_MS = 340

/**
 * Reusable show/hide pair for short async waits, as one declarative prop:
 * `<RefreshIndicator open={busy} label="…" />`. Opening is delayed 200ms
 * so sub-200ms waits never flash; once visible it stays at least 400ms,
 * then springs back out toward the top. Fixed layer, never blocks input.
 */
export function RefreshIndicator({
  open,
  label,
}: {
  open: boolean
  label: string
}) {
  const [phase, setPhase] = useState<"enter" | "in" | "out" | "gone">("gone")
  const openRef = useRef(open)
  openRef.current = open
  const liveRef = useRef(false)
  const shownAt = useRef(0)
  const gen = useRef(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const myGen = ++gen.current
    const alive = () => gen.current === myGen
    const after = (fn: () => void, ms: number) => {
      timers.current.push(
        window.setTimeout(() => {
          if (alive()) fn()
        }, ms),
      )
    }

    if (open) {
      after(() => {
        if (!openRef.current) return
        shownAt.current = performance.now()
        liveRef.current = true
        setPhase("enter")
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (openRef.current && gen.current === myGen) setPhase("in")
          }),
        )
      }, SHOW_DELAY_MS)
    } else if (liveRef.current) {
      liveRef.current = false
      after(
        () => {
          setPhase("out")
          after(() => setPhase("gone"), EXIT_MS)
        },
        Math.max(0, MIN_DISPLAY_MS - (performance.now() - shownAt.current)),
      )
    }
  }, [open])

  useEffect(
    () => () => {
      gen.current += 1
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  if (phase === "gone") return null
  return (
    <div className="refresh-layer" aria-hidden={phase !== "in"}>
      <div
        className="refresh-pop"
        data-state={phase}
        role={phase === "in" ? "status" : undefined}
        aria-label={phase === "in" ? label : undefined}
      >
        <ShapeMorphLoader size={48} label={label} contained />
      </div>
    </div>
  )
}
