import type { Variants } from "framer-motion"

/**
 * Material 3 Expressive spring physics presets.
 * Provides organic, tactile response times matching Google M3 specifications.
 */
export const m3Springs = {
  standard: {
    type: "spring",
    stiffness: 380,
    damping: 22,
    mass: 0.8,
  },
  expressiveBouncy: {
    type: "spring",
    stiffness: 450,
    damping: 14,
    mass: 0.6,
  },
  fluid: {
    type: "spring",
    stiffness: 220,
    damping: 28,
    mass: 1.2,
  },
  bladeRubber: {
    type: "spring",
    stiffness: 400,
    damping: 18,
    mass: 0.7,
  },
} as const

/**
 * Material 3 Expressive shape morphing variants.
 * Features asymmetrical dynamic border-radii shifts and tactile scaling.
 */
export const m3ShapeVariants: Variants = {
  rest: {
    scale: 1,
    rotate: 0,
    borderRadius: "28px",
    transition: m3Springs.standard,
  },
  hover: {
    scale: 1.04,
    borderRadius: "36px 16px 36px 16px",
    rotate: -0.5,
    transition: m3Springs.expressiveBouncy,
  },
  tap: {
    scale: 0.95,
    borderRadius: "16px 36px 16px 36px",
    rotate: 0.5,
    transition: m3Springs.expressiveBouncy,
  },
  fabMorph: {
    scale: 1.08,
    borderRadius: "20px 48px 20px 48px",
    rotate: -4,
    transition: m3Springs.expressiveBouncy,
  },
}

/**
 * Tactile button spring variants for primary CTAs and interactive buttons.
 */
export const m3ButtonVariants: Variants = {
  rest: {
    scale: 1,
    transition: m3Springs.standard,
  },
  hover: {
    scale: 1.035,
    transition: m3Springs.expressiveBouncy,
  },
  tap: {
    scale: 0.95,
    transition: m3Springs.expressiveBouncy,
  },
}

/**
 * Expressive container / surface card variants.
 */
export const m3CardVariants: Variants = {
  rest: {
    scale: 1,
    y: 0,
    transition: m3Springs.standard,
  },
  hover: {
    scale: 1.015,
    y: -3,
    transition: m3Springs.expressiveBouncy,
  },
  tap: {
    scale: 0.985,
    y: 0,
    transition: m3Springs.expressiveBouncy,
  },
}

/**
 * Expressive FAB variants with morph capability.
 */
export const m3FabVariants: Variants = {
  rest: {
    scale: 1,
    rotate: 0,
    transition: m3Springs.standard,
  },
  hover: {
    scale: 1.06,
    rotate: -2,
    transition: m3Springs.expressiveBouncy,
  },
  tap: {
    scale: 0.92,
    rotate: 2,
    transition: m3Springs.expressiveBouncy,
  },
  fabMorph: {
    scale: 1.1,
    borderRadius: "20px 48px 20px 48px",
    rotate: -4,
    transition: m3Springs.expressiveBouncy,
  },
}
