/**
 * JSX typings for the Material Web custom elements used in Retone.
 * Dynamic state (selected, value, activeTabIndex, …) is synced
 * imperatively through refs in src/mw.tsx — these types only make the
 * static markup (children, class, style, aria, plain attributes) check.
 */
import type * as React from "react"

type MwBase = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      "md-filled-button": MwBase
      "md-filled-tonal-button": MwBase
      "md-outlined-button": MwBase
      "md-text-button": MwBase
      "md-elevated-button": MwBase
      "md-fab": MwBase & { variant?: string }
      "md-icon-button": MwBase
      "md-filled-icon-button": MwBase
      "md-filled-tonal-icon-button": MwBase
      "md-outlined-icon-button": MwBase
      "md-switch": MwBase & { icons?: boolean }
      "md-slider": MwBase & {
        min?: number
        max?: number
        step?: number
        labeled?: boolean
      }
      "md-chip-set": MwBase
      "md-filter-chip": MwBase & { label?: string }
      "md-elevated-card": MwBase
      "md-outlined-card": MwBase
      "md-icon": MwBase
      "md-linear-progress": MwBase & {
        indeterminate?: boolean
        value?: number
        max?: number
        buffer?: number
        "four-color"?: boolean
      }
    }
  }
}

export {}
