/**
 * mw — thin React wrappers over Material Web custom elements.
 *
 * Side-effect imports register the elements; each wrapper below syncs
 * dynamic state (selected, value, activeTabIndex, segmented selection)
 * imperatively through refs, because those are Lit properties, not
 * attributes. Events are attached with addEventListener for the same
 * reason — React can't see inside shadow DOM event retargeting quirks,
 * and several MW events don't bubble past the host.
 */
import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react"

import "@material/web/button/elevated-button.js"
import "@material/web/button/filled-button.js"
import "@material/web/button/filled-tonal-button.js"
import "@material/web/button/outlined-button.js"
import "@material/web/button/text-button.js"
import "@material/web/chips/chip-set.js"
import "@material/web/chips/filter-chip.js"
import "@material/web/fab/fab.js"
import "@material/web/icon/icon.js"
import "@material/web/iconbutton/filled-icon-button.js"
import "@material/web/iconbutton/filled-tonal-icon-button.js"
import "@material/web/iconbutton/icon-button.js"
import "@material/web/iconbutton/outlined-icon-button.js"
import "@material/web/labs/card/elevated-card.js"
import "@material/web/labs/card/outlined-card.js"
import "@material/web/slider/slider.js"
import "@material/web/switch/switch.js"
import "@material/web/progress/linear-progress.js"

// ─── Upgrade diagnostic ─────────────────────────────────────────────────────
// If a tag below never defines, its shadow styles never apply and every
// instance renders as an unstyled inline element (no padding, crammed
// icons). That always means a stale module graph or a failed import —
// never a CSS problem. Surface it loudly instead of failing silently.
const MW_TAGS = [
  "md-filled-button",
  "md-filled-tonal-button",
  "md-outlined-button",
  "md-text-button",
  "md-elevated-button",
  "md-chip-set",
  "md-filter-chip",
  "md-fab",
  "md-icon",
  "md-icon-button",
  "md-filled-icon-button",
  "md-filled-tonal-icon-button",
  "md-outlined-icon-button",
  "md-elevated-card",
  "md-outlined-card",
  "md-outlined-segmented-button",
  "md-outlined-segmented-button-set",
  "md-slider",
  "md-switch",
  "md-linear-progress",
]

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(() => {
      for (const tag of MW_TAGS) {
        if (!customElements.get(tag)) {
          console.error(
            `[retone] <${tag}> never upgraded — Material Web styles will be missing ` +
              `(unstyled buttons, crammed icons). Hard-refresh to rebuild the module ` +
              `graph, then check the console above for the failed import.`,
          )
        }
      }
    })
  })
}

// ─── Buttons ────────────────────────────────────────────────────────────────

export type ButtonKind = "filled" | "tonal" | "outlined" | "text" | "elevated"

export function MButton({
  kind,
  children,
  onClick,
  className,
  style,
  label,
}: {
  kind: ButtonKind
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLElement>) => void
  className?: string
  style?: CSSProperties
  label?: string
}) {
  const shared = { className, style, "aria-label": label, onClick }
  switch (kind) {
    case "tonal":
      return (
        <md-filled-tonal-button {...shared}>{children}</md-filled-tonal-button>
      )
    case "outlined":
      return <md-outlined-button {...shared}>{children}</md-outlined-button>
    case "text":
      return <md-text-button {...shared}>{children}</md-text-button>
    case "elevated":
      return <md-elevated-button {...shared}>{children}</md-elevated-button>
    case "filled":
    default:
      return <md-filled-button {...shared}>{children}</md-filled-button>
  }
}

/** Material Symbols glyph, optionally into a named slot (e.g. icon). */
export function MIcon({
  name,
  slot,
  className,
  style,
  filled = false,
}: {
  name: string
  slot?: string
  className?: string
  style?: CSSProperties
  filled?: boolean
}) {
  return (
    <md-icon
      slot={slot}
      className={filled ? `fill ${className ?? ""}` : className}
      style={style}
      aria-hidden="true"
    >
      {name}
    </md-icon>
  )
}

// ─── Icon buttons ───────────────────────────────────────────────────────────

export type IconButtonKind = "plain" | "filled" | "tonal" | "outlined"

export function MIconButton({
  kind = "plain",
  label,
  onClick,
  children,
  className,
  style,
  elementRef,
  expanded,
}: {
  kind?: IconButtonKind
  label: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  children: ReactNode
  className?: string
  style?: CSSProperties
  elementRef?: Ref<HTMLElement>
  expanded?: boolean
}) {
  const shared = {
    ref: elementRef,
    className,
    style,
    "aria-label": label,
    "aria-expanded": expanded,
    onClick,
  }
  switch (kind) {
    case "filled":
      return (
        <md-filled-icon-button {...shared}>{children}</md-filled-icon-button>
      )
    case "tonal":
      return (
        <md-filled-tonal-icon-button {...shared}>
          {children}
        </md-filled-tonal-icon-button>
      )
    case "outlined":
      return (
        <md-outlined-icon-button {...shared}>
          {children}
        </md-outlined-icon-button>
      )
    case "plain":
    default:
      return <md-icon-button {...shared}>{children}</md-icon-button>
  }
}

// ─── FAB ────────────────────────────────────────────────────────────────────

export function MFab({
  variant = "primary",
  label,
  onClick,
  onPointerDown,
  className,
  style,
  children,
  pressed,
}: {
  variant?: "surface" | "primary" | "secondary" | "tertiary"
  label: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void
  className?: string
  style?: CSSProperties
  children: ReactNode
  pressed?: boolean
}) {
  return (
    <md-fab
      variant={variant}
      className={className}
      style={style}
      aria-label={label}
      aria-pressed={pressed}
      data-on={pressed}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {children}
    </md-fab>
  )
}

// ─── Switch ─────────────────────────────────────────────────────────────────

type SwitchEl = HTMLElement & { selected: boolean }

export function MSwitch({
  selected,
  onSelected,
  label,
  icons = true,
  className,
  style,
}: {
  selected: boolean
  onSelected: (next: boolean) => void
  label: string
  icons?: boolean
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current as SwitchEl | null
    if (el && el.selected !== selected) el.selected = selected
  }, [selected])

  useEffect(() => {
    const el = ref.current as SwitchEl | null
    if (!el) return
    const onChange = () => onSelected(el.selected)
    el.addEventListener("change", onChange)
    return () => el.removeEventListener("change", onChange)
  }, [onSelected])

  return (
    <md-switch
      ref={ref}
      icons={icons || undefined}
      aria-label={label}
      className={className}
      style={style}
    />
  )
}

// ─── Slider ─────────────────────────────────────────────────────────────────

type SliderEl = HTMLElement & { value: number }

export function MSlider({
  value,
  min,
  max,
  step = 1,
  label,
  labeled = true,
  onValue,
  className,
  style,
}: {
  value: number
  min: number
  max: number
  step?: number
  label: string
  labeled?: boolean
  onValue: (next: number) => void
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current as SliderEl | null
    if (el && el.value !== value) el.value = value
  }, [value])

  useEffect(() => {
    const el = ref.current as SliderEl | null
    if (!el) return
    const onInput = () => onValue(el.value)
    el.addEventListener("input", onInput)
    return () => el.removeEventListener("input", onInput)
  }, [onValue])

  return (
    <md-slider
      ref={ref}
      min={min}
      max={max}
      step={step}
      labeled={labeled || undefined}
      aria-label={label}
      className={className}
      style={style}
    />
  )
}

// ─── Filter chips (gallery filter) ──────────────────────────────────────────

type ChipEl = HTMLElement & { selected: boolean }

export function MChips<T extends string>({
  options,
  value,
  onPick,
  label,
  className,
  style,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onPick: (next: T) => void
  label: string
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    host.querySelectorAll("md-filter-chip").forEach((chip) => {
      const el = chip as ChipEl
      const should = chip.getAttribute("data-value") === value
      if (el.selected !== should) el.selected = should
    })
  }, [value])

  return (
    <md-chip-set
      ref={ref}
      aria-label={label}
      className={className}
      style={style}
    >
      {options.map((o) => (
        <md-filter-chip
          key={o.value}
          data-value={o.value}
          label={o.label}
          onClick={() => onPick(o.value)}
        />
      ))}
    </md-chip-set>
  )
}

// ─── Cards ──────────────────────────────────────────────────────────────────

export function MCard({
  kind = "elevated",
  className,
  style,
  children,
}: {
  kind?: "elevated" | "outlined"
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  if (kind === "outlined") {
    return (
      <md-outlined-card className={className} style={style}>
        {children}
      </md-outlined-card>
    )
  }
  return (
    <md-elevated-card className={className} style={style}>
      {children}
    </md-elevated-card>
  )
}

// ─── Linear progress ────────────────────────────────────────────────────────

export function MLinearProgress({
  indeterminate,
  value,
  max,
  className,
  style,
  "aria-label": ariaLabel,
}: {
  indeterminate?: boolean
  value?: number
  max?: number
  className?: string
  style?: CSSProperties
  "aria-label"?: string
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current as HTMLElement & {
      indeterminate?: boolean
      value?: number
      max?: number
    } | null
    if (!el) return
    if (indeterminate !== undefined) {
      el.indeterminate = indeterminate
    }
    if (value !== undefined) {
      el.value = value
    }
    if (max !== undefined) {
      el.max = max
    }
  }, [indeterminate, value, max])

  return (
    <md-linear-progress
      ref={ref}
      indeterminate={indeterminate}
      value={value}
      max={max}
      aria-label={ariaLabel}
      className={className}
      style={style}
    />
  )
}
