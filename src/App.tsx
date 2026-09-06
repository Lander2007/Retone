import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react"
import type { CSSProperties } from "react"
import {
  generateTonalPalette,
  generateTheme,
  getEngineTheme,
  getHueRamps,
  auditContrast,
  applyThemeRoles,
  transitionTheme,
  prefersReducedMotion,
  readMotionPreference,
  writeMotionPreference,
  type MotionPreference,
  extractCandidates,
  fileToImage,
  ensureContrast,
  toLegacyRoles,
  parseHash,
  writeHash,
  shareUrl,
  seedHct,
  hexFromHct,
  lerpSeedHex,
  ambientSeedForHour,
  rafThrottle,
  VARIANT_LABELS,
  VARIANT_ORDER,
  type EngineTheme,
  type ShareState,
  type SchemeVariant,
  type ColorMode,
  type RoleKey,
  type RoleMap,
} from "./lib/materialEngine"
import { motion } from "framer-motion"
import {
  m3Springs,
  m3ShapeVariants,
  m3ButtonVariants,
  m3CardVariants,
  m3FabVariants,
} from "./lib/motion"
import {
  MButton,
  MCard,
  MChips,
  MFab,
  MIcon,
  MIconButton,
  MSlider,
  MSwitch,
} from "./mw"
import "@material/web/progress/linear-progress.js"
import "@material/web/icon-button/icon-button.js"
import { STATIC_CLIPS, cookieClip, sunnyClip, RefreshIndicator } from "./shapes"

// ─── Legacy shapes (kept for component props; values come from the engine) ────

export interface TonalPalette {
  tone: number
  hex: string
}

export interface ThemeRoles {
  primary: string
  onPrimary: string
  primaryContainer: string
  onPrimaryContainer: string
  secondary: string
  onSecondary: string
  surface: string
  surface1: string
  surface2: string
  surface3: string
  onSurface: string
  onSurfaceVariant: string
  outline: string
  error: string
  seed: string
}

// ─── Theme application ────────────────────────────────────────────────────────
// Roles come from the real HCT engine (see lib/materialEngine). Canonical
// `--md-sys-color-*` vars are written first; legacy `--rt-*` aliases follow
// so existing components keep working untouched.

function applyTheme(t: EngineTheme) {
  const root = document.querySelector(".retone-app") as HTMLElement
  if (!root) return
  applyThemeRoles(root, t)
}

// ─── Component Library ────────────────────────────────────────────────────────

const PRESET_SEEDS = [
  { name: "Violet", hex: "#6750A4" },
  { name: "Emerald", hex: "#00695C" },
  { name: "Flame", hex: "#B5370D" },
  { name: "Azure", hex: "#1565C0" },
  { name: "Rose", hex: "#AD1457" },
]

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API unavailable (permissions / insecure context) — legacy path.
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

// ─── Sections ────────────────────────────────────────────────────────────────

// Hue/sat pad: a real HCT surface (hue × chroma at tone 60) rendered once to
// canvas. Dragging updates the seed live via rAF throttle; arrow keys step
// hue/chroma for keyboard users.
const PAD_W = 240
const PAD_H = 132
const PAD_CELLS_X = 60
const PAD_CELLS_Y = 33
const PAD_MAX_CHROMA = 120

function HueSatPad({
  seed,
  onSeedChange,
  onDragChange,
}: {
  seed: string
  onSeedChange: (hex: string) => void
  onDragChange?: (isDragging: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hct = useMemo(() => seedHct(seed), [seed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const cw = Math.ceil(PAD_W / PAD_CELLS_X)
    const ch = Math.ceil(PAD_H / PAD_CELLS_Y)
    for (let x = 0; x < PAD_CELLS_X; x++) {
      for (let y = 0; y < PAD_CELLS_Y; y++) {
        ctx.fillStyle = hexFromHct(
          (x / (PAD_CELLS_X - 1)) * 360,
          (1 - y / (PAD_CELLS_Y - 1)) * PAD_MAX_CHROMA,
          60,
        )
        ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1)
      }
    }
  }, [])

  const throttled = useMemo(
    () => rafThrottle((hex: string) => onSeedChange(hex)),
    [onSeedChange],
  )

  const pickAt = useCallback(
    (clientX: number, clientY: number, el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
      throttled(hexFromHct(fx * 360, (1 - fy) * PAD_MAX_CHROMA, 60))
    },
    [throttled],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const HUE_STEP = 4
      const CHROMA_STEP = 6
      let hue = hct.hue
      let chroma = hct.chroma
      if (e.key === "ArrowLeft") hue -= HUE_STEP
      else if (e.key === "ArrowRight") hue += HUE_STEP
      else if (e.key === "ArrowUp") chroma += CHROMA_STEP
      else if (e.key === "ArrowDown") chroma -= CHROMA_STEP
      else return
      e.preventDefault()
      hue = ((hue % 360) + 360) % 360
      chroma = Math.min(PAD_MAX_CHROMA, Math.max(0, chroma))
      onSeedChange(hexFromHct(hue, chroma, 60))
    },
    [hct, onSeedChange],
  )

  return (
    <div
      id="hue-pad"
      role="slider"
      tabIndex={0}
      aria-label="Hue and saturation pad. Drag or use arrow keys."
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hct.hue)}
      aria-valuetext={`Hue ${Math.round(hct.hue)} degrees, chroma ${Math.round(hct.chroma)}`}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Older browsers — dragging still works without capture.
        }
        onDragChange?.(true)
        pickAt(e.clientX, e.clientY, e.currentTarget)
      }}
      onPointerUp={() => {
        onDragChange?.(false)
      }}
      onPointerCancel={() => {
        onDragChange?.(false)
      }}
      onLostPointerCapture={() => {
        onDragChange?.(false)
      }}
      onPointerMove={(e) => {
        if (e.buttons) {
          onDragChange?.(true)
          pickAt(e.clientX, e.clientY, e.currentTarget)
        }
      }}
      onKeyDown={onKeyDown}
      className="relative w-full rounded-2xl overflow-hidden touch-none select-none"
      style={{ border: "1px solid var(--rt-surf3)", cursor: "crosshair" }}
    >
      <canvas
        ref={canvasRef}
        width={PAD_W}
        height={PAD_H}
        aria-hidden="true"
        className="block w-full h-auto"
      />
      <span
        aria-hidden="true"
        className="absolute w-4 h-4 rounded-full pointer-events-none"
        style={{
          left: `calc(${(hct.hue / 360) * 100}% - 8px)`,
          top: `calc(${(1 - Math.min(1, hct.chroma / PAD_MAX_CHROMA)) * 100}% - 8px)`,
          background: seed,
          border: "2px solid rgba(255,255,255,0.8)",
          boxShadow: "0 1px 6px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  )
}

// Ambient background: slow-drifting blurred blobs in primary-container /
// tertiary-container / primary at low opacity. Quarter-res canvas, paused
// when hidden or under reduced motion (single static paint).
function AmbientCanvas({
  seed,
  variant,
  mode,
}: {
  seed: string
  variant: SchemeVariant
  mode: ColorMode
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rolesRef = useRef(getEngineTheme(seed, variant, mode).roles)

  useEffect(() => {
    rolesRef.current = getEngineTheme(seed, variant, mode).roles
  }, [seed, variant, mode])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let raf = 0
    let w = 0
    let h = 0
    const resize = () => {
      w = canvas.width = Math.max(2, Math.ceil(window.innerWidth / 4))
      h = canvas.height = Math.max(2, Math.ceil(window.innerHeight / 4))
    }
    resize()
    window.addEventListener("resize", resize)

    // Sunny-burst path: 12 alternating radii, morphing + rotating.
    // Fixed per-blob phase offsets keep the motion deterministic.
    const burstPath = (
      cx: number,
      cy: number,
      R: number,
      pinch: number,
      rot: number,
      wobble: number,
      phase: number,
    ) => {
      ctx.beginPath()
      for (let i = 0; i <= 12; i++) {
        const a = rot + (i / 12) * Math.PI * 2
        const outer = i % 2 === 0
        const rr =
          R * (outer ? 1 : pinch * (1 + wobble * Math.sin(phase + i * 1.7)))
        const x = cx + Math.cos(a) * rr
        const y = cy + Math.sin(a) * rr
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    const paint = (t: number) => {
      const r = rolesRef.current
      ctx.clearRect(0, 0, w, h)
      ctx.filter = "blur(24px)"
      ctx.globalAlpha = 0.16
      const m = Math.max(w, h)
      const blobs = [
        {
          c: r["primary-container"],
          x: 0.3 + 0.12 * Math.sin(t / 9000),
          y: 0.35 + 0.1 * Math.cos(t / 11000),
          rad: 0.42,
          rot: t / 26000,
          pinch: 0.72,
          phase: 0,
        },
        {
          c: r["tertiary-container"],
          x: 0.72 + 0.1 * Math.cos(t / 8000),
          y: 0.6 + 0.12 * Math.sin(t / 10000),
          rad: 0.38,
          rot: -t / 22000,
          pinch: 0.66,
          phase: 2.1,
        },
        {
          c: r.primary,
          x: 0.55 + 0.08 * Math.sin(t / 12000 + 2),
          y: 0.2 + 0.06 * Math.cos(t / 9000 + 1),
          rad: 0.22,
          rot: t / 18000,
          pinch: 0.78,
          phase: 4.2,
        },
      ]
      for (const b of blobs) {
        burstPath(
          b.x * w,
          b.y * h,
          b.rad * m,
          b.pinch,
          b.rot,
          0.12 * Math.sin(t / 5000 + b.phase),
          t / 4000 + b.phase,
        )
        ctx.fillStyle = b.c
        ctx.fill()
      }
      ctx.filter = "none"
      ctx.globalAlpha = 1
    }

    if (prefersReducedMotion()) {
      paint(0)
      return () => window.removeEventListener("resize", resize)
    }
    const loop = (t: number) => {
      paint(t)
      raf = requestAnimationFrame(loop)
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: mode === "dark" ? 1 : 0.45 }}
    />
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
// Floating M3 Expressive pill bar: wordmark, springing active pill,
// sun/moon mode morph, seed action, and a staggered bottom-sheet menu.

const NAV_ITEMS = [
  { id: "playground", label: "Playground" },
  { id: "proof", label: "Proof" },
  { id: "gallery", label: "Gallery" },
  { id: "about", label: "About" },
] as const
const PRESET_NAV_SEEDS = [
  { name: "Violet", hex: "#6750A4" },
  { name: "Emerald", hex: "#00695C" },
  { name: "Flame", hex: "#B5370D" },
  { name: "Azure", hex: "#1565C0" },
  { name: "Rose", hex: "#AD1457" },
  { name: "Amber", hex: "#FF8F00" },
  { name: "Teal", hex: "#00897B" },
  { name: "Lime", hex: "#689F38" },
  { name: "Indigo", hex: "#3949AB" },
  { name: "Coral", hex: "#E64A19" },
]

function LogoMark({ seed, size = 26 }: { seed: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64">
      <rect x="4" y="4" width="56" height="56" rx="16" fill="var(--rt-surf3)" />
      <g style={{ transition: "fill var(--transition-theme)" }}>
        <path d="M32 10 L52 28 L42 54 L22 54 L12 28 Z" fill={seed} />
        <path
          d="M12 28 L52 28 M32 10 L24 28 L32 54 M32 10 L40 28 L32 54"
          fill="none"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="2"
        />
        <circle cx="26" cy="24" r="3" fill="#FFFFFF" opacity="0.4" />
      </g>
    </svg>
  )
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  })
}

function Navbar({
  seed,
  mode,
  onModeChange,
  onSeedAction,
  onSeedChange,
}: {
  seed: string
  mode: ColorMode
  onModeChange: (m: ColorMode) => void
  onSeedAction: () => void
  onSeedChange?: (hex: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState("top")
  const [seedModalOpen, setSeedModalOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [isBladeExpanded, setIsBladeExpanded] = useState(false)
  const burgerRef = useRef<HTMLElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const dark = mode === "dark"

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 28)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const els = ["top", ...NAV_ITEMS.map((n) => n.id)]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (!els.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: "-38% 0px -55% 0px" },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (wasOpen.current && !open) burgerRef.current?.focus()
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        setSeedModalOpen(false)
        setIsBladeExpanded(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!seedModalOpen) return
    const onDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setSeedModalOpen(false)
      }
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [seedModalOpen])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const go = (id: string) => {
    setOpen(false)
    window.setTimeout(() => scrollToSection(id), open ? 120 : 0)
  }

  const triggerRandomHue = useCallback(() => {
    const randomHue = Math.floor(Math.random() * 360)
    const next = hexFromHct(randomHue, 64, 52)
    if (onSeedChange) {
      onSeedChange(next)
    } else {
      onSeedAction()
    }
  }, [onSeedChange, onSeedAction])

  const handleSeedChipClick = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey || e.altKey) {
      triggerRandomHue()
    } else {
      setSeedModalOpen((v) => !v)
    }
  }, [triggerRandomHue])

  return (
    <>
      {/* ── TOP NAVIGATION: BRAND CAPSULE & MORPHING PALETTE BLADE ── */}
      {/* 1. BRAND MARK CAPSULE (Fixed top-left) */}
      <div className="fixed top-5 left-4 sm:top-6 sm:left-6 z-50 pointer-events-auto">
        <motion.button
          type="button"
          onClick={() => go("top")}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={m3Springs.expressiveBouncy}
          className="bg-[var(--md-sys-color-surface-container-high)]/80 backdrop-blur-2xl border border-[var(--md-sys-color-outline-variant)]/40 px-3.5 sm:px-4 py-2 rounded-[24px] shadow-lg flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none group"
          style={{
            boxShadow: scrolled
              ? "0 0 20px -5px color-mix(in srgb, var(--md-sys-color-primary) 25%, transparent), 0 12px 30px -6px rgba(0, 0, 0, 0.35)"
              : "0 8px 24px -6px rgba(0, 0, 0, 0.25)",
          }}
          aria-label="Retone — back to top"
        >
          {/* Live Seed Orb */}
          <div
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-[28px] animate-m3-morph flex items-center justify-center relative overflow-hidden shadow-xs shrink-0"
            style={{
              backgroundColor: seed,
              boxShadow: `0 0 10px ${seed}88`,
            }}
          >
            <span className="absolute inset-0 bg-gradient-to-tr from-white/35 via-transparent to-black/20 pointer-events-none" />
            <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>
          <LogoMark seed={seed} size={20} />
          <span className="font-display font-black text-sm tracking-wide text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition-colors">
            Retone
          </span>
        </motion.button>
      </div>

      {/* 2. THE MORPHING PALETTE BLADE (Fixed top-right) */}
      <motion.aside
        layout
        initial={false}
        animate={{
          scale: scrolled && !isBladeExpanded ? 0.92 : 1,
        }}
        transition={m3Springs.bladeRubber}
        onMouseEnter={() => setIsBladeExpanded(true)}
        onMouseLeave={() => {
          if (!seedModalOpen) setIsBladeExpanded(false)
        }}
        className={`fixed top-5 right-4 sm:top-6 sm:right-6 z-50 pointer-events-auto bg-[var(--md-sys-color-surface-container-high)]/90 backdrop-blur-2xl border border-[var(--md-sys-color-outline-variant)]/40 shadow-2xl flex items-center transition-all ${
          scrolled && !isBladeExpanded
            ? "scalloped-indicator p-1.5 sm:p-2"
            : isBladeExpanded
              ? "rounded-[32px] p-2"
              : "rounded-[32px_12px_32px_12px] p-2"
        }`}
        style={{
          boxShadow: scrolled
            ? "0 0 28px -4px color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent), 0 16px 36px -8px rgba(0, 0, 0, 0.45)"
            : "0 12px 32px -6px rgba(0, 0, 0, 0.3)",
        }}
        aria-label="The Morphing Palette Blade"
      >
        {/* Compact Seed Indicator / Expander Button */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-[28px] animate-m3-morph flex items-center justify-center relative overflow-hidden shadow-xs cursor-pointer shrink-0"
            style={{
              backgroundColor: seed,
              boxShadow: `0 0 14px ${seed}99`,
            }}
            onClick={(e) => {
              e.stopPropagation()
              setIsBladeExpanded((v) => !v)
            }}
            title={isBladeExpanded ? "Collapse Blade" : "Expand Blade"}
          >
            <span className="absolute inset-0 bg-gradient-to-tr from-white/40 via-transparent to-black/20 pointer-events-none" />
            <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>

          {/* Live Hex Pill (Visible in Rest State or Expanded State; hidden in compact Scrolled FAB state) */}
          {(!scrolled || isBladeExpanded) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                document.getElementById("navbar-native-color")?.click()
              }}
              className="bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-full px-3 py-1 text-xs font-mono font-bold shadow-xs hover:scale-105 active:scale-95 cursor-pointer transition-transform duration-150 flex items-center gap-1 shrink-0 select-none"
              title="Click to open system color wheel"
            >
              <span>{seed.toUpperCase()}</span>
            </button>
          )}
        </div>

        {/* Hidden native color input */}
        <input
          id="navbar-native-color"
          type="color"
          className="sr-only"
          value={seed}
          onChange={(e) => {
            const hex = e.target.value.toUpperCase()
            if (onSeedChange) onSeedChange(hex)
            else onSeedAction()
          }}
        />

        {/* Dynamic Horizontal Blade Content */}
        {!isBladeExpanded ? (
          <button
            type="button"
            onClick={() => setIsBladeExpanded(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-highest)]/50 transition-colors cursor-pointer select-none ${
              scrolled ? "p-1" : "ml-1"
            }`}
            aria-label="Expand palette blade"
            title="Expand navigation blade"
          >
            {!scrolled && (
              <span className="hidden sm:inline font-mono text-[11px] opacity-75">MENU</span>
            )}
            <md-icon style={{ fontSize: 16 }}>chevron_left</md-icon>
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={m3Springs.bladeRubber}
            className="flex items-center gap-1.5 sm:gap-2 ml-1 sm:ml-2"
          >
            {/* Nav Items (Desktop) */}
            <nav aria-label="Sections" className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((n) => {
                const isActive = active === n.id
                return (
                  <motion.button
                    key={n.id}
                    type="button"
                    onClick={() => go(n.id)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.94 }}
                    transition={m3Springs.expressiveBouncy}
                    className={`relative px-3 py-1.5 text-xs rounded-full cursor-pointer select-none transition-colors duration-200 ${
                      isActive
                        ? "text-[var(--md-sys-color-on-primary-container)] font-semibold"
                        : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] font-medium"
                    }`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="activeNavPill"
                        className="absolute inset-0 bg-[var(--md-sys-color-primary-container)] rounded-full -z-10 shadow-xs"
                        transition={m3Springs.expressiveBouncy}
                      />
                    )}
                    <span className="relative z-10">{n.label}</span>
                  </motion.button>
                )
              })}
            </nav>

            <div className="hidden md:block w-px h-5 bg-[var(--md-sys-color-outline-variant)]/30 mx-0.5" />

            {/* Quick-Seed Swatches (Inline on expanded blade) */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--md-sys-color-surface-container)]/70 border border-[var(--md-sys-color-outline-variant)]/25">
              {PRESET_NAV_SEEDS.slice(0, 5).map((c) => {
                const isSelected = seed.toUpperCase() === c.hex.toUpperCase()
                return (
                  <motion.button
                    key={c.hex}
                    type="button"
                    onClick={() => {
                      if (onSeedChange) onSeedChange(c.hex)
                      else onSeedAction()
                    }}
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.85 }}
                    transition={m3Springs.expressiveBouncy}
                    className={`w-5 h-5 rounded-full cursor-pointer shadow-xs relative shrink-0 transition-transform ${
                      isSelected
                        ? "ring-2 ring-offset-1 ring-[var(--md-sys-color-primary)] scale-110"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={`Seed: ${c.name} (${c.hex})`}
                    aria-label={`Select ${c.name} seed color`}
                  />
                )
              })}
            </div>

            {/* Palette Dialog Button */}
            <motion.button
              type="button"
              onClick={handleSeedChipClick}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.88 }}
              transition={m3Springs.expressiveBouncy}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/15 transition-colors cursor-pointer"
              aria-label="Open seed color presets"
              title="Quick Color Swatches"
            >
              <md-icon style={{ fontSize: 18 }}>palette</md-icon>
            </motion.button>

            {/* Randomizer Dice Button */}
            <motion.button
              type="button"
              onClick={triggerRandomHue}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.85, rotate: -20 }}
              transition={m3Springs.expressiveBouncy}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/15 transition-colors cursor-pointer"
              aria-label="Randomize hue"
              title="Surprise hue"
            >
              <md-icon style={{ fontSize: 18 }}>casino</md-icon>
            </motion.button>

            {/* Dark / Light Theme Button */}
            <motion.button
              type="button"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => onModeChange(dark ? "light" : "dark")}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.88, rotate: 180 }}
              transition={m3Springs.expressiveBouncy}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors cursor-pointer"
            >
              <md-icon aria-hidden="true" style={{ fontSize: 18 }}>
                {dark ? "light_mode" : "dark_mode"}
              </md-icon>
            </motion.button>

            {/* Mobile Hamburger (visible on sm/mobile) */}
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer"
              ref={burgerRef as any}
            >
              <md-icon aria-hidden="true" style={{ fontSize: 20 }}>
                {open ? "close" : "menu"}
              </md-icon>
            </button>

            {/* Collapse toggle */}
            <button
              type="button"
              onClick={() => setIsBladeExpanded(false)}
              className="hidden sm:flex w-7 h-7 rounded-full items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer opacity-70 hover:opacity-100"
              title="Collapse blade"
            >
              <md-icon style={{ fontSize: 16 }}>chevron_right</md-icon>
            </button>
          </motion.div>
        )}

        {/* Quick Seed Color Picker Dialog */}
        {seedModalOpen && (
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Quick Seed Color Picker"
            className="absolute top-[calc(100%+12px)] right-0 w-[300px] sm:w-[320px] p-4 rounded-3xl bg-[var(--md-sys-color-surface-container-high)] backdrop-blur-2xl border border-[var(--md-sys-color-outline-variant)]/40 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200"
            style={{
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-[var(--md-sys-color-outline-variant)]/30">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-xs"
                  style={{ backgroundColor: seed }}
                />
                <span
                  className="font-display font-semibold text-xs tracking-wide"
                  style={{ color: "var(--md-sys-color-on-surface)" }}
                >
                  Quick Color Picker
                </span>
              </div>
              <span
                className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[var(--md-sys-color-surface-container)] font-semibold"
                style={{ color: "var(--md-sys-color-primary)" }}
              >
                {seed.toUpperCase()}
              </span>
            </div>

            <div className="mb-3">
              <p
                className="text-[10px] font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "var(--md-sys-color-on-surface-variant)" }}
              >
                Color Presets
              </p>
              <div className="grid grid-cols-5 gap-2">
                {PRESET_NAV_SEEDS.map((c) => {
                  const isSelected = seed.toUpperCase() === c.hex.toUpperCase()
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => {
                        if (onSeedChange) onSeedChange(c.hex)
                        else onSeedAction()
                      }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform duration-150 hover:scale-110 active:scale-95 cursor-pointer shadow-xs relative ${
                        isSelected
                          ? "ring-2 ring-offset-2 ring-[var(--md-sys-color-primary)]"
                          : ""
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {isSelected && (
                        <md-icon style={{ fontSize: 16, color: "#fff" }}>
                          check
                        </md-icon>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
              <button
                type="button"
                onClick={triggerRandomHue}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-medium text-xs hover:opacity-90 active:scale-95 transition-all duration-150 cursor-pointer shadow-xs"
                title="Randomize hue"
              >
                <md-icon style={{ fontSize: 16 }}>shuffle</md-icon>
                <span>Random Hue</span>
              </button>

              <label
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] font-medium text-xs transition-colors duration-150 cursor-pointer border border-[var(--md-sys-color-outline-variant)]/30"
                title="Custom eyedropper color picker"
              >
                <input
                  type="color"
                  value={seed}
                  onChange={(e) => {
                    if (onSeedChange) onSeedChange(e.target.value.toUpperCase())
                  }}
                  className="sr-only"
                />
                <md-icon style={{ fontSize: 16 }}>colorize</md-icon>
                <span>Custom</span>
              </label>
            </div>

            <div className="mt-2.5 text-center">
              <button
                type="button"
                onClick={() => {
                  setSeedModalOpen(false)
                  onSeedAction()
                }}
                className="text-[11px] font-medium underline opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                style={{ color: "var(--md-sys-color-primary)" }}
              >
                Open 2D Hue-Chroma Playground →
              </button>
            </div>
          </div>
        )}
      </motion.aside>

      {/* Mobile Drawer */}
      <div
        className="x-backdrop md:hidden"
        data-open={open}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <div
        className="x-sheet md:hidden"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        aria-hidden={!open}
        inert={!open}
      >
        <nav aria-label="Sections mobile" className="flex flex-col gap-1">
          <div
            className="x-rise flex items-center justify-between px-2 pb-1"
            style={{ transitionDelay: open ? "40ms" : "0ms" }}
          >
            <span
              className="text-xs tracking-widest uppercase font-mono"
              style={{
                color: "var(--rt-outline)",
              }}
            >
              Navigation
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs px-2 py-1 rounded-full opacity-70 hover:opacity-100"
              style={{ color: "var(--md-sys-color-on-surface)" }}
            >
              Close
            </button>
          </div>
          {NAV_ITEMS.map((n, i) => (
            <button
              key={n.id}
              type="button"
              data-active={active === n.id}
              onClick={() => go(n.id)}
              className="x-nav-link x-rise"
              style={{
                transitionDelay: open ? `${80 + i * 60}ms` : "0ms",
                fontSize: 18,
                padding: "14px 20px",
                justifyContent: "flex-start",
              }}
              aria-current={active === n.id ? "true" : undefined}
              tabIndex={open ? 0 : -1}
            >
              {n.label}
            </button>
          ))}
          <div
            className="x-rise flex items-center gap-2 mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20"
            style={{ transitionDelay: open ? "340ms" : "0ms" }}
          >
            <button
              type="button"
              onClick={() => {
                onModeChange(dark ? "light" : "dark")
              }}
              className="x-nav-link flex-1"
              style={{ justifyContent: "center" }}
              tabIndex={open ? 0 : -1}
            >
              <MIcon
                name={dark ? "light_mode" : "dark_mode"}
                filled
                style={{ fontSize: 20 }}
              />
              <span className="ml-2">{dark ? "Light mode" : "Dark mode"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                triggerRandomHue()
              }}
              className="bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] rounded-full px-4 py-2 font-medium text-xs flex items-center justify-center gap-2 flex-1"
              tabIndex={open ? 0 : -1}
              aria-label="Random hue shift"
            >
              <span
                className="x-seed-dot"
                style={{ background: seed }}
                aria-hidden="true"
              />
              <span className="ml-2">Pick a seed</span>
            </button>
          </div>
        </nav>
      </div>
    </>
  )
}

function DynamicPaletteSideCard({
  seed,
  variant,
  mode,
  onSeedChange,
}: {
  seed: string
  variant: SchemeVariant
  mode: ColorMode
  onSeedChange: (hex: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [copiedRole, setCopiedRole] = useState<string | null>(null)
  const hct = useMemo(() => seedHct(seed), [seed])
  const theme = useMemo(
    () => getEngineTheme(seed, variant, mode),
    [seed, variant, mode],
  )

  const copyOrSeed = async (hex: string, roleName: string) => {
    onSeedChange(hex)
    await copyText(hex)
    setCopiedRole(roleName)
    window.setTimeout(() => setCopiedRole(null), 1400)
  }

  const shuffle = () => {
    onSeedChange(
      hexFromHct(Math.floor(Math.random() * 360), 75 + Math.random() * 30, 56),
    )
  }

  const keyRoles = [
    { name: "Primary", hex: theme.roles.primary, code: "P" },
    { name: "Primary Cont", hex: theme.roles["primary-container"], code: "PC" },
    { name: "Secondary", hex: theme.roles.secondary, code: "S" },
    { name: "Tertiary", hex: theme.roles.tertiary, code: "T" },
    { name: "Surface", hex: theme.roles.surface, code: "SF" },
    { name: "Error", hex: theme.roles.error, code: "ERR" },
  ]

  return (
    <aside
      aria-label="Dynamic Palette Dock"
      className={`fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-35 hidden xl:flex flex-col items-center gap-3 p-3 rounded-[28px] bg-[var(--md-sys-color-surface-container-high)]/85 backdrop-blur-xl border border-[var(--md-sys-color-outline-variant)]/40 shadow-2xl transition-all duration-300 ${collapsed ? "w-14" : "w-20"
        }`}
      style={{
        boxShadow: "0 16px 40px -8px rgba(0, 0, 0, 0.45)",
      }}
    >
      {/* Collapse / Expand toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] hover:text-[var(--md-sys-color-on-surface)] transition-all cursor-pointer"
        title={collapsed ? "Expand Palette Dock" : "Collapse Palette Dock"}
        aria-label={collapsed ? "Expand Palette Dock" : "Collapse Palette Dock"}
      >
        <md-icon style={{ fontSize: 18 }}>
          {collapsed ? "chevron_left" : "chevron_right"}
        </md-icon>
      </button>

      {/* Active Seed Dot */}
      <button
        type="button"
        onClick={shuffle}
        title={`Seed: ${seed} (Click to shuffle)`}
        className="relative group cursor-pointer"
      >
        <span
          className="absolute -inset-1 rounded-full opacity-60 animate-ping pointer-events-none"
          style={{ backgroundColor: seed }}
        />
        <span
          className="relative w-8 h-8 rounded-full border-2 border-white/60 shadow-md flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
          style={{ backgroundColor: seed }}
        >
          <md-icon
            style={{ fontSize: 14, color: hct.tone > 50 ? "#000" : "#fff" }}
          >
            shuffle
          </md-icon>
        </span>
      </button>

      {!collapsed && (
        <>
          {/* HCT Coordinates Chip */}
          <div className="flex flex-col items-center text-center font-mono text-[9px] text-[var(--md-sys-color-outline)] leading-tight py-1 border-y border-[var(--md-sys-color-outline-variant)]/30 w-full">
            <span className="font-bold text-[var(--md-sys-color-primary)]">
              H{hct.hue.toFixed(0)}°
            </span>
            <span>C{hct.chroma.toFixed(0)}</span>
            <span>T{hct.tone.toFixed(0)}</span>
          </div>

          {/* Generated Core Role Swatches */}
          <div className="flex flex-col gap-1.5 w-full items-center">
            {keyRoles.map(({ name, hex, code }) => (
              <button
                key={name}
                type="button"
                onClick={() => copyOrSeed(hex, name)}
                title={`${name}: ${hex} (Click to seed & copy)`}
                className="w-10 h-7 rounded-lg border border-black/10 dark:border-white/10 shadow-xs hover:scale-110 active:scale-90 transition-all flex items-center justify-center font-mono text-[9px] font-bold relative group cursor-pointer"
                style={{
                  backgroundColor: hex,
                  color:
                    name === "Surface" && mode === "light" ? "#000" : "#fff",
                }}
              >
                <span className="group-hover:opacity-0 transition-opacity">
                  {code}
                </span>
                <md-icon
                  style={{ fontSize: 12 }}
                  className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  colorize
                </md-icon>
              </button>
            ))}
          </div>

          {copiedRole && (
            <span className="text-[8px] font-mono font-bold text-emerald-500 animate-pulse text-center">
              Copied!
            </span>
          )}
        </>
      )}
    </aside>
  )
}

function HeroSection({
  seed,
  variant,
  mode,
  onSeedChange,
}: {
  seed: string
  variant: SchemeVariant
  mode: ColorMode
  onSeedChange: (hex: string) => void
}) {
  const hct = useMemo(() => seedHct(seed), [seed])
  const theme = useMemo(
    () => getEngineTheme(seed, variant, mode),
    [seed, variant, mode],
  )
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2
      const y = (e.clientY / window.innerHeight - 0.5) * 2
      setMouseOffset({ x, y })
    }
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  const shuffle = useCallback(() => {
    onSeedChange(
      hexFromHct(Math.floor(Math.random() * 360), 75 + Math.random() * 30, 56),
    )
  }, [onSeedChange])

  const handleShapeClick = (_shapeKey: string, shapeHex?: string) => {
    if (shapeHex) {
      onSeedChange(shapeHex)
    } else {
      shuffle()
    }
  }

  return (
    <section
      id="top"
      className="relative w-full min-h-screen overflow-hidden flex flex-col items-center justify-start pt-28 sm:pt-36 pb-20 px-4 sm:px-8 select-none"
    >
      {/* Background ambient multi-stop glows */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none overflow-hidden"
      >
        <div
          className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl opacity-30 transition-colors duration-700"
          style={{ background: "var(--md-sys-color-primary-container)" }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-25 transition-colors duration-700"
          style={{ background: "var(--md-sys-color-tertiary-container)" }}
        />
        <div
          className="absolute bottom-10 left-1/4 w-[480px] h-[480px] rounded-full blur-3xl opacity-20 transition-colors duration-700"
          style={{ background: "var(--md-sys-color-secondary-container)" }}
        />
      </div>

      {/* ── UNLEASHED FLOATING SHAPES (3D textures, complex gradients, parallax) ── */}
      {/* Shape 1: 12-point Starburst (Primary) */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.15, rotate: 12 }}
        whileTap={{ scale: 0.92 }}
        transition={m3Springs.expressiveBouncy}
        onClick={() => handleShapeClick("starburst", theme.roles.primary)}
        className="absolute top-20 left-[3%] xl:left-[7%] w-36 h-36 sm:w-52 sm:h-52 z-10 cursor-pointer focus:outline-none group"
        style={{
          transform: `translate3d(${mouseOffset.x * -35}px, ${mouseOffset.y * -35}px, 0)`,
          transition: "transform 0.4s cubic-bezier(0.2, 0, 0, 1)",
          filter: "drop-shadow(0 20px 35px rgba(0, 0, 0, 0.35))",
        }}
        aria-label="Primary color starburst shape, click to seed"
      >
        <div
          className="w-full h-full relative overflow-hidden"
          style={{
            clipPath: sunnyClip(48, 28),
            background: `radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--md-sys-color-primary) 85%, white) 0%, var(--md-sys-color-primary) 65%, color-mix(in srgb, var(--md-sys-color-primary) 70%, black) 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent animate-specular pointer-events-none" />
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-on-primary)] text-[var(--md-sys-color-primary)] shadow-sm whitespace-nowrap">
            Primary · Click to Seed
          </span>
        </div>
      </motion.button>

      {/* Shape 2: Scalloped Blob (Tertiary container) */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.15, rotate: -15 }}
        whileTap={{ scale: 0.92 }}
        transition={m3Springs.expressiveBouncy}
        onClick={() => handleShapeClick("blob", theme.roles["tertiary-container"])}
        className="absolute top-28 right-[3%] xl:right-[8%] w-40 h-40 sm:w-56 sm:h-56 z-10 cursor-pointer focus:outline-none group"
        style={{
          transform: `translate3d(${mouseOffset.x * 40}px, ${mouseOffset.y * 40}px, 0)`,
          transition: "transform 0.4s cubic-bezier(0.2, 0, 0, 1)",
          filter: "drop-shadow(0 22px 40px rgba(0, 0, 0, 0.32))",
        }}
        aria-label="Tertiary container scalloped blob shape, click to seed"
      >
        <div
          className="w-full h-full relative overflow-hidden"
          style={{
            clipPath: cookieClip(9, 0.74, 48),
            background: `radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--md-sys-color-tertiary-container) 85%, white) 0%, var(--md-sys-color-tertiary-container) 65%, color-mix(in srgb, var(--md-sys-color-tertiary-container) 70%, black) 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-specular pointer-events-none" />
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-on-tertiary-container)] text-[var(--md-sys-color-tertiary-container)] shadow-sm whitespace-nowrap">
            Tertiary · Click to Seed
          </span>
        </div>
      </motion.button>

      {/* Shape 3: Asymmetric Pill (Secondary) */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.12, rotate: 6 }}
        whileTap={{ scale: 0.92 }}
        transition={m3Springs.expressiveBouncy}
        onClick={() => handleShapeClick("pill", theme.roles.secondary)}
        className="absolute top-[48%] left-[2%] xl:left-[5%] w-44 h-24 sm:w-60 sm:h-32 z-15 cursor-pointer focus:outline-none group"
        style={{
          transform: `translate3d(${mouseOffset.x * -25}px, ${mouseOffset.y * 25}px, 0)`,
          transition: "transform 0.4s cubic-bezier(0.2, 0, 0, 1)",
          filter: "drop-shadow(0 18px 36px rgba(0, 0, 0, 0.3))",
        }}
        aria-label="Secondary color asymmetric pill shape, click to seed"
      >
        <div
          className="w-full h-full rounded-[90px_26px_72px_30px] border border-white/15 relative overflow-hidden flex items-center justify-center"
          style={{
            background: `radial-gradient(ellipse at 40% 40%, color-mix(in srgb, var(--md-sys-color-secondary) 85%, white) 0%, var(--md-sys-color-secondary) 65%, color-mix(in srgb, var(--md-sys-color-secondary) 70%, black) 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-specular pointer-events-none" />
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-on-secondary)] text-[var(--md-sys-color-secondary)] shadow-sm whitespace-nowrap">
            Secondary · Click to Seed
          </span>
        </div>
      </motion.button>

      {/* Shape 4: Faceted Gem (Primary Container) */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.25, rotate: 45 }}
        whileTap={{ scale: 0.92 }}
        transition={m3Springs.expressiveBouncy}
        onClick={() => handleShapeClick("gem", theme.roles["primary-container"])}
        className="absolute top-[48%] right-[2%] xl:right-[6%] w-24 h-24 sm:w-32 sm:h-32 z-15 cursor-pointer focus:outline-none group"
        style={{
          transform: `translate3d(${mouseOffset.x * 30}px, ${mouseOffset.y * -30}px, 0)`,
          transition: "transform 0.4s cubic-bezier(0.2, 0, 0, 1)",
          filter: "drop-shadow(0 14px 28px rgba(0, 0, 0, 0.35))",
        }}
        aria-label="Primary container gem shape, click to seed"
      >
        <div
          className="w-full h-full relative overflow-hidden"
          style={{
            clipPath: STATIC_CLIPS.gem,
            background: `radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--md-sys-color-primary-container) 90%, white) 0%, var(--md-sys-color-primary-container) 70%, color-mix(in srgb, var(--md-sys-color-primary-container) 75%, black) 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent animate-specular pointer-events-none" />
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--md-sys-color-on-primary-container)] text-[var(--md-sys-color-primary-container)] shadow-sm absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
            Gem
          </span>
        </div>
      </motion.button>

      {/* ── CENTRAL EDITORIAL GLASSMORPHIC PLANE ── */}
      <div className="glass-plane rounded-[40px] sm:rounded-[48px] p-8 sm:p-14 max-w-4xl w-full mx-auto my-6 text-center relative z-20 border border-white/20 dark:border-white/10 shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]">
        {/* Status Badge */}
        <div className="mb-6 w-fit mx-auto">
          <span className="bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider inline-flex items-center gap-2 shadow-xs">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--md-sys-color-tertiary)" }}
              aria-hidden="true"
            />
            <span>MATERIAL 3 EXPRESSIVE · LIVE HCT</span>
          </span>
        </div>

        {/* Headline with Dramatic Variable Font Weight */}
        <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl tracking-tight text-[var(--md-sys-color-on-surface)] leading-[1.04] mb-6 select-none">
          <span className="font-light block text-[var(--md-sys-color-on-surface-variant)]/90">
            One color.
          </span>
          <span
            className="font-black inline-block mt-1 bg-gradient-to-r from-[var(--md-sys-color-primary)] via-[var(--md-sys-color-primary-container)] to-[var(--md-sys-color-tertiary)] bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--md-sys-color-primary) 0%, var(--md-sys-color-tertiary) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            An entire interface.
          </span>
        </h1>

        {/* Narrative Paragraph */}
        <p className="text-[var(--md-sys-color-on-surface-variant)] text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8 font-normal">
          Retone runs Google's real Material You dynamic color engine in your
          browser. One seed becomes six tonal palettes, thirty-six design roles
          — and every pixel on this page obeys them.
        </p>

        {/* Engine Metrics Badge */}
        <div
          className="inline-flex flex-wrap items-center gap-2.5 text-xs px-5 py-2.5 rounded-full bg-[var(--md-sys-color-surface-container)]/80 border border-[var(--md-sys-color-outline-variant)]/35 text-[var(--md-sys-color-on-surface-variant)] font-mono shadow-sm mx-auto select-none"
          aria-label={`Current seed ${seed.toUpperCase()}, hue ${Math.round(hct.hue)}, chroma ${hct.chroma.toFixed(1)}, tone ${hct.tone.toFixed(0)}`}
        >
          <span
            className="w-3 h-3 rounded-full shadow-xs border border-white/40"
            style={{ backgroundColor: seed }}
            aria-hidden="true"
          />
          <span>H {hct.hue.toFixed(0)}°</span>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span>C {hct.chroma.toFixed(1)}</span>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span>T {hct.tone.toFixed(0)}</span>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span className="font-bold text-[var(--md-sys-color-on-surface)]">
            {seed.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Scroll indicator pointing to Color Role Showcases */}
      <div
        aria-hidden="true"
        className="my-10 flex flex-col items-center gap-2 pointer-events-none z-10"
      >
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{
            color: "var(--md-sys-color-outline)",
            fontFamily: "var(--font-mono)",
          }}
        >
          scroll to explore roles
        </span>
        <div
          className="w-px h-8 animate-pulse"
          style={{
            background:
              "linear-gradient(to bottom, var(--md-sys-color-outline), transparent)",
          }}
        />
      </div>

      {/* ── INTERACTIVE MATERIAL 3 COLOR ROLE SHOWCASES ── */}
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-10 sm:gap-14 px-2 z-20 my-8">
        {/* Block 1: PRIMARY ROLE */}
        <motion.div
          variants={m3CardVariants}
          initial="rest"
          whileHover="hover"
          className="rounded-[36px] bg-[var(--md-sys-color-surface-container)]/85 backdrop-blur-xl border border-[var(--md-sys-color-outline-variant)]/30 p-8 sm:p-12 shadow-xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative overflow-hidden"
        >
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--md-sys-color-primary)]" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--md-sys-color-primary)]">
                Color Role 01
              </span>
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-black text-[var(--md-sys-color-on-surface)] leading-tight">
              PRIMARY: The Backbone
            </h2>
            <p className="text-[var(--md-sys-color-on-surface-variant)] text-base leading-relaxed">
              The primary role is the visual anchor of your interface. Used for
              key actions, elevated surfaces, prominent FABs, and active
              navigation states, it establishes immediate visual hierarchy and
              brand focus.
            </p>

            {/* Swatches & Contrast badge */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]/30">
                {[10, 40, 80, 90].map((t) => {
                  const hex = hexFromHct(hct.hue, hct.chroma, t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onSeedChange(hex)}
                      title={`Primary Tone ${t}: ${hex} (Click to seed)`}
                      className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-transform hover:scale-108 cursor-pointer flex items-center gap-1.5"
                      style={{
                        backgroundColor: hex,
                        color: t > 50 ? "#000" : "#fff",
                      }}
                    >
                      <span>T{t}</span>
                    </button>
                  )
                })}
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-mono font-bold shadow-2xs">
                <md-icon style={{ fontSize: 16 }}>verified</md-icon>
                <span>AAA Contrast 7.2:1</span>
              </span>
            </div>
          </div>

          {/* 3D Crystalline Graphic */}
          <div className="lg:col-span-5 flex items-center justify-center p-4">
            <div
              className="w-48 h-48 sm:w-56 sm:h-56 relative rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center group"
              style={{
                background: `radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--md-sys-color-primary) 85%, white) 0%, var(--md-sys-color-primary) 70%, color-mix(in srgb, var(--md-sys-color-primary) 70%, black) 100%)`,
                clipPath: STATIC_CLIPS.crystal,
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.4))",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent animate-specular" />
              <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-black/40 text-white backdrop-blur-xs">
                primary
              </span>
            </div>
          </div>
        </motion.div>

        {/* Block 2: TERTIARY ROLE */}
        <motion.div
          variants={m3CardVariants}
          initial="rest"
          whileHover="hover"
          className="rounded-[36px] bg-[var(--md-sys-color-surface-container)]/85 backdrop-blur-xl border border-[var(--md-sys-color-outline-variant)]/30 p-8 sm:p-12 shadow-xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative overflow-hidden"
        >
          {/* Organic Fluid Graphic */}
          <div className="lg:col-span-5 order-2 lg:order-1 flex items-center justify-center p-4">
            <div
              className="w-48 h-48 sm:w-56 sm:h-56 relative rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center group"
              style={{
                background: `radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--md-sys-color-tertiary) 85%, white) 0%, var(--md-sys-color-tertiary) 70%, color-mix(in srgb, var(--md-sys-color-tertiary) 70%, black) 100%)`,
                clipPath: cookieClip(9, 0.76, 48),
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.4))",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent animate-specular" />
              <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-black/40 text-white backdrop-blur-xs">
                tertiary
              </span>
            </div>
          </div>

          <div className="lg:col-span-7 order-1 lg:order-2 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--md-sys-color-tertiary)]" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--md-sys-color-tertiary)]">
                Color Role 02
              </span>
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-black text-[var(--md-sys-color-on-surface)] leading-tight">
              TERTIARY: The Accent
            </h2>
            <p className="text-[var(--md-sys-color-on-surface-variant)] text-base leading-relaxed">
              Tertiary brings expressive contrast and emotional accenting. The
              CAM16 color engine derives tertiary by pivoting ~60° around the
              perceptual color wheel, guaranteeing harmonic counter-balance
              without chromatic clash.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]/30">
                {[10, 40, 80, 90].map((t) => {
                  const hex = hexFromHct(
                    (hct.hue + 60) % 360,
                    hct.chroma * 0.7,
                    t,
                  )
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onSeedChange(hex)}
                      title={`Tertiary Tone ${t}: ${hex} (Click to seed)`}
                      className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-transform hover:scale-108 cursor-pointer flex items-center gap-1.5"
                      style={{
                        backgroundColor: hex,
                        color: t > 50 ? "#000" : "#fff",
                      }}
                    >
                      <span>T{t}</span>
                    </button>
                  )
                })}
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] text-xs font-mono font-bold shadow-2xs">
                <md-icon style={{ fontSize: 16 }}>palette</md-icon>
                <span>Harmonic Hue Pivot</span>
              </span>
            </div>
          </div>
        </motion.div>

        {/* Block 3: SECONDARY & SURFACES */}
        <motion.div
          variants={m3CardVariants}
          initial="rest"
          whileHover="hover"
          className="rounded-[36px] bg-[var(--md-sys-color-surface-container)]/85 backdrop-blur-xl border border-[var(--md-sys-color-outline-variant)]/30 p-8 sm:p-12 shadow-xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative overflow-hidden"
        >
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--md-sys-color-secondary)]" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--md-sys-color-secondary)]">
                Color Role 03
              </span>
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-black text-[var(--md-sys-color-on-surface)] leading-tight">
              SECONDARY & SURFACES: The Harmony
            </h2>
            <p className="text-[var(--md-sys-color-on-surface-variant)] text-base leading-relaxed">
              Rather than relying on artificial drop shadows, Material 3 uses
              tonal surface elevation. Five distinct surface container levels
              create effortless visual depth that adapts gracefully across light
              and dark modes.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {["Low", "Base", "High", "Highest"].map((lvl) => (
                <span
                  key={lvl}
                  className="px-3 py-1.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] text-xs font-mono font-medium border border-[var(--md-sys-color-outline-variant)]/20"
                >
                  Container {lvl}
                </span>
              ))}
            </div>
          </div>

          {/* Layered Architectural Plane Graphic */}
          <div className="lg:col-span-5 flex items-center justify-center p-4">
            <div className="relative w-52 h-44 flex items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-[var(--md-sys-color-surface-container-lowest)] border border-white/10 shadow-md rotate-[-8deg]" />
              <div className="absolute inset-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-white/10 shadow-lg rotate-[-2deg]" />
              <div className="absolute inset-4 rounded-xl bg-[var(--md-sys-color-surface-container-highest)] border border-white/10 shadow-xl rotate-[4deg] flex items-center justify-center">
                <div className="px-4 py-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-mono text-xs font-bold shadow-sm">
                  Tonal Layers
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── REPOSITIONED CTAS FOLLOWING ROLE SHOWCASE ── */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-6 z-20">
        <motion.button
          type="button"
          variants={m3ShapeVariants}
          initial="rest"
          whileHover="hover"
          whileTap="tap"
          onClick={() => scrollToSection("playground")}
          className="bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-[28px] px-8 py-4 font-semibold shadow-md flex items-center gap-2.5 cursor-pointer text-base"
        >
          <span>Open the playground</span>
          <md-icon style={{ fontSize: 20 }} aria-hidden="true">
            arrow_downward
          </md-icon>
        </motion.button>

        <motion.button
          type="button"
          variants={m3ShapeVariants}
          initial="rest"
          whileHover="hover"
          whileTap="tap"
          onClick={shuffle}
          className="bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] rounded-[28px] px-6 py-4 font-medium flex items-center gap-2 cursor-pointer shadow-xs text-base"
        >
          <md-icon style={{ fontSize: 20 }} aria-hidden="true">
            shuffle
          </md-icon>
          <span>Surprise me</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={m3Springs.expressiveBouncy}
          onClick={() => scrollToSection("shapes")}
          className="rounded-[28px] border-2 border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/10 px-6 py-3.5 font-semibold text-sm flex items-center gap-2 cursor-pointer shadow-2xs"
        >
          <md-icon style={{ fontSize: 20 }}>category</md-icon>
          <span>Explore Shape Matrix</span>
        </motion.button>
      </div>
    </section>
  )
}

function ShapeEditorSection({
  seed,
  variant,
  mode,
  onSeedChange,
}: {
  seed: string
  variant: SchemeVariant
  mode: ColorMode
  onSeedChange: (hex: string) => void
}) {
  const [layoutMode, setLayoutMode] = useState<"radial" | "grid" | "scatter">(
    "radial",
  )
  const [shapeCount, setShapeCount] = useState(6)
  const [randomSeed, setRandomSeed] = useState(1)
  const theme = useMemo(
    () => getEngineTheme(seed, variant, mode),
    [seed, variant, mode],
  )
  const hct = useMemo(() => seedHct(seed), [seed])

  const randomizeLayout = () => {
    setRandomSeed((s) => s + 1)
  }

  // Pre-configured expressive shape definitions
  const allShapes = useMemo(
    () => [
      {
        id: "starburst",
        name: "Starburst",
        role: "Primary",
        hex: theme.roles.primary,
        bg: "var(--md-sys-color-primary)",
        fg: "var(--md-sys-color-on-primary)",
        clip: sunnyClip(48, 28),
      },
      {
        id: "cookie",
        name: "Cookie Blob",
        role: "Tertiary",
        hex: theme.roles.tertiary,
        bg: "var(--md-sys-color-tertiary)",
        fg: "var(--md-sys-color-on-tertiary)",
        clip: cookieClip(9, 0.74, 48),
      },
      {
        id: "pill",
        name: "Asymmetric Pill",
        role: "Secondary",
        hex: theme.roles.secondary,
        bg: "var(--md-sys-color-secondary)",
        fg: "var(--md-sys-color-on-secondary)",
        radius: "90px 26px 72px 30px",
      },
      {
        id: "gem",
        name: "Facet Gem",
        role: "Primary Cont",
        hex: theme.roles["primary-container"],
        bg: "var(--md-sys-color-primary-container)",
        fg: "var(--md-sys-color-on-primary-container)",
        clip: STATIC_CLIPS.gem,
      },
      {
        id: "crystal",
        name: "Crystal",
        role: "Tertiary Cont",
        hex: theme.roles["tertiary-container"],
        bg: "var(--md-sys-color-tertiary-container)",
        fg: "var(--md-sys-color-on-tertiary-container)",
        clip: STATIC_CLIPS.crystal,
      },
      {
        id: "flower",
        name: "Flower",
        role: "Secondary Cont",
        hex: theme.roles["secondary-container"],
        bg: "var(--md-sys-color-secondary-container)",
        fg: "var(--md-sys-color-on-secondary-container)",
        clip: STATIC_CLIPS.flower,
      },
      {
        id: "shield",
        name: "Shield",
        role: "Surface Highest",
        hex: theme.roles["surface-container-highest"],
        bg: "var(--rt-surf3)",
        fg: "var(--rt-onsf)",
        clip: STATIC_CLIPS.shield,
      },
      {
        id: "squircle",
        name: "Squircle",
        role: "Seed Accent",
        hex: seed,
        bg: seed,
        fg: hct.tone > 50 ? "#000" : "#fff",
        radius: "36px",
      },
    ],
    [theme, seed, hct],
  )

  const activeShapes = allShapes.slice(0, shapeCount)

  return (
    <section
      id="shapes"
      className="py-24 px-5 md:px-10 relative overflow-hidden"
      style={{ background: "var(--rt-surf)" }}
    >
      <div className="max-w-6xl mx-auto flex flex-col items-center">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="mb-3 w-fit mx-auto">
            <span className="bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-3.5 py-1.5 rounded-full text-xs font-mono font-bold inline-flex items-center gap-2 shadow-xs">
              <md-icon style={{ fontSize: 16 }}>category</md-icon>
              <span>MATERIAL 3 EXPRESSIVE · SHAPE LAB & COMPOSITION</span>
            </span>
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-extrabold text-[var(--md-sys-color-on-surface)] tracking-tight mb-4">
            Interactive Shape Matrix
          </h2>
          <p className="text-[var(--md-sys-color-on-surface-variant)] text-base sm:text-lg leading-relaxed">
            Every Material 3 component draws from dynamic geometric tokens.
            Arrange shapes in radial orbits or fluid grids, customize counts, and
            click any shape to seed the engine live.
          </p>
        </div>

        {/* Shape Matrix Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-center gap-3 p-2 rounded-3xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 shadow-md mb-12">
          {/* Layout Mode Chips */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-[var(--md-sys-color-surface-container-high)]">
            {(
              [
                { id: "radial", label: "Radial Orbit", icon: "orbit" },
                { id: "grid", label: "Dynamic Grid", icon: "grid_view" },
                { id: "scatter", label: "Asymmetric", icon: "grain" },
              ] as const
            ).map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLayoutMode(id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${layoutMode === id
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs"
                  : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
                  }`}
              >
                <md-icon style={{ fontSize: 16 }}>{icon}</md-icon>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Randomize Button */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={m3Springs.expressiveBouncy}
            onClick={randomizeLayout}
            className="px-4 py-2 rounded-2xl bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <md-icon style={{ fontSize: 16 }}>casino</md-icon>
            <span>Randomize Shape Layout</span>
          </motion.button>

          {/* Shape Count Stepper */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] text-xs font-mono">
            <span className="text-[var(--md-sys-color-outline)]">Count:</span>
            <span className="font-bold text-[var(--md-sys-color-primary)]">
              {shapeCount}
            </span>
            <button
              type="button"
              disabled={shapeCount <= 4}
              onClick={() => setShapeCount((c) => Math.max(4, c - 1))}
              className="w-6 h-6 rounded-lg bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-40 flex items-center justify-center cursor-pointer font-bold"
              aria-label="Decrease shapes"
            >
              -
            </button>
            <button
              type="button"
              disabled={shapeCount >= allShapes.length}
              onClick={() =>
                setShapeCount((c) => Math.min(allShapes.length, c + 1))
              }
              className="w-6 h-6 rounded-lg bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-40 flex items-center justify-center cursor-pointer font-bold"
              aria-label="Increase shapes"
            >
              +
            </button>
          </div>
        </div>

        {/* Shape Matrix Display Canvas */}
        <div className="w-full max-w-4xl min-h-[440px] rounded-[36px] bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/30 p-8 flex items-center justify-center relative shadow-inner overflow-hidden">
          {/* Radial Layout */}
          {layoutMode === "radial" && (
            <div className="relative w-72 h-72 sm:w-96 sm:h-96 flex items-center justify-center">
              {/* Center Orbit Hub */}
              <button
                type="button"
                className="w-16 h-16 rounded-full flex items-center justify-center font-mono text-xs font-bold border-2 border-white/40 shadow-lg z-20 cursor-pointer"
                style={{
                  backgroundColor: seed,
                  color: hct.tone > 50 ? "#000" : "#fff",
                }}
                onClick={() => onSeedChange(seed)}
                title="Seed Center"
              >
                Seed
              </button>

              {activeShapes.map((shape, idx) => {
                const total = activeShapes.length
                const angle = (idx / total) * Math.PI * 2 + randomSeed * 0.4
                const radius = 130 + ((randomSeed * 17) % 25)
                const x = Math.cos(angle) * radius
                const y = Math.sin(angle) * radius

                return (
                  <motion.button
                    key={shape.id}
                    type="button"
                    onClick={() => onSeedChange(shape.hex)}
                    whileHover={{ scale: 1.25, zIndex: 30 }}
                    whileTap={{ scale: 0.9 }}
                    transition={m3Springs.expressiveBouncy}
                    className="absolute w-20 h-20 sm:w-24 sm:h-24 cursor-pointer focus:outline-none group select-none flex items-center justify-center"
                    style={{
                      transform: `translate(${x}px, ${y}px) rotate(${(randomSeed * 30 + idx * 45) % 360}deg)`,
                      filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.3))",
                    }}
                    title={`${shape.name} (${shape.role}): ${shape.hex} — Click to Seed`}
                  >
                    <div
                      className="w-full h-full relative overflow-hidden flex items-center justify-center shadow-lg"
                      style={{
                        clipPath: shape.clip,
                        borderRadius: shape.radius,
                        backgroundColor: shape.bg,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent animate-specular" />
                      <span
                        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs whitespace-nowrap"
                        style={{
                          backgroundColor: shape.fg,
                          color: shape.bg,
                        }}
                      >
                        {shape.name}
                      </span>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          )}

          {/* Dynamic Grid Layout */}
          {layoutMode === "grid" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 p-4">
              {activeShapes.map((shape, idx) => {
                const rotation = ((randomSeed * 23 + idx * 40) % 30) - 15
                return (
                  <motion.button
                    key={shape.id}
                    type="button"
                    onClick={() => onSeedChange(shape.hex)}
                    whileHover={{ scale: 1.12, rotate: 0 }}
                    whileTap={{ scale: 0.95 }}
                    transition={m3Springs.expressiveBouncy}
                    className="flex flex-col items-center gap-3 p-4 rounded-3xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 hover:border-[var(--md-sys-color-primary)] transition-colors cursor-pointer group"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                    }}
                  >
                    <div
                      className="w-20 h-20 relative overflow-hidden flex items-center justify-center shadow-md"
                      style={{
                        clipPath: shape.clip,
                        borderRadius: shape.radius,
                        backgroundColor: shape.bg,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-specular" />
                    </div>
                    <div className="text-center">
                      <span className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] block">
                        {shape.name}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--md-sys-color-outline)] block">
                        {shape.hex}
                      </span>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          )}

          {/* Asymmetric Scatter Layout */}
          {layoutMode === "scatter" && (
            <div className="relative w-full h-96 flex items-center justify-center">
              {activeShapes.map((shape, idx) => {
                const posX = ((idx * 97 + randomSeed * 71) % 70) - 35
                const posY = ((idx * 83 + randomSeed * 53) % 60) - 30
                const rot = ((idx * 47 + randomSeed * 31) % 90) - 45
                const scale = 0.9 + ((idx + randomSeed) % 3) * 0.15

                return (
                  <motion.button
                    key={shape.id}
                    type="button"
                    onClick={() => onSeedChange(shape.hex)}
                    whileHover={{ scale: scale * 1.25, zIndex: 30 }}
                    whileTap={{ scale: scale * 0.9 }}
                    transition={m3Springs.expressiveBouncy}
                    className="absolute w-24 h-24 sm:w-28 sm:h-28 cursor-pointer focus:outline-none group select-none flex items-center justify-center"
                    style={{
                      left: `calc(50% + ${posX * 8}px)`,
                      top: `calc(50% + ${posY * 4.5}px)`,
                      transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`,
                      filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.3))",
                    }}
                    title={`${shape.name}: ${shape.hex}`}
                  >
                    <div
                      className="w-full h-full relative overflow-hidden flex items-center justify-center shadow-lg"
                      style={{
                        clipPath: shape.clip,
                        borderRadius: shape.radius,
                        backgroundColor: shape.bg,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent animate-specular" />
                      <span
                        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs whitespace-nowrap"
                        style={{
                          backgroundColor: shape.fg,
                          color: shape.bg,
                        }}
                      >
                        {shape.role}
                      </span>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}


function PlaygroundSection({
  seed,
  onSeedChange,
  onSeedChangeFast,
  variant,
  onVariantChange,
  contrastNotes,
  share,
  mode,
  /** High-frequency path (pad drag): skips the view-transition sweep. */
}: {
  seed: string
  onSeedChange: (hex: string) => void
  onSeedChangeFast: (hex: string) => void
  variant: SchemeVariant
  onVariantChange: (v: SchemeVariant) => void
  contrastNotes: string[] | null
  share: ShareState
  mode: ColorMode
}) {
  const [dragging, setDragging] = useState(false)
  const [dropImg, setDropImg] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<string[] | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)
  const [activePreset, setActivePreset] = useState<string | null>("Violet")
  const [shareCopied, setShareCopied] = useState(false)
  const [isPadDragging, setIsPadDragging] = useState(false)
  const [isCardHovered, setIsCardHovered] = useState(false)
  const seedRamp = useMemo(
    () =>
      generateTonalPalette(seed, variant, mode).filter(({ tone }) =>
        [20, 40, 60, 80].includes(tone),
      ),
    [seed, variant, mode],
  )
  const hct = useMemo(() => seedHct(seed), [seed])

  const pickFromScreen = useCallback(async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        const eye = new (window as unknown as {
          EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> }
        }).EyeDropper()
        const { sRGBHex } = await eye.open()
        if (sRGBHex) {
          setActivePreset(null)
          onSeedChange(sRGBHex.toUpperCase())
        }
      } catch {
        // Dismissed — stay on the current seed.
      }
    } else {
      document.getElementById("seed-color-input")?.click()
    }
  }, [onSeedChange])

  // Image → 5 ranked candidates (quantize + chroma/coverage score).
  // Defaults to the top-ranked seed; top 3 stay selectable below.
  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setImgError("That file is not an image — try a JPG, PNG, or WebP.")
        return
      }
      setExtracting(true)
      setImgError(null)
      try {
        const { img, url } = await fileToImage(file)
        setDropImg((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
        const ranked = await extractCandidates(img, 5)
        setCandidates(ranked.slice(0, 3))
        if (ranked[0]) {
          onSeedChange(ranked[0])
          setActivePreset(null)
        }
      } catch {
        setImgError("Could not read that image. Try another file.")
      } finally {
        setExtracting(false)
      }
    },
    [onSeedChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) void processFile(file)
    },
    [processFile],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void processFile(file)
      e.target.value = "" // allow re-picking the same file
    },
    [processFile],
  )

  // Clipboard paste: screenshot → theme without touching the disk.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      )
      if (file) {
        e.preventDefault()
        void processFile(file)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [processFile])

  const clearImage = useCallback(() => {
    setDropImg((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setCandidates(null)
    setImgError(null)
  }, [])

  const pickPreset = (name: string, hex: string) => {
    setActivePreset(name)
    clearImage()
    onSeedChange(hex)
  }

  return (
    <section
      id="playground"
      className="relative flex flex-col justify-center overflow-hidden"
      style={{ background: "transparent", minHeight: "100dvh" }}
    >
      {/* Hero Content */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-5 md:px-10 pt-32 pb-16">
        <div className="mb-12">
          <p
            className="text-xs mb-2 tracking-widest uppercase"
            style={{ color: "var(--rt-p)", fontFamily: "var(--font-mono)" }}
          >
            Playground / Tune the engine
          </p>
          <h2
            className="font-display t-headline-l-em mb-3"
            style={{
              color: "var(--rt-onsf)",
            }}
          >
            Feed it color.
          </h2>
          <p
            className="text-base"
            style={{ color: "var(--rt-osv)", maxWidth: 560, lineHeight: 1.7 }}
          >
            Drag across HCT space, sample your screen, or drop a photo — every
            pixel below retones live from the same seed.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col">
            {/* Presets: pill buttons with dynamic active states */}
            <div className="flex flex-wrap items-center gap-2 mb-8">
              <span
                className="text-xs self-center mr-1 font-mono tracking-wider uppercase"
                style={{ color: "var(--md-sys-color-outline)" }}
              >
                Try a seed:
              </span>
              {PRESET_SEEDS.map(({ name, hex }) => {
                const isActive = activePreset === name
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => pickPreset(name, hex)}
                    className={`rounded-full px-4 py-2 font-medium text-xs transition-all duration-200 flex items-center gap-2 cursor-pointer touch-hit ${isActive
                      ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] scale-105 shadow-md ring-2 ring-[var(--md-sys-color-primary)]/80 font-semibold"
                      : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] hover:scale-102 border border-[var(--md-sys-color-outline-variant)]/40"
                      }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow-xs transition-transform duration-200"
                      style={{
                        backgroundColor: hex,
                        transform: isActive ? "scale(1.15)" : "scale(1)",
                      }}
                      aria-hidden="true"
                    />
                    <span>{name}</span>
                    {isActive && (
                      <md-icon style={{ fontSize: 14 }} aria-hidden="true">
                        check
                      </md-icon>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Scheme mode toggle buttons grouped into a segmented control bar */}
            <div className="mb-8">
              <p
                className="text-xs mb-2.5 tracking-wider font-mono uppercase"
                style={{ color: "var(--md-sys-color-outline)" }}
              >
                Scheme Variant
              </p>
              <div
                role="group"
                aria-label="Scheme variant"
                className="bg-[var(--md-sys-color-surface-container-highest)] p-1 rounded-[24px] flex gap-1 flex-wrap sm:flex-nowrap overflow-x-auto max-w-full shadow-xs border border-[var(--md-sys-color-outline-variant)]/30"
              >
                {VARIANT_ORDER.map((v) => {
                  const selected = variant === v
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={selected}
                      data-selected={selected}
                      onClick={() => onVariantChange(v)}
                      className={`rounded-[20px] px-3.5 py-1.5 text-xs font-medium transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap ${selected
                        ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] shadow-sm font-semibold scale-102"
                        : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]/60"
                        }`}
                    >
                      {selected && (
                        <md-icon style={{ fontSize: 16 }} aria-hidden="true">
                          check
                        </md-icon>
                      )}
                      <span>{VARIANT_LABELS[v]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {contrastNotes && contrastNotes.length > 0 && (
              <p
                role="status"
                className="text-xs mb-8 px-3.5 py-2 rounded-2xl inline-flex items-center gap-2"
                style={{
                  background: "color-mix(in srgb, #EAB308 14%, transparent)",
                  color: "var(--md-sys-color-on-surface)",
                  border:
                    "1px solid color-mix(in srgb, #EAB308 35%, transparent)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>
                  Contrast adjusted · {contrastNotes.length} role
                  {contrastNotes.length > 1 ? "s" : ""} retuned to 4.5:1
                </span>
              </p>
            )}
          </div>

          {/* Right: Expressive Controls */}
          <div className="flex flex-col gap-6">
            {/* Color Picker with glowing ambient backlight */}
            <div
              onMouseEnter={() => setIsCardHovered(true)}
              onMouseLeave={() => setIsCardHovered(false)}
              className="relative group transition-all duration-300"
            >
              {/* Glowing ambient backlight derived from var(--md-sys-color-primary) that expands on hover/drag */}
              <div
                aria-hidden="true"
                className={`absolute -inset-1.5 rounded-t-[40px] rounded-b-[20px] blur-2xl pointer-events-none transition-all duration-500 ease-out ${isPadDragging || isCardHovered
                  ? "opacity-75 scale-[1.03]"
                  : "opacity-30 scale-100"
                  }`}
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 35%, var(--md-sys-color-primary) 0%, color-mix(in srgb, var(--md-sys-color-primary-container) 65%, transparent) 45%, transparent 75%)",
                }}
              />

              {/* Expressive asymmetric surface */}
              <div
                className="relative bg-[var(--md-sys-color-surface-container)] rounded-t-[36px] rounded-b-[16px] border border-[var(--md-sys-color-outline-variant)]/40 p-6 shadow-xl transition-all duration-300"
                style={{
                  boxShadow:
                    isPadDragging || isCardHovered
                      ? "0 22px 48px -12px color-mix(in srgb, var(--md-sys-color-primary) 32%, transparent)"
                      : undefined,
                }}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                      Seed Color
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] font-mono border border-[var(--md-sys-color-outline-variant)]/30 shadow-2xs">
                      {seed.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copyText(shareUrl(share))) {
                          setShareCopied(true)
                          window.setTimeout(() => setShareCopied(false), 1600)
                        }
                      }}
                      className="rounded-full px-3 py-1 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                      aria-label="Copy share link for this theme"
                    >
                      <md-icon style={{ fontSize: 16 }} aria-hidden="true">
                        {shareCopied ? "check" : "link"}
                      </md-icon>
                      <span>{shareCopied ? "Link copied" : "Share"}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  <div
                    className="seed-ring relative flex-shrink-0 rounded-full overflow-hidden shadow-lg cursor-pointer hover:scale-105 transition-transform"
                    style={{
                      width: 80,
                      height: 80,
                      background: seed,
                      boxShadow: `0 0 0 3px var(--md-sys-color-surface-container-high), 0 0 24px color-mix(in srgb, ${seed} 55%, transparent)`,
                      transition:
                        "background var(--transition-theme), box-shadow var(--transition-theme), transform 200ms ease",
                    }}
                  >
                    <input
                      id="seed-color-input"
                      type="color"
                      value={seed}
                      aria-label="Pick seed color"
                      onChange={(e) => {
                        setActivePreset(null)
                        onSeedChange(e.target.value)
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      title="Pick seed color"
                    />
                    <div
                      aria-hidden="true"
                      className="seed-shape shape-squircle absolute inset-0 rounded-full pointer-events-none flex items-center justify-center"
                      style={{ background: seed }}
                    />
                  </div>

                  <div className="flex-1 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        Circle opens native picker
                      </p>
                      {/* Eyedropper button: Expressive FAB shape morph */}
                      <button
                        type="button"
                        onClick={() => void pickFromScreen()}
                        className="rounded-[16px] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] hover:rounded-[24px] transition-all duration-300 px-3.5 py-2 font-medium text-xs flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow-md active:scale-95"
                        aria-label="Sample a color from screen"
                        title="Sample a color from anywhere on screen"
                      >
                        <md-icon style={{ fontSize: 17 }} aria-hidden="true">
                          colorize
                        </md-icon>
                        <span>Eyedropper</span>
                      </button>
                    </div>

                    <div
                      className="flex gap-1.5"
                      role="img"
                      aria-label="Current seed at tones 20, 40, 60, 80"
                    >
                      {seedRamp.map(({ tone, hex }) => (
                        <div
                          key={tone}
                          className="flex-1 h-6 rounded-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer"
                          style={{
                            background: hex,
                            transition:
                              "background var(--transition-theme), transform 200ms ease, box-shadow 200ms ease",
                          }}
                          title={`Tone ${tone}: ${hex}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Hue/sat surface — drag to retone live */}
                <div className="mt-5">
                  <HueSatPad
                    seed={seed}
                    onSeedChange={(hex) => {
                      setActivePreset(null)
                      onSeedChangeFast(hex)
                    }}
                    onDragChange={setIsPadDragging}
                  />
                  <p
                    className="text-xs mt-2.5 text-center font-mono text-[var(--md-sys-color-on-surface-variant)]"
                    aria-live="polite"
                  >
                    H {hct.hue.toFixed(0)}° · C {hct.chroma.toFixed(1)} · T{" "}
                    {hct.tone.toFixed(0)} · {seed.toUpperCase()}
                  </p>
                </div>

                {/* Tactile live color-swatch bar displaying core tonal roles */}
                <div className="mt-5 pt-4 border-t border-[var(--md-sys-color-outline-variant)]/30">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-mono font-medium text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5">
                      <md-icon style={{ fontSize: 15 }} aria-hidden="true">
                        palette
                      </md-icon>
                      <span>Live Core Tonal Roles</span>
                    </span>
                    <span className="text-[10px] font-mono text-[var(--md-sys-color-outline)] uppercase tracking-wider">
                      M3 Tokens
                    </span>
                  </div>

                  <div
                    className="grid grid-cols-3 sm:grid-cols-6 gap-2"
                    role="group"
                    aria-label="Live core tonal roles"
                  >
                    {[
                      {
                        label: "Primary",
                        roleVar: "var(--md-sys-color-primary)",
                        onVar: "var(--md-sys-color-on-primary)",
                      },
                      {
                        label: "Pri Cont",
                        roleVar: "var(--md-sys-color-primary-container)",
                        onVar: "var(--md-sys-color-on-primary-container)",
                      },
                      {
                        label: "Secondary",
                        roleVar: "var(--md-sys-color-secondary)",
                        onVar: "var(--md-sys-color-on-secondary)",
                      },
                      {
                        label: "Sec Cont",
                        roleVar: "var(--md-sys-color-secondary-container)",
                        onVar: "var(--md-sys-color-on-secondary-container)",
                      },
                      {
                        label: "Tertiary",
                        roleVar: "var(--md-sys-color-tertiary)",
                        onVar: "var(--md-sys-color-on-tertiary)",
                      },
                      {
                        label: "Ter Cont",
                        roleVar: "var(--md-sys-color-tertiary-container)",
                        onVar: "var(--md-sys-color-on-tertiary-container)",
                      },
                    ].map(({ label, roleVar, onVar }) => (
                      <div
                        key={label}
                        className="group/swatch relative flex flex-col items-center justify-center py-2 px-1.5 rounded-xl transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-md active:scale-95 select-none border border-white/10"
                        style={{
                          backgroundColor: roleVar,
                          color: onVar,
                        }}
                        title={`${label}: ${roleVar}`}
                      >
                        <span className="text-[10px] font-mono font-bold tracking-tight text-center truncate w-full">
                          {label}
                        </span>
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-1 opacity-60 group-hover/swatch:opacity-100 transition-opacity"
                          style={{ backgroundColor: onVar }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Image seed — drop, browse, or paste. Quantized + scored. */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              aria-busy={extracting}
              className="rounded-3xl transition-all"
              style={{
                border: `2px dashed ${dragging ? "var(--rt-p)" : "var(--rt-surf3)"
                  }`,
                background: dragging
                  ? "color-mix(in srgb, var(--rt-pc) 15%, transparent)"
                  : "var(--rt-surf1)",
                minHeight: 140,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {dropImg ? (
                <div className="p-3">
                  <div className="relative">
                    <img
                      src={dropImg}
                      alt="Uploaded image used for palette extraction"
                      className="w-full h-40 object-cover"
                      style={{ borderRadius: 18 }}
                    />
                    <MIconButton
                      label="Remove uploaded image"
                      onClick={clearImage}
                      className="absolute top-2 right-2"
                      style={{
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                      }}
                    >
                      <MIcon name="close" />
                    </MIconButton>
                  </div>
                  {candidates && candidates.length > 0 && (
                    <div className="flex items-center gap-3 mt-3 px-1 pb-1">
                      <span
                        className="text-xs"
                        style={{
                          color: "var(--rt-outline)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Top picks
                      </span>
                      <div
                        className="flex gap-2"
                        role="group"
                        aria-label="Top extracted seed colors"
                      >
                        {candidates.map((hex, i) => {
                          const selected =
                            seed.toUpperCase() === hex.toUpperCase()
                          return (
                            <button
                              key={hex + i}
                              type="button"
                              aria-pressed={selected}
                              title={`${hex} — use as seed${i === 0 ? " (top ranked)" : ""
                                }`}
                              aria-label={`Use ${hex} as seed${i === 0 ? ", top ranked" : ""
                                }`}
                              onClick={() => {
                                setActivePreset(null)
                                onSeedChange(hex)
                              }}
                              className="rounded-full transition-transform hover:scale-110"
                              style={{
                                width: 44,
                                height: 44,
                                minWidth: 44,
                                minHeight: 44,
                                background: hex,
                                border: selected
                                  ? "2px solid var(--rt-p)"
                                  : "2px solid rgba(255,255,255,0.25)",
                                boxShadow: selected
                                  ? "0 0 0 2px color-mix(in srgb, var(--rt-p) 40%, transparent)"
                                  : "none",
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-auto min-h-36 gap-2 py-6 px-4 text-center">
                  <MIcon
                    name="upload"
                    style={{ color: "var(--rt-outline)", fontSize: 28 }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "var(--rt-outline)" }}
                  >
                    {extracting
                      ? "Scoring colors…"
                      : "Drop a photo to extract its palette"}
                  </span>
                  <label
                    className="text-xs px-4 py-2 rounded-full"
                    style={{
                      minHeight: 36,
                      display: "inline-flex",
                      alignItems: "center",
                      background: "var(--rt-surf3)",
                      color: "var(--rt-p)",
                      border: "1px solid var(--rt-outline)",
                      fontWeight: 500,
                    }}
                  >
                    or browse files
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      aria-label="Upload a photo to extract its palette"
                      onChange={handleFileInput}
                      style={{
                        position: "absolute",
                        width: 1,
                        height: 1,
                        opacity: 0,
                      }}
                    />
                  </label>
                  <span
                    className="text-xs"
                    style={{ color: "var(--rt-outline)", opacity: 0.6 }}
                  >
                    Drop · browse · paste — JPG, PNG, WebP
                  </span>
                </div>
              )}
              <span aria-live="polite" className="sr-only">
                {dragging ? "Release to extract palette" : ""}
                {extracting ? "Extracting colors from image." : ""}
                {imgError ?? ""}
              </span>
              {imgError && !dropImg && (
                <p
                  role="alert"
                  className="text-xs text-center pb-3 px-4"
                  style={{ color: "#FCA5A5" }}
                >
                  {imgError}
                </p>
              )}
              <RefreshIndicator
                open={extracting}
                label="Scoring colors from image"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const RAMP_FAMILIES = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "tertiary", label: "Tertiary" },
  { key: "neutral", label: "Neutral" },
  { key: "neutral-variant", label: "Neutral Variant" },
  { key: "error", label: "Error" },
] as const

/** Container/on-container pairs for expressive accessibility auditing. */
const ACCESSIBILITY_CARDS: Array<{
  id: string
  bg: RoleKey
  fg: RoleKey
  title: string
  subtitle: string
  shapeClass: string
  varName: string
}> = [
    {
      id: "primary",
      bg: "primary-container",
      fg: "on-primary-container",
      title: "Primary Container",
      subtitle: "High-emphasis hero elements & actions",
      shapeClass:
        "rounded-[28px] rounded-tl-[8px] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]",
      varName: "var(--md-sys-color-primary-container)",
    },
    {
      id: "secondary",
      bg: "secondary-container",
      fg: "on-secondary-container",
      title: "Secondary Container",
      subtitle: "Medium-emphasis chips, badges & toggles",
      shapeClass:
        "rounded-[28px] rounded-tr-[8px] bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]",
      varName: "var(--md-sys-color-secondary-container)",
    },
    {
      id: "tertiary",
      bg: "tertiary-container",
      fg: "on-tertiary-container",
      title: "Tertiary Container",
      subtitle: "Playful balancing accents & expressive tags",
      shapeClass:
        "rounded-[28px] rounded-bl-[8px] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]",
      varName: "var(--md-sys-color-tertiary-container)",
    },
    {
      id: "error",
      bg: "error-container",
      fg: "on-error-container",
      title: "Error Container",
      subtitle: "Critical warnings, errors & validation alerts",
      shapeClass:
        "rounded-[28px] rounded-br-[8px] bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]",
      varName: "var(--md-sys-color-error-container)",
    },
  ]

function ContrastBadge({ ratio }: { ratio: number }) {
  const aaa = ratio >= 7
  const aa = ratio >= 4.5
  const label = aaa ? "AAA" : aa ? "AA" : "Low"
  return (
    <span
      className="bg-[var(--md-sys-color-surface)]/90 text-[var(--md-sys-color-on-surface)] rounded-full px-3 py-1 font-mono text-xs font-bold shadow-sm inline-flex items-center gap-1.5 backdrop-blur-xs border border-[var(--md-sys-color-outline-variant)]/30 select-none"
      title={`WCAG contrast ratio: ${ratio.toFixed(2)}:1`}
    >
      <span
        className={`w-2 h-2 rounded-full ${aaa ? "bg-emerald-500" : aa ? "bg-teal-500" : "bg-amber-500"
          }`}
        aria-hidden="true"
      />
      <span>
        {label} · {ratio.toFixed(1)}
      </span>
    </span>
  )
}

function TokenCodeTag({
  varName,
  copiedKey,
  onCopy,
}: {
  varName: string
  copiedKey: string | null
  onCopy: (key: string, text: string) => void
}) {
  const isCopied = copiedKey === varName
  return (
    <button
      type="button"
      onClick={() => onCopy(varName, varName)}
      className={`group/token relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-medium cursor-pointer transition-all duration-200 select-none border ${isCopied
        ? "bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 border-emerald-500/40 scale-105 shadow-sm"
        : "bg-[var(--md-sys-color-surface)]/30 text-inherit border-current/20 hover:bg-[var(--md-sys-color-surface)]/50 hover:border-current/40 hover:scale-102 active:scale-95"
        }`}
      title={`Click to copy ${varName}`}
      aria-label={`Copy CSS variable ${varName}`}
    >
      <md-icon
        style={{ fontSize: 14 }}
        className={`transition-transform duration-300 ${isCopied ? "scale-125 rotate-12" : "group-hover/token:scale-110"
          }`}
        aria-hidden="true"
      >
        {isCopied ? "check" : "content_copy"}
      </md-icon>
      <span className="truncate">{isCopied ? "Copied ✓" : varName}</span>
    </button>
  )
}

function PalettePanel({
  seed,
  variant = "tonal-spot",
  mode = "dark",
}: {
  seed: string
  variant?: SchemeVariant
  mode?: ColorMode
}) {
  const ramps = useMemo(
    () => getHueRamps(seed, variant, mode),
    [seed, variant, mode],
  )
  const theme = useMemo(
    () => getEngineTheme(seed, variant, mode),
    [seed, variant, mode],
  )
  const checks = useMemo(() => auditContrast(theme.roles), [theme])
  const [copied, setCopied] = useState<string | null>(null)

  const copy = useCallback(async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    }
  }, [])

  return (
    <section
      id="proof"
      className="py-24 px-5 md:px-10"
      style={{ background: "var(--rt-surf1)" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <div className="mb-3 w-fit">
              <span className="bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider inline-flex items-center gap-2 shadow-xs">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "var(--md-sys-color-tertiary)" }}
                  aria-hidden="true"
                />
                <span>PROOF & ACCESSIBILITY AUDIT</span>
              </span>
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] mb-3">
              Every hue, 0–100.
            </h2>
            <p className="text-[var(--md-sys-color-on-surface-variant)] text-base max-w-xl leading-relaxed">
              Straight from the scheme palettes — hover any swatch for its hex,
              activate it to copy, and verify guaranteed WCAG contrast standards.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] font-mono text-xs border border-[var(--md-sys-color-outline-variant)]/30 shadow-xs self-start md:self-auto">
            <span
              className="w-2.5 h-2.5 rounded-full shadow-xs"
              style={{ backgroundColor: seed }}
              aria-hidden="true"
            />
            <span>
              {VARIANT_LABELS[variant]} · {mode.toUpperCase()} ·{" "}
              {seed.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Per-hue continuous swatch strips */}
        <div className="flex flex-col gap-6 mb-16">
          {RAMP_FAMILIES.map(({ key, label }) => (
            <div
              key={key}
              className="flex flex-col lg:flex-row lg:items-center gap-2.5 lg:gap-5"
            >
              <div className="w-36 shrink-0 flex items-center justify-between lg:justify-start gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
                  {label}
                </span>
                <span className="text-[10px] font-mono text-[var(--md-sys-color-outline)]">
                  0–100
                </span>
              </div>
              <div
                role="group"
                aria-label={`${label} tonal ramp, tones 0 to 100. Activate a swatch to copy its hex.`}
                className="rounded-[20px] overflow-hidden border border-[var(--md-sys-color-outline-variant)]/20 shadow-inner flex gap-1.5 p-1.5 flex-1 overflow-x-auto bg-[var(--md-sys-color-surface-container-low)]/60 backdrop-blur-xs select-none"
              >
                {ramps[key].map(({ tone, hex }) => {
                  const isCopied = copied === `${key}-${tone}`
                  const lightText = tone < 50
                  return (
                    <button
                      key={tone}
                      type="button"
                      title={`${label} ${tone} · ${hex.toUpperCase()} — click to copy`}
                      aria-label={`${label} tone ${tone}, ${hex.toUpperCase()}. Click to copy hex.`}
                      onClick={() => copy(`${key}-${tone}`, hex.toUpperCase())}
                      className={`group relative flex-1 min-w-[34px] sm:min-w-[42px] h-14 rounded-lg transition-all duration-200 cursor-pointer hover:scale-110 hover:z-10 hover:rounded-xl hover:shadow-lg flex flex-col items-center justify-between py-1.5 px-0.5 ${isCopied ? "scale-95 ring-2 ring-white" : ""
                        }`}
                      style={{
                        backgroundColor: hex,
                      }}
                    >
                      <span
                        className="text-[9px] font-mono font-semibold opacity-60 group-hover:opacity-100 transition-opacity"
                        style={{ color: lightText ? "#fff" : "#000" }}
                      >
                        {tone}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-[8px] font-mono tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity font-bold truncate max-w-full px-0.5"
                        style={{ color: lightText ? "#fff" : "#000" }}
                      >
                        {isCopied ? "✓" : hex.replace("#", "")}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Accessibility Section Title */}
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--md-sys-color-primary)] mb-1">
            Accessibility / WCAG Contrast
          </p>
          <h3 className="font-display text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
            Guaranteed Contrast Pairs
          </h3>
        </div>

        {/* 4 Expressive Asymmetric Accessibility Contrast Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ACCESSIBILITY_CARDS.map(
            ({ id, bg, fg, title, subtitle, shapeClass, varName }) => {
              const bgHex = theme.roles[bg]
              const fgHex = theme.roles[fg]
              const check = checks.find(
                (c) => c.fg === fgHex && c.bg === bgHex,
              )
              const ratio = check ? check.ratio : 7.2

              return (
                <motion.div
                  key={id}
                  variants={m3CardVariants}
                  initial="rest"
                  whileHover="hover"
                  whileTap="tap"
                  className={`${shapeClass} p-7 shadow-lg flex flex-col justify-between min-h-[220px] border border-black/5 dark:border-white/10 cursor-pointer`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h4 className="text-lg font-bold tracking-tight">
                          {title}
                        </h4>
                        <p className="text-xs opacity-80 mt-0.5 font-medium">
                          {subtitle}
                        </p>
                      </div>
                      <ContrastBadge ratio={ratio} />
                    </div>

                    <p className="text-sm leading-relaxed mb-6 opacity-90 font-medium">
                      Every dynamic seed automatically passes WCAG accessibility
                      contrast ratios for container & on-container pairing.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-current/15">
                    <TokenCodeTag
                      varName={varName}
                      copiedKey={copied}
                      onCopy={copy}
                    />

                    <div className="flex items-center gap-2 text-xs font-mono opacity-85">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-full border border-current/30 shadow-2xs"
                          style={{ backgroundColor: bgHex }}
                          aria-hidden="true"
                        />
                        <span>{bgHex}</span>
                      </span>
                      <span aria-hidden="true" className="opacity-40">
                        →
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-full border border-current/30 shadow-2xs"
                          style={{ backgroundColor: fgHex }}
                          aria-hidden="true"
                        />
                        <span>{fgHex}</span>
                      </span>
                    </div>
                  </div>
                </motion.div>
              )
            },
          )}
        </div>
      </div>
    </section>
  )
}

function SettingRow({
  label,
  desc,
  checked,
  onToggle,
  icon,
}: {
  label: string
  desc: string
  checked: boolean
  onToggle: () => void
  icon?: string
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b last:border-0 border-[var(--md-sys-color-outline-variant)]/20">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] shrink-0">
            <md-icon style={{ fontSize: 18 }} aria-hidden="true">
              {icon}
            </md-icon>
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
            {label}
          </p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            {desc}
          </p>
        </div>
      </div>
      <MSwitch
        selected={checked}
        onSelected={() => onToggle()}
        label={label}
        icons={true}
        style={
          {
            "--md-switch-selected-track-color": "var(--md-sys-color-primary)",
            "--md-switch-selected-handle-color": "var(--md-sys-color-on-primary)",
            "--md-switch-selected-icon-color": "var(--md-sys-color-primary)",
            "--md-switch-track-color": "var(--md-sys-color-surface-container-highest)",
          } as CSSProperties
        }
      />
    </div>
  )
}

function FabLab() {
  const [fabState, setFabState] = useState<"square" | "stadium" | "scalloped">("square")

  const nextState = () => {
    setFabState((curr) => {
      if (curr === "square") return "stadium"
      if (curr === "stadium") return "scalloped"
      return "square"
    })
  }

  return (
    <motion.div
      variants={m3CardVariants}
      initial="rest"
      whileHover="hover"
      className="panel p-6 flex flex-col items-center gap-5"
    >
      <div className="w-full flex items-center justify-between">
        <p className="text-xs tracking-widest uppercase font-mono text-[var(--md-sys-color-outline)]">
          FAB Lab
        </p>
        <span className="text-[10px] font-mono text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/50 px-2 py-0.5 rounded-full">
          Spring Morph
        </span>
      </div>

      {/* State Switcher Chips */}
      <div className="flex items-center gap-1.5 p-1 rounded-full bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 text-xs font-mono">
        {(
          [
            { id: "square", label: "State A: Square" },
            { id: "stadium", label: "State B: Stadium" },
            { id: "scalloped", label: "State C: Scalloped" },
          ] as const
        ).map(({ id, label }) => (
          <motion.button
            key={id}
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={m3Springs.expressiveBouncy}
            onClick={() => setFabState(id)}
            className={`px-3 py-1 rounded-full cursor-pointer ${fabState === id
              ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold shadow-xs"
              : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
              }`}
          >
            {label}
          </motion.button>
        ))}
      </div>

      {/* Interactive Morphing FAB Canvas */}
      <div className="h-32 w-full flex items-center justify-center p-4 relative">
        <motion.button
          type="button"
          onClick={nextState}
          variants={m3ShapeVariants}
          initial="rest"
          whileHover="hover"
          whileTap="tap"
          animate={fabState === "scalloped" ? "fabMorph" : "rest"}
          aria-label={`Current state: ${fabState}. Click to morph to next shape.`}
          className={`cursor-pointer shadow-lg hover:shadow-xl flex items-center justify-center gap-2.5 select-none overflow-hidden ${fabState === "square"
            ? "rounded-[16px] w-16 h-16 bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
            : fabState === "stadium"
              ? "rounded-full px-6 h-14 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] min-w-[180px]"
              : "w-18 h-18 rotate-45 bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
            }`}
          transition={m3Springs.expressiveBouncy}
        >
          <span
            className={`flex items-center gap-2 transition-transform duration-300 ${fabState === "scalloped" ? "-rotate-45" : ""
              }`}
          >
            <md-icon style={{ fontSize: 24 }} aria-hidden="true">
              {fabState === "square"
                ? "edit"
                : fabState === "stadium"
                  ? "add"
                  : "auto_awesome"}
            </md-icon>
            {fabState === "stadium" && (
              <span className="font-semibold text-sm tracking-wide whitespace-nowrap">
                Create Action
              </span>
            )}
          </span>
        </motion.button>
      </div>

      {/* Geometry readout */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)]/60 px-3.5 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)]/20">
        <span className="w-2 h-2 rounded-full bg-[var(--md-sys-color-primary)] animate-pulse" />
        <span>
          {fabState === "square" && "State A · 16px soft square (rounded-[16px])"}
          {fabState === "stadium" && "State B · Extended Stadium (rounded-full px-6)"}
          {fabState === "scalloped" && "State C · Scalloped 45° morph (rounded-[32px])"}
        </span>
      </div>
    </motion.div>
  )
}

function ComponentShowcase({
  theme,
  mode,
  onModeChange,
  motion: motionPref,
  onMotionToggle,
  ambientOn,
  onToggleAmbient,
}: {
  theme: ThemeRoles
  mode: ColorMode
  onModeChange: (m: ColorMode) => void
  motion: MotionPreference
  onMotionToggle: () => void
  ambientOn: boolean
  onToggleAmbient: () => void
}) {
  const darkMode = mode === "dark"
  const [filter, setFilter] =
    useState<"all" | "buttons" | "surfaces" | "controls">("all")
  const [corner, setCorner] = useState(28)

  return (
    <section
      id="gallery"
      className="py-24 px-5 md:px-10"
      style={{ background: "var(--rt-surf)" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <div className="mb-3 w-fit">
            <span className="bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider inline-flex items-center gap-2 shadow-xs">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--md-sys-color-tertiary)" }}
                aria-hidden="true"
              />
              <span>EXPRESSIVE DESIGN SYSTEM PLAYGROUND</span>
            </span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] mb-3">
            Every component obeys.
          </h2>
          <p className="text-[var(--md-sys-color-on-surface-variant)] text-base mb-8 max-w-2xl leading-relaxed">
            Every component is dynamic and token-wired. Press, toggle, and drag
            them to explore Material 3 Expressive spring physics, asymmetric
            geometry, and semantic roles.
          </p>

          {/* Category Filter Tabs with active spring indicators */}
          <div
            className="flex flex-wrap items-center gap-2.5"
            role="tablist"
            aria-label="Component gallery category filters"
          >
            {[
              { value: "all", label: "All", icon: "dashboard" },
              { value: "buttons", label: "Buttons", icon: "smart_button" },
              { value: "surfaces", label: "Surfaces", icon: "layers" },
              { value: "controls", label: "Controls", icon: "toggle_on" },
            ].map(({ value, label, icon }) => {
              const isActive = filter === value
              return (
                <motion.button
                  key={value}
                  role="tab"
                  aria-selected={isActive}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={m3Springs.expressiveBouncy}
                  onClick={() => setFilter(value as any)}
                  className={`rounded-full px-5 py-2 text-xs font-semibold tracking-wide flex items-center gap-2 cursor-pointer select-none ${isActive
                    ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] shadow-sm scale-105"
                    : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]/30"
                    }`}
                >
                  <md-icon style={{ fontSize: 18 }} aria-hidden="true">
                    {icon}
                  </md-icon>
                  <span>{label}</span>
                </motion.button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Col 1: Button Hierarchy & FAB Lab */}
          {(filter === "all" || filter === "buttons") && (
            <div className="flex flex-col gap-6">
              {/* Button Hierarchy Card */}
              <motion.div
                variants={m3CardVariants}
                initial="rest"
                whileHover="hover"
                className="panel p-6 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs tracking-widest uppercase font-mono text-[var(--md-sys-color-outline)]">
                    Button Hierarchy
                  </p>
                  <span className="text-[10px] font-mono text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/50 px-2 py-0.5 rounded-full">
                    Expressive
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Scalloped elevated button */}
                  <motion.button
                    type="button"
                    variants={m3ShapeVariants}
                    initial="rest"
                    whileHover="hover"
                    whileTap="tap"
                    className="rounded-[24px_10px_24px_10px] bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-primary)] shadow-md hover:shadow-lg px-6 py-3.5 font-semibold text-sm flex items-center justify-center gap-2.5 border border-[var(--md-sys-color-outline-variant)]/30 cursor-pointer"
                  >
                    <md-icon style={{ fontSize: 20 }}>elevation</md-icon>
                    <span>Elevated — Scalloped Geometry</span>
                  </motion.button>

                  {/* Icon-extended filled button */}
                  <motion.button
                    type="button"
                    variants={m3ShapeVariants}
                    initial="rest"
                    whileHover="hover"
                    whileTap="tap"
                    className="rounded-[28px] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-md hover:shadow-lg px-6 py-3.5 font-semibold text-sm flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <md-icon style={{ fontSize: 20 }}>send</md-icon>
                    <span>Filled — Icon Extended Primary</span>
                  </motion.button>

                  {/* Tonal button */}
                  <motion.button
                    type="button"
                    variants={m3ShapeVariants}
                    initial="rest"
                    whileHover="hover"
                    whileTap="tap"
                    className="rounded-[28px] bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] px-6 py-3.5 font-medium text-sm flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <md-icon style={{ fontSize: 20 }}>bookmark</md-icon>
                    <span>Tonal — Secondary Pill</span>
                  </motion.button>

                  {/* Scalloped outlined button */}
                  <motion.button
                    type="button"
                    variants={m3ShapeVariants}
                    initial="rest"
                    whileHover="hover"
                    whileTap="tap"
                    className="rounded-[12px_24px_12px_24px] border-2 border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/10 px-6 py-3 font-medium text-sm flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <md-icon style={{ fontSize: 20 }}>tune</md-icon>
                    <span>Outlined — Expressive Corner</span>
                  </motion.button>

                  {/* Subtle text button */}
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={m3Springs.expressiveBouncy}
                    className="rounded-full text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/10 px-4 py-2.5 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Text — Subtle Action</span>
                    <md-icon style={{ fontSize: 18 }}>arrow_forward</md-icon>
                  </motion.button>
                </div>
              </motion.div>

              {/* Floating Action Button (FAB) Lab */}
              <FabLab />
            </div>
          )}

          {/* Col 2: Content & Surface Cards */}
          {(filter === "all" || filter === "surfaces") && (
            <div className="flex flex-col gap-6">
              <p className="text-xs tracking-widest uppercase font-mono text-[var(--md-sys-color-outline)]">
                Content & Surface Cards
              </p>

              {/* Surface Card 1: Elevated with dynamic cover */}
              <motion.div
                variants={m3CardVariants}
                initial="rest"
                whileHover="hover"
                className="overflow-hidden rounded-[28px] border border-[var(--md-sys-color-outline-variant)]/20 shadow-md bg-[var(--md-sys-color-surface-container)]"
              >
                <div
                  className="h-36 w-full relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-secondary-container))`,
                    transition: "background var(--transition-theme)",
                  }}
                >
                  <div className="p-5 pt-4">
                    <span
                      className="text-xs px-3 py-1 rounded-full bg-black/25 backdrop-blur-xs font-mono font-semibold"
                      style={{
                        color: "var(--md-sys-color-on-primary-container)",
                      }}
                    >
                      Material You Expressive
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-display text-lg font-bold mb-2 text-[var(--md-sys-color-on-surface)]">
                    Dynamic Surface Roles
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)] mb-4">
                    Surfaces use tonal layering instead of harsh drop shadows.
                    Container, high, and highest levels establish accessible
                    hierarchy effortlessly.
                  </p>
                  <button
                    type="button"
                    onClick={() => scrollToSection("proof")}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
                  >
                    <span>Explore system</span>
                    <md-icon style={{ fontSize: 18 }}>arrow_forward</md-icon>
                  </button>
                </div>
              </motion.div>

              {/* Surface Card 2: Error Container */}
              <motion.div
                variants={m3CardVariants}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
                className="p-6 rounded-[28px] rounded-br-[8px] bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] border border-black/5 dark:border-white/10 shadow-md cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <md-icon
                    style={{
                      color: "var(--md-sys-color-error)",
                      fontSize: 24,
                    }}
                  >
                    error
                  </md-icon>
                  <span className="text-sm font-bold">
                    Error Container Role
                  </span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">
                  The error channel keeps its own seed-independent hue, while its
                  tones still follow the light/dark mapping — danger reads as
                  danger under every seed.
                </p>
              </motion.div>
            </div>
          )}

          {/* Col 3: Settings panel & Shape Lab */}
          {(filter === "all" || filter === "controls") && (
            <div className="flex flex-col gap-6">
              {/* Settings Panel Card with M3 Expressive switches */}
              <motion.div
                variants={m3CardVariants}
                initial="rest"
                whileHover="hover"
                className="panel p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs tracking-widest uppercase font-mono text-[var(--md-sys-color-outline)]">
                    Settings Panel
                  </p>
                  <span className="text-[10px] font-mono text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/50 px-2 py-0.5 rounded-full">
                    M3 Switches
                  </span>
                </div>

                <div className="flex flex-col">
                  <SettingRow
                    label={`${darkMode ? "Dark" : "Light"} mode`}
                    desc="Surface & container tonal remapping"
                    checked={darkMode}
                    onToggle={() => onModeChange(darkMode ? "light" : "dark")}
                    icon={darkMode ? "dark_mode" : "light_mode"}
                  />
                  <SettingRow
                    label="Ambient seed"
                    desc={
                      ambientOn
                        ? "Harmonizing with current time of day"
                        : "Fixed seed mode"
                    }
                    checked={ambientOn}
                    onToggle={onToggleAmbient}
                    icon="schedule"
                  />
                  <SettingRow
                    label="Reduce motion"
                    desc={
                      motionPref === "reduced"
                        ? "Instant transitions without springs"
                        : "Full expressive spring physics"
                    }
                    checked={motionPref === "reduced"}
                    onToggle={onMotionToggle}
                    icon="motion_photos_on"
                  />
                </div>
              </motion.div>

              {/* Shape Lab Card with live corner radius morphing */}
              <motion.div
                variants={m3CardVariants}
                initial="rest"
                whileHover="hover"
                className="panel p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs tracking-widest uppercase font-mono text-[var(--md-sys-color-outline)]">
                    Shape Lab
                  </p>
                  <span className="text-[10px] font-mono text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/50 px-2 py-0.5 rounded-full">
                    Live Morph
                  </span>
                </div>

                <div
                  className="w-full h-32 mb-4 transition-all duration-300 flex items-center justify-center p-4 border border-[var(--md-sys-color-outline-variant)]/30 shadow-md relative overflow-hidden group select-none"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--md-sys-color-primary-container) 0%, var(--md-sys-color-tertiary-container) 100%)",
                    borderRadius: `${corner}px`,
                    transition:
                      "border-radius 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                  role="img"
                  aria-label={`Shape preview with ${corner} pixel corner radius`}
                >
                  <div className="text-center z-10">
                    <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[var(--md-sys-color-surface)]/85 backdrop-blur-sm text-[var(--md-sys-color-on-surface)] shadow-xs">
                      border-radius: {corner}px
                    </span>
                    <p className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] mt-2 opacity-80">
                      Live dynamic geometry morph
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
                    Corner Radius
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--md-sys-color-primary)]">
                    {corner}px
                  </span>
                </div>

                <MSlider
                  value={corner}
                  min={0}
                  max={64}
                  labeled={true}
                  onValue={setCorner}
                  label={`Corner radius, ${corner} pixels`}
                  className="w-full"
                  style={
                    {
                      "--md-slider-active-track-color":
                        "var(--md-sys-color-primary)",
                      "--md-slider-handle-color":
                        "var(--md-sys-color-primary)",
                      "--md-slider-focus-handle-color":
                        "var(--md-sys-color-primary)",
                      "--md-slider-hover-handle-color":
                        "var(--md-sys-color-primary)",
                      "--md-slider-label-container-color":
                        "var(--md-sys-color-primary)",
                      "--md-slider-label-label-text-color":
                        "var(--md-sys-color-on-primary)",
                    } as CSSProperties
                  }
                />
              </motion.div>

              {/* Role Tokens Card */}
              <motion.div
                variants={m3CardVariants}
                initial="rest"
                whileHover="hover"
                className="panel p-6"
              >
                <p className="text-xs mb-4 tracking-widest uppercase font-mono text-[var(--md-sys-color-outline)]">
                  Role Tokens
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      label: "Primary",
                      bg: "var(--md-sys-color-primary)",
                      fg: "var(--md-sys-color-on-primary)",
                    },
                    {
                      label: "Primary Container",
                      bg: "var(--md-sys-color-primary-container)",
                      fg: "var(--md-sys-color-on-primary-container)",
                    },
                    {
                      label: "Secondary",
                      bg: "var(--md-sys-color-secondary)",
                      fg: "var(--md-sys-color-on-secondary)",
                    },
                    {
                      label: "Tertiary",
                      bg: "var(--md-sys-color-tertiary)",
                      fg: "var(--md-sys-color-on-tertiary)",
                    },
                  ].map(({ label, bg, fg }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between px-3 py-2 rounded-xl transition-colors duration-300"
                      style={{
                        background: bg,
                      }}
                    >
                      <span
                        className="text-xs font-semibold"
                        style={{ color: fg }}
                      >
                        {label}
                      </span>
                      <span
                        className="text-xs font-mono opacity-80"
                        style={{ color: fg }}
                      >
                        {label.toLowerCase().replace(/ /g, "-")}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function AboutSection({
  seed,
  variant,
  mode,
}: {
  seed: string
  variant: SchemeVariant
  mode: ColorMode
}) {
  const [scrubTone, setScrubTone] = useState(50)
  const hct = useMemo(() => seedHct(seed), [seed])

  const toRgb = (
    h: number,
    s: number,
    l: number,
  ): [number, number, number] => {
    if (s === 0) return [l, l, l]
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const f = (t: number) => {
      let tt = t
      if (tt < 0) tt += 1
      if (tt > 1) tt -= 1
      if (tt < 1 / 6) return p + (q - p) * 6 * tt
      if (tt < 1 / 2) return q
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
      return p
    }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
  }

  const rgbToHex = (r: number, g: number, b: number): string => {
    const hex = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v * 255)))
        .toString(16)
        .padStart(2, "0")
    return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase()
  }

  const { h0, s0 } = useMemo(() => {
    const m = seed.replace("#", "")
    const r0 = parseInt(m.slice(0, 2), 16) / 255
    const g0 = parseInt(m.slice(2, 4), 16) / 255
    const b0 = parseInt(m.slice(4, 6), 16) / 255
    const mx = Math.max(r0, g0, b0)
    const mn = Math.min(r0, g0, b0)
    const l0 = (mx + mn) / 2
    let h = 0
    let s = 0
    if (mx !== mn) {
      const d = mx - mn
      s = l0 > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
      if (mx === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) / 6
      else if (mx === g0) h = (b0 - r0) / d + 2
      else h = (r0 - g0) / d + 4
      h /= 6
    }
    return { h0: h, s0: s }
  }, [seed])

  const naive = useMemo(() => {
    return [10, 20, 30, 40, 50, 60, 70, 80, 90].map((tone) => {
      const [r, g, b] = toRgb(h0, s0, tone / 100)
      return { tone, hex: rgbToHex(r, g, b) }
    })
  }, [h0, s0])

  const real = useMemo(
    () =>
      getHueRamps(seed, variant, mode).primary.filter((s) =>
        [10, 20, 30, 40, 50, 60, 70, 80, 90].includes(s.tone),
      ),
    [seed, variant, mode],
  )

  const currentHslHex = useMemo(() => {
    const [r, g, b] = toRgb(h0, s0, scrubTone / 100)
    return rgbToHex(r, g, b)
  }, [h0, s0, scrubTone])

  const currentHctHex = useMemo(() => {
    return hexFromHct(hct.hue, hct.chroma, scrubTone)
  }, [hct, scrubTone])

  return (
    <section
      id="about"
      className="py-24 px-5 md:px-10"
      style={{ background: "var(--rt-surf)" }}
    >
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
        {/* Left Column (Editorial Typography - 6 cols) */}
        <div className="lg:col-span-6 flex flex-col justify-center">
          {/* Section Tag */}
          <div className="mb-4 w-fit">
            <span className="bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-3 py-1 rounded-full text-xs font-mono font-bold inline-flex items-center gap-2 shadow-2xs">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--md-sys-color-tertiary)" }}
                aria-hidden="true"
              />
              <span>COLOR SCIENCE · HSL VS HCT</span>
            </span>
          </div>

          {/* Headline */}
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--md-sys-color-on-surface)] leading-[1.08] mb-6">
            HSL shifts hues.
            <br />
            <span className="text-[var(--md-sys-color-tertiary)] font-black inline-block mt-1">
              HCT keeps meaning.
            </span>
          </h2>

          {/* Editorial Content */}
          <p className="text-base sm:text-lg mb-5 text-[var(--md-sys-color-on-surface-variant)] leading-relaxed font-normal">
            HSL lightness is a mathematical shortcut, not how the human visual cortex perceives light. Pure yellow at lightness 50% appears blindingly bright, while pure blue at lightness 50% appears dark and heavy. When you sweep lightness in HSL, your hue shifts and contrast collapses.
          </p>

          <p className="text-base text-[var(--md-sys-color-on-surface-variant)] leading-relaxed mb-8 font-normal">
            Google's <strong>HCT model</strong> (Hue, Chroma, Tone) grounds color science in human biology using CAM16. Tone is true perceptual luminance: Tone 50 has the exact same visual weight whether it is violet, emerald, amber, or cobalt.
          </p>

          {/* Editorial Feature List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--md-sys-color-outline-variant)]/25">
            <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)]/50 border border-[var(--md-sys-color-outline-variant)]/20">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-500 mb-1">
                <md-icon style={{ fontSize: 16 }}>close</md-icon>
                <span>Naive HSL Flaws</span>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-normal">
                Chroma collapses at extremes; perceived lightness swings wildly by hue.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)]/50 border border-[var(--md-sys-color-primary)]/30">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[var(--md-sys-color-primary)] mb-1">
                <md-icon style={{ fontSize: 16 }}>check_circle</md-icon>
                <span>HCT Guarantee</span>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-normal">
                Perceptually uniform tones guarantee accessible contrast everywhere.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Comparison Cards (6 cols) */}
        <div className="lg:col-span-6">
          <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-[32px] p-6 sm:p-7 border border-[var(--md-sys-color-outline-variant)]/30 shadow-xl relative overflow-hidden flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <md-icon style={{ fontSize: 20, color: "var(--md-sys-color-primary)" }}>
                  science
                </md-icon>
                <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                  Side-by-Side Science Lab
                </span>
              </div>
              <span className="text-xs font-mono text-[var(--md-sys-color-outline)]">
                Interactive Audit
              </span>
            </div>

            {/* Interactive Slider/Toggle: Scrub Lightness 10–90 live */}
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl p-5 border border-[var(--md-sys-color-outline-variant)]/20 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <span className="text-xs font-mono font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
                    Scrub Lightness & Tone (10–90)
                  </span>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Scrub live to observe perceptual consistency between HSL and HCT
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] self-start sm:self-auto shadow-2xs">
                  Value: {scrubTone}
                </span>
              </div>

              <MSlider
                value={scrubTone}
                min={10}
                max={90}
                step={1}
                labeled={true}
                onValue={setScrubTone}
                label={`Lightness and tone slider, current value ${scrubTone}`}
                className="w-full"
                style={
                  {
                    "--md-slider-active-track-color": "var(--md-sys-color-primary)",
                    "--md-slider-handle-color": "var(--md-sys-color-primary)",
                    "--md-slider-focus-handle-color": "var(--md-sys-color-primary)",
                    "--md-slider-hover-handle-color": "var(--md-sys-color-primary)",
                    "--md-slider-label-container-color": "var(--md-sys-color-primary)",
                    "--md-slider-label-label-text-color": "var(--md-sys-color-on-primary)",
                  } as CSSProperties
                }
              />
            </div>

            {/* Side-by-side Live Swatches at scrubTone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Naive HSL */}
              <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold text-[var(--md-sys-color-on-surface)]">
                    Naive HSL
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-mono text-[10px] font-bold">
                    <md-icon style={{ fontSize: 13 }}>close</md-icon>
                    <span>Skewed</span>
                  </span>
                </div>
                <div
                  className="h-20 w-full rounded-xl transition-colors duration-150 shadow-inner flex items-center justify-center relative overflow-hidden"
                  style={{ backgroundColor: currentHslHex }}
                >
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-black/40 text-white backdrop-blur-xs shadow-xs">
                    {currentHslHex}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] leading-tight">
                  L {scrubTone}% · H {Math.round(h0 * 360)}° · S {Math.round(s0 * 100)}%
                </p>
              </div>

              {/* Real HCT with active glowing border */}
              <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] border-2 border-[var(--md-sys-color-primary)] shadow-[0_0_20px_-4px_var(--md-sys-color-primary)] flex flex-col gap-3 relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                    Real HCT
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold">
                    <md-icon style={{ fontSize: 13 }}>check_circle</md-icon>
                    <span>True Tone</span>
                  </span>
                </div>
                <div
                  className="h-20 w-full rounded-xl transition-colors duration-150 shadow-inner flex items-center justify-center relative overflow-hidden"
                  style={{ backgroundColor: currentHctHex }}
                >
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-black/40 text-white backdrop-blur-xs shadow-xs">
                    {currentHctHex}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-[var(--md-sys-color-primary)] font-semibold leading-tight">
                  Tone {scrubTone} · Hue {Math.round(hct.hue)}° · Chroma {hct.chroma.toFixed(1)}
                </p>
              </div>
            </div>

            {/* Naive HSL Ramp */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
                    Naive HSL Ramp
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-mono text-[10px] font-bold">
                    <md-icon style={{ fontSize: 13 }}>close</md-icon>
                    <span>Skewed</span>
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[var(--md-sys-color-outline)]">
                  10–90 Lightness
                </span>
              </div>
              <div
                className="flex gap-1.5 p-1.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/20 overflow-x-auto select-none"
                role="img"
                aria-label="Naive HSL lightness ramp"
              >
                {naive.map(({ tone, hex }) => {
                  const isSelected = Math.abs(scrubTone - tone) < 5
                  return (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setScrubTone(tone)}
                      className={`group flex-1 min-w-[32px] h-12 rounded-lg transition-all duration-200 cursor-pointer relative flex flex-col items-center justify-between py-1 hover:scale-108 hover:z-10 ${isSelected
                        ? "ring-2 ring-red-400 scale-105 shadow-md"
                        : "opacity-80 hover:opacity-100"
                        }`}
                      style={{ backgroundColor: hex }}
                      title={`Naive HSL Lightness ${tone}%: ${hex}`}
                    >
                      <span
                        className="text-[9px] font-mono font-bold"
                        style={{ color: tone < 50 ? "#fff" : "#000" }}
                      >
                        {tone}
                      </span>
                      <md-icon
                        style={{ fontSize: 12, color: tone < 50 ? "#fff" : "#000" }}
                        className="opacity-40 group-hover:opacity-100 transition-opacity"
                        aria-hidden="true"
                      >
                        close
                      </md-icon>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Real HCT Ramp with active glowing border */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
                    Real HCT Ramp
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold">
                    <md-icon style={{ fontSize: 13 }}>check_circle</md-icon>
                    <span>Perceptually True</span>
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[var(--md-sys-color-primary)] font-semibold">
                  10–90 Tone
                </span>
              </div>
              <div
                className="flex gap-1.5 p-1.5 rounded-2xl border-2 border-[var(--md-sys-color-primary)] shadow-[0_0_24px_-4px_var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container)] overflow-x-auto transition-all duration-300 select-none"
                role="img"
                aria-label="Real HCT tonal ramp"
              >
                {real.map(({ tone, hex }) => {
                  const isSelected = Math.abs(scrubTone - tone) < 5
                  return (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setScrubTone(tone)}
                      className={`group flex-1 min-w-[32px] h-12 rounded-lg transition-all duration-200 cursor-pointer relative flex flex-col items-center justify-between py-1 hover:scale-108 hover:z-10 ${isSelected
                        ? "ring-2 ring-white scale-105 shadow-md"
                        : "hover:opacity-100"
                        }`}
                      style={{ backgroundColor: hex }}
                      title={`Real HCT Tone ${tone}: ${hex}`}
                    >
                      <span
                        className="text-[9px] font-mono font-bold"
                        style={{ color: tone < 50 ? "#fff" : "#000" }}
                      >
                        {tone}
                      </span>
                      <md-icon
                        style={{ fontSize: 12, color: tone < 50 ? "#fff" : "#000" }}
                        className="opacity-40 group-hover:opacity-100 transition-opacity"
                        aria-hidden="true"
                      >
                        check
                      </md-icon>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Explanatory footer note */}
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed font-mono">
              Notice how naive HSL distorts perceived brightness across tones, causing text contrast failures. Real HCT guarantees mathematical precision and accessibility compliance.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function AlternateThemePreview({
  hex,
  name,
  variant = "tonal-spot",
  mode = "dark",
}: {
  hex: string
  name: string
  variant?: SchemeVariant
  mode?: ColorMode
}) {
  const theme = useMemo(
    () => generateTheme(hex, variant, mode),
    [hex, variant, mode],
  )
  const palette = useMemo(
    () => generateTonalPalette(hex, variant, mode),
    [hex, variant, mode],
  )

  return (
    <div
      className="rounded-[28px] overflow-hidden"
      style={{
        background: theme.surface,
        border: `1px solid ${theme.surface3}`,
      }}
    >
      {/* Mini hero */}
      <div
        className="p-6 relative"
        style={{
          background: theme.surface,
          borderBottom: `1px solid ${theme.surface3}`,
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 60% 40%, ${hex}30, transparent 70%)`,
          }}
        />
        <div
          className="text-xs mb-3 px-2 py-1 rounded-full inline-block"
          style={{
            background: theme.surface2,
            color: theme.primary,
            fontFamily: "var(--font-mono)",
            border: `1px solid ${theme.outline}50`,
          }}
        >
          Seed: {hex.toUpperCase()} · {name}
        </div>
        <h3
          className="font-display text-2xl font-bold mb-3"
          style={{
            color: theme.onSurface,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
          }}
        >
          Design that adapts.
        </h3>
        {/* Mini buttons */}
        <div className="flex gap-2">
          <span
            className="px-4 py-2 rounded-full text-xs font-semibold"
            style={{
              background: theme.primary,
              color: theme.onPrimary,
              fontWeight: 600,
            }}
          >
            Get started
          </span>
          <span
            className="px-4 py-2 rounded-full text-xs font-semibold"
            style={{
              background: theme.primaryContainer,
              color: theme.onPrimaryContainer,
              fontWeight: 600,
            }}
          >
            Learn more
          </span>
        </div>
      </div>
      {/* Mini palette strip */}
      <div className="flex h-10">
        {palette.map(({ tone, hex: h }) => (
          <div
            key={tone}
            className="flex-1"
            style={{ background: h }}
            title={`Tone ${tone}`}
          />
        ))}
      </div>
      <div className="px-6 py-4">
        <p
          className="text-xs"
          style={{ color: theme.outline, fontFamily: "var(--font-mono)" }}
        >
          {name} theme · {palette.length} tones derived from single seed
        </p>
      </div>
    </div>
  )
}

// Multi-browse carousel: one focused theme + a peeking neighbor, with
// icon-button steppers. Same preview, four seeds.
const CAROUSEL_SEEDS = [
  { hex: "#6750A4", name: "Violet" },
  { hex: "#00695C", name: "Emerald" },
  { hex: "#B5370D", name: "Flame" },
  { hex: "#1565C0", name: "Azure" },
] as const

function ThemeCarousel({
  variant,
  mode,
}: {
  variant: SchemeVariant
  mode: ColorMode
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const step = useCallback((dir: 1 | -1) => {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector<HTMLElement>(".carousel-item")
    const delta = (card?.offsetWidth ?? 320) + 16
    track.scrollBy({
      left: dir * delta,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }, [])

  return (
    <div>
      <div
        ref={trackRef}
        className="carousel-track"
        role="region"
        aria-label="Example themes carousel"
        tabIndex={0}
      >
        {CAROUSEL_SEEDS.map(({ hex, name }) => (
          <div key={hex} className="carousel-item">
            <AlternateThemePreview
              hex={hex}
              name={name}
              variant={variant}
              mode={mode}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <MIconButton label="Previous theme" onClick={() => step(-1)}>
          <MIcon name="chevron_left" />
        </MIconButton>
        <MIconButton label="Next theme" onClick={() => step(1)}>
          <MIcon name="chevron_right" />
        </MIconButton>
        <span
          className="text-xs ml-2"
          style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
        >
          {CAROUSEL_SEEDS.length} seeds · scroll or step
        </span>
      </div>
    </div>
  )
}

function Footer({ seed }: { seed: string }) {
  return (
    <footer
      className="py-12 px-5 md:px-10"
      style={{
        background: "var(--rt-surf1)",
        borderTop: "1px solid var(--rt-surf3)",
      }}
    >
      <div
        className="max-w-7xl mx-auto"
        style={{
          borderTop: "2px solid var(--rt-p)",
          paddingTop: 32,
          transition: "border-color var(--transition-theme)",
        }}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <span
              className="font-display text-2xl font-bold"
              style={{ color: "var(--rt-p)", fontWeight: 800 }}
            >
              Retone
            </span>
            <p className="text-sm mt-1" style={{ color: "var(--rt-outline)" }}>
              HCT dynamic theming · Material You · Built with React + Tailwind
              CSS v4
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="text-xs px-3 py-1.5 rounded-full"
              style={{
                background: "var(--rt-surf3)",
                color: "var(--rt-osv)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Current seed: {seed.toUpperCase()}
            </span>
            <span className="text-xs" style={{ color: "var(--rt-outline)" }}>
              Material Design 3 · 2026
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

const MODE_KEY = "retone:mode"
const VARIANT_KEY = "retone:variant"

function readStoredMode(): ColorMode | null {
  try {
    const v = window.localStorage.getItem(MODE_KEY)
    return v === "light" || v === "dark" ? v : null
  } catch {
    return null
  }
}

function readStoredVariant(): SchemeVariant | null {
  try {
    const v = window.localStorage.getItem(VARIANT_KEY)
    return v && (VARIANT_ORDER as string[]).includes(v)
      ? v as SchemeVariant
      : null
  } catch {
    return null
  }
}

export default function App() {
  // Init order: URL hash → localStorage → default.
  const [seed, setSeed] = useState(() => parseHash().seed ?? "#232329")
  // Ambient mode: no hash seed means the page wakes with the clock and
  // settles into the time-of-day seed. Any interaction disarms it.
  const [ambientOn, setAmbientOn] = useState(() => !parseHash().seed)
  const [variant, setVariant] = useState<SchemeVariant>(
    () => parseHash().variant ?? readStoredVariant() ?? "tonal-spot",
  )
  const [mode, setMode] = useState<ColorMode>(
    () => parseHash().mode ?? readStoredMode() ?? "dark",
  )

  // Top linear loading indicator (Material 3 Expressive)
  const [isLoading, setIsLoading] = useState(true)
  const progressRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (progressRef.current) {
      ; (progressRef.current as any).indeterminate = true
    }
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1200)
    return () => clearTimeout(timer)
  }, [])

  // Boot readiness: fonts loaded, engine computed, first paint flushed.
  // The contained indicator decides itself whether the wait deserves
  // showing (skips sub-200ms inits).
  const [bootDone, setBootDone] = useState(false)
  useEffect(() => {
    let cancelled = false
    const doc = document as Document & {
      fonts?: { ready: Promise<unknown> }
    }
    const settled = Promise.all([
      doc.fonts?.ready ?? Promise.resolve(),
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    ])
    settled.then(
      () => {
        if (!cancelled) setBootDone(true)
      },
      () => {
        if (!cancelled) setBootDone(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // One memo builds scheme → roles → contrast-guarded roles. Retoning is a
  // variable swap downstream; nothing below recomputes color.
  const applied = useMemo(() => {
    const t = getEngineTheme(seed, variant, mode)
    const guard = ensureContrast(t.roles)
    return {
      theme: { ...t, roles: guard.roles },
      adjusted: guard.adjusted,
      notes: guard.notes,
    }
  }, [seed, variant, mode])
  const theme = useMemo(() => toLegacyRoles(applied.theme), [applied])

  useEffect(() => {
    applyTheme(applied.theme)
    document.documentElement.style.colorScheme = mode
    writeHash({ seed, variant, mode })
    try {
      window.localStorage.setItem(MODE_KEY, mode)
      window.localStorage.setItem(VARIANT_KEY, variant)
    } catch {
      // Private mode — theming still works, it just won't persist.
    }
  }, [applied, seed, variant, mode])

  // Every retone — picker, presets, image, ambient — resolves as one
  // choreographed sweep (View Transitions API + graceful fallback).
  // User-driven changes disarm the ambient settle.
  const handleSeedChange = useCallback((hex: string) => {
    setAmbientOn(false)
    transitionTheme(() => setSeed(hex.toUpperCase()))
  }, [])

  // High-frequency path for pad drags: a view transition per frame would
  // jank — the 400ms CSS variable sweep already animates smoothly.
  const handleSeedChangeFast = useCallback((hex: string) => {
    setAmbientOn(false)
    setSeed(hex.toUpperCase())
  }, [])

  const handleVariantChange = useCallback((v: SchemeVariant) => {
    setAmbientOn(false)
    transitionTheme(() => setVariant(v))
  }, [])

  // Ambient settle: current seed → time-of-day seed over ~2s. Runs on
  // first paint (from the neutral boot seed) and whenever re-armed.
  const seedRef = useRef(seed)
  seedRef.current = seed
  useEffect(() => {
    if (!ambientOn) return
    const target = ambientSeedForHour(new Date().getHours())
    if (prefersReducedMotion()) {
      setSeed(target)
      return
    }
    let raf = 0
    const from = seedRef.current
    const start = performance.now()
    const DUR = 2000
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR)
      const eased = 1 - Math.pow(1 - t, 3)
      setSeed(lerpSeedHex(from, target, eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ambientOn])

  const handleToggleAmbient = useCallback(() => {
    setAmbientOn((v) => !v)
  }, [])

  const handleModeChange = useCallback((m: ColorMode) => {
    transitionTheme(() => setMode(m))
  }, [])

  // In-app motion override: "reduced" mirrors the OS reduced-motion path
  // everywhere (transitions, ripple, canvas, ambient) via one data flag.
  const [motion, setMotion] = useState<MotionPreference>(() =>
    readMotionPreference(),
  )
  useEffect(() => {
    document.querySelector(".retone-app")?.setAttribute("data-motion", motion)
    writeMotionPreference(motion)
  }, [motion])

  const handleMotionToggle = useCallback(() => {
    setMotion((m) => (m === "reduced" ? "auto" : "reduced"))
  }, [])

  // Navbar seed action: jump to the playground and hand focus to the pad.
  const handleSeedAction = useCallback(() => {
    scrollToSection("playground")
    window.setTimeout(
      () => {
        document.getElementById("hue-pad")?.focus({ preventScroll: true })
      },
      prefersReducedMotion() ? 50 : 600,
    )
  }, [])

  // Live tab icon + browser chrome: favicon gem recolors with the seed,
  // theme-color tracks the surface.
  useEffect(() => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect x="4" y="4" width="56" height="56" rx="16" fill="#141218"/>` +
      `<path d="M32 10 L52 28 L42 54 L22 54 L12 28 Z" fill="${seed}"/>` +
      `<path d="M12 28 L52 28 M32 10 L24 28 L32 54 M32 10 L40 28 L32 54" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>` +
      `<circle cx="26" cy="24" r="3" fill="#FFFFFF" opacity="0.4"/></svg>`
    document
      .querySelector<HTMLLinkElement>("#favicon-live")
      ?.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`)
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", applied.theme.roles.surface)
  }, [seed, applied])

  return (
    <div
      className="retone-app theme-transition min-h-screen"
      style={{ background: "var(--rt-surf)" }}
    >
      <md-linear-progress
        ref={progressRef}
        indeterminate
        aria-label="Loading Retone"
        className={`fixed top-0 left-0 right-0 z-50 h-1 transition-opacity duration-500 ${isLoading
          ? ""
          : "opacity-0 transition-opacity duration-500 pointer-events-none"
          }`}
        style={
          {
            "--md-linear-progress-track-color":
              "var(--md-sys-color-surface-container-highest)",
            "--md-linear-progress-active-indicator-color":
              "var(--md-sys-color-primary)",
          } as CSSProperties
        }
      />
      <AmbientCanvas seed={seed} variant={variant} mode={mode} />
      <RefreshIndicator open={!bootDone} label="Loading Retone" />
      <div className="relative" style={{ zIndex: 1 }}>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <Navbar
          seed={seed}
          mode={mode}
          onModeChange={handleModeChange}
          onSeedAction={handleSeedAction}
          onSeedChange={handleSeedChange}
        />
        <DynamicPaletteSideCard
          seed={seed}
          variant={variant}
          mode={mode}
          onSeedChange={handleSeedChange}
        />
        <HeroSection
          seed={seed}
          variant={variant}
          mode={mode}
          onSeedChange={handleSeedChange}
        />
        <ShapeEditorSection
          seed={seed}
          variant={variant}
          mode={mode}
          onSeedChange={handleSeedChange}
        />
        <main id="main">
          <PlaygroundSection
            seed={seed}
            onSeedChange={handleSeedChange}
            onSeedChangeFast={handleSeedChangeFast}
            variant={variant}
            onVariantChange={handleVariantChange}
            contrastNotes={applied.adjusted ? applied.notes : null}
            share={{ seed, variant, mode }}
            mode={mode}
          />
          <PalettePanel seed={seed} variant={variant} mode={mode} />
          <ComponentShowcase
            theme={theme}
            mode={mode}
            onModeChange={handleModeChange}
            motion={motion}
            onMotionToggle={handleMotionToggle}
            ambientOn={ambientOn}
            onToggleAmbient={handleToggleAmbient}
          />

          <AboutSection seed={seed} variant={variant} mode={mode} />
          {/* Alternate Theme Section */}
          <section
            className="py-24 px-5 md:px-10"
            style={{ background: "var(--rt-surf1)" }}
          >
            <div className="max-w-7xl mx-auto">
              <div className="mb-12">
                <p
                  className="text-xs mb-2 tracking-widest uppercase"
                  style={{
                    color: "var(--rt-p)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Finale / Theming Range
                </p>
                <h2
                  className="font-display t-headline-l-em mb-3"
                  style={{
                    color: "var(--rt-onsf)",
                  }}
                >
                  One system, infinite palettes
                </h2>
                <p
                  className="text-base"
                  style={{
                    color: "var(--rt-osv)",
                    maxWidth: 560,
                    lineHeight: 1.7,
                  }}
                >
                  The same layout, token structure, and component hierarchy —
                  four different seed colors. Same code, completely different
                  feel. Now go make a fifth: it is one click up there.
                </p>
              </div>
              <ThemeCarousel variant={variant} mode={mode} />
            </div>
          </section>
        </main>

        <Footer seed={seed} />
      </div>
    </div>
  )
}
