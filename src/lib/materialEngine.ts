/**
 * materialEngine — Retone's color brain.
 *
 * Single source of truth for everything color: seed → HCT → DynamicScheme
 * (one of six Material You variants) → semantic roles → CSS custom properties.
 *
 * Built on @material/material-color-utilities, the same engine behind
 * Android's Material You. Components never compute colors themselves; they
 * read `var(--md-sys-color-*)` and retoning is a variable swap, zero
 * re-render logic.
 */
import {
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
  Contrast,
  QuantizerCelebi,
  Score,
  argbFromHex,
  hexFromArgb,
  type DynamicScheme,
  type TonalPalette,
} from "@material/material-color-utilities";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SchemeVariant =
  | "tonal-spot"
  | "vibrant"
  | "expressive"
  | "content"
  | "fidelity"
  | "neutral";

export type ColorMode = "dark" | "light";

export const VARIANT_ORDER: SchemeVariant[] = [
  "tonal-spot",
  "vibrant",
  "expressive",
  "content",
  "fidelity",
  "neutral",
];

export const VARIANT_LABELS: Record<SchemeVariant, string> = {
  "tonal-spot": "Tonal Spot",
  vibrant: "Vibrant",
  expressive: "Expressive",
  content: "Content",
  fidelity: "Fidelity",
  neutral: "Neutral",
};

/** Canonical M3 role keys. CSS var = `--md-sys-color-${key}`. */
export type RoleKey =
  | "primary"
  | "on-primary"
  | "primary-container"
  | "on-primary-container"
  | "inverse-primary"
  | "secondary"
  | "on-secondary"
  | "secondary-container"
  | "on-secondary-container"
  | "tertiary"
  | "on-tertiary"
  | "tertiary-container"
  | "on-tertiary-container"
  | "error"
  | "on-error"
  | "error-container"
  | "on-error-container"
  | "surface"
  | "on-surface"
  | "surface-variant"
  | "on-surface-variant"
  | "inverse-surface"
  | "inverse-on-surface"
  | "surface-dim"
  | "surface-bright"
  | "surface-container-lowest"
  | "surface-container-low"
  | "surface-container"
  | "surface-container-high"
  | "surface-container-highest"
  | "surface-tint"
  | "outline"
  | "outline-variant"
  | "shadow"
  | "scrim";

export type RoleMap = Record<RoleKey, string>;

export interface HctReadout {
  hue: number;
  chroma: number;
  tone: number;
}

export interface EngineTheme {
  /** Canonical roles, all hex. */
  roles: RoleMap;
  /** HCT of the seed color. */
  seedHct: HctReadout;
  seed: string;
  variant: SchemeVariant;
  mode: ColorMode;
}

/** Legacy `--rt-*` shape kept so existing components keep working. */
export interface ThemeRoles {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  surface: string;
  surface1: string;
  surface2: string;
  surface3: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  error: string;
  seed: string;
}

export interface TonalPaletteStep {
  tone: number;
  hex: string;
}

/** The 13-step ramp used across the UI (M3 spec tones). */
export const TONES_13 = [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

// ─── Scheme construction ──────────────────────────────────────────────────────

function buildScheme(seedHex: string, variant: SchemeVariant, mode: ColorMode): DynamicScheme {
  const sourceHct = Hct.fromInt(argbFromHex(seedHex));
  const isDark = mode === "dark";
  // contrastLevel 0 = standard. Contrast policing is handled explicitly by
  // auditContrast/ensureContrast so the UI can explain what it changed.
  switch (variant) {
    case "vibrant":
      return new SchemeVibrant(sourceHct, isDark, 0);
    case "expressive":
      return new SchemeExpressive(sourceHct, isDark, 0);
    case "content":
      return new SchemeContent(sourceHct, isDark, 0);
    case "fidelity":
      return new SchemeFidelity(sourceHct, isDark, 0);
    case "neutral":
      return new SchemeNeutral(sourceHct, isDark, 0);
    case "tonal-spot":
    default:
      return new SchemeTonalSpot(sourceHct, isDark, 0);
  }
}

const dc = MaterialDynamicColors;

function role(scheme: DynamicScheme, get: (s: DynamicScheme) => number): string {
  return hexFromArgb(get(scheme));
}

/** Seed → full canonical role map + HCT readout. Pure + cheap (60fps-safe). */
export function getEngineTheme(
  seedHex: string,
  variant: SchemeVariant = "tonal-spot",
  mode: ColorMode = "dark",
): EngineTheme {
  const scheme = buildScheme(seedHex, variant, mode);
  const roles: RoleMap = {
    primary: role(scheme, (s) => dc.primary.getArgb(s)),
    "on-primary": role(scheme, (s) => dc.onPrimary.getArgb(s)),
    "primary-container": role(scheme, (s) => dc.primaryContainer.getArgb(s)),
    "on-primary-container": role(scheme, (s) => dc.onPrimaryContainer.getArgb(s)),
    "inverse-primary": role(scheme, (s) => dc.inversePrimary.getArgb(s)),
    secondary: role(scheme, (s) => dc.secondary.getArgb(s)),
    "on-secondary": role(scheme, (s) => dc.onSecondary.getArgb(s)),
    "secondary-container": role(scheme, (s) => dc.secondaryContainer.getArgb(s)),
    "on-secondary-container": role(scheme, (s) => dc.onSecondaryContainer.getArgb(s)),
    tertiary: role(scheme, (s) => dc.tertiary.getArgb(s)),
    "on-tertiary": role(scheme, (s) => dc.onTertiary.getArgb(s)),
    "tertiary-container": role(scheme, (s) => dc.tertiaryContainer.getArgb(s)),
    "on-tertiary-container": role(scheme, (s) => dc.onTertiaryContainer.getArgb(s)),
    error: role(scheme, (s) => dc.error.getArgb(s)),
    "on-error": role(scheme, (s) => dc.onError.getArgb(s)),
    "error-container": role(scheme, (s) => dc.errorContainer.getArgb(s)),
    "on-error-container": role(scheme, (s) => dc.onErrorContainer.getArgb(s)),
    surface: role(scheme, (s) => dc.surface.getArgb(s)),
    "on-surface": role(scheme, (s) => dc.onSurface.getArgb(s)),
    "surface-variant": role(scheme, (s) => dc.surfaceVariant.getArgb(s)),
    "on-surface-variant": role(scheme, (s) => dc.onSurfaceVariant.getArgb(s)),
    "inverse-surface": role(scheme, (s) => dc.inverseSurface.getArgb(s)),
    "inverse-on-surface": role(scheme, (s) => dc.inverseOnSurface.getArgb(s)),
    "surface-dim": role(scheme, (s) => dc.surfaceDim.getArgb(s)),
    "surface-bright": role(scheme, (s) => dc.surfaceBright.getArgb(s)),
    "surface-container-lowest": role(scheme, (s) => dc.surfaceContainerLowest.getArgb(s)),
    "surface-container-low": role(scheme, (s) => dc.surfaceContainerLow.getArgb(s)),
    "surface-container": role(scheme, (s) => dc.surfaceContainer.getArgb(s)),
    "surface-container-high": role(scheme, (s) => dc.surfaceContainerHigh.getArgb(s)),
    "surface-container-highest": role(scheme, (s) => dc.surfaceContainerHighest.getArgb(s)),
    "surface-tint": role(scheme, (s) => dc.surfaceTint.getArgb(s)),
    outline: role(scheme, (s) => dc.outline.getArgb(s)),
    "outline-variant": role(scheme, (s) => dc.outlineVariant.getArgb(s)),
    shadow: role(scheme, (s) => dc.shadow.getArgb(s)),
    scrim: role(scheme, (s) => dc.scrim.getArgb(s)),
  };
  const hct = Hct.fromInt(argbFromHex(seedHex));
  return {
    roles,
    seedHct: { hue: hct.hue, chroma: hct.chroma, tone: hct.tone },
    seed: seedHex,
    variant,
    mode,
  };
}

/** Legacy adapter: canonical roles → the old ThemeRoles shape. */
export function toLegacyRoles(t: EngineTheme): ThemeRoles {
  const r = t.roles;
  return {
    primary: r.primary,
    onPrimary: r["on-primary"],
    primaryContainer: r["primary-container"],
    onPrimaryContainer: r["on-primary-container"],
    secondary: r.secondary,
    onSecondary: r["on-secondary"],
    surface: r.surface,
    surface1: r["surface-container-low"],
    surface2: r["surface-container"],
    surface3: r["surface-container-high"],
    onSurface: r["on-surface"],
    onSurfaceVariant: r["on-surface-variant"],
    outline: r.outline,
    error: r.error,
    seed: t.seed,
  };
}

/** Tonal ramps per hue family, straight from the scheme's palettes. */
export function getHueRamps(
  seedHex: string,
  variant: SchemeVariant = "tonal-spot",
  mode: ColorMode = "dark",
): Record<"primary" | "secondary" | "tertiary" | "neutral" | "neutral-variant" | "error", TonalPaletteStep[]> {
  const scheme = buildScheme(seedHex, variant, mode);
  const ramp = (p: TonalPalette): TonalPaletteStep[] =>
    TONES_13.map((tone) => ({ tone, hex: hexFromArgb(p.tone(tone)) }));
  return {
    primary: ramp(scheme.primaryPalette),
    secondary: ramp(scheme.secondaryPalette),
    tertiary: ramp(scheme.tertiaryPalette),
    neutral: ramp(scheme.neutralPalette),
    "neutral-variant": ramp(scheme.neutralVariantPalette),
    error: ramp(scheme.errorPalette),
  };
}

/** Back-compat: 13-step primary ramp (replaces the old HSL approximation). */
export function generateTonalPalette(
  seedHex: string,
  variant: SchemeVariant = "tonal-spot",
  mode: ColorMode = "dark",
): TonalPaletteStep[] {
  return getHueRamps(seedHex, variant, mode).primary;
}

/** Back-compat: legacy theme (replaces the old HSL approximation). */
export function generateTheme(
  seedHex: string,
  variant: SchemeVariant = "tonal-spot",
  mode: ColorMode = "dark",
): ThemeRoles {
  return toLegacyRoles(getEngineTheme(seedHex, variant, mode));
}

/** Write roles to CSS vars. Canonical `--md-sys-color-*` + legacy `--rt-*`. */
export function applyThemeRoles(root: HTMLElement, t: EngineTheme) {
  for (const [key, hex] of Object.entries(t.roles)) {
    root.style.setProperty(`--md-sys-color-${key}`, hex);
  }
  root.style.setProperty("--md-sys-color-seed", t.seed);
  // Legacy aliases — existing components keep working untouched.
  const r = t.roles;
  const alias: Record<string, string> = {
    "--rt-p": r.primary,
    "--rt-op": r["on-primary"],
    "--rt-pc": r["primary-container"],
    "--rt-opc": r["on-primary-container"],
    "--rt-s": r.secondary,
    "--rt-os": r["on-secondary"],
    "--rt-sv": r["surface-variant"],
    "--rt-osv": r["on-surface-variant"],
    "--rt-surf": r.surface,
    "--rt-surf1": r["surface-container-low"],
    "--rt-surf2": r["surface-container"],
    "--rt-surf3": r["surface-container-high"],
    "--rt-onsf": r["on-surface"],
    "--rt-outline": r.outline,
    "--rt-err": r.error,
    "--rt-seed": t.seed,
  };
  for (const [k, v] of Object.entries(alias)) root.style.setProperty(k, v);
  root.dataset.variant = t.variant;
  root.dataset.mode = t.mode;
}

// ─── Contrast ─────────────────────────────────────────────────────────────────

export function contrastRatio(hexA: string, hexB: string): number {
  const a = Hct.fromInt(argbFromHex(hexA)).tone;
  const b = Hct.fromInt(argbFromHex(hexB)).tone;
  return Contrast.ratioOfTones(a, b);
}

export interface ContrastCheck {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  /** AA normal-text bar (4.5). Large text / non-text note where relevant. */
  passesAA: boolean;
  passesAAA: boolean;
}

/** Key pairs the UI guarantees. Outline is non-text → judged at 3:1. */
export function auditContrast(roles: RoleMap): ContrastCheck[] {
  const pairs: Array<[string, RoleKey, RoleKey, number]> = [
    ["On primary / Primary", "on-primary", "primary", 4.5],
    ["On primary container / Primary container", "on-primary-container", "primary-container", 4.5],
    ["On secondary / Secondary", "on-secondary", "secondary", 4.5],
    ["On secondary container / Secondary container", "on-secondary-container", "secondary-container", 4.5],
    ["On tertiary / Tertiary", "on-tertiary", "tertiary", 4.5],
    ["On tertiary container / Tertiary container", "on-tertiary-container", "tertiary-container", 4.5],
    ["On error / Error", "on-error", "error", 4.5],
    ["On error container / Error container", "on-error-container", "error-container", 4.5],
    ["On surface / Surface", "on-surface", "surface", 4.5],
    ["On surface variant / Surface variant", "on-surface-variant", "surface-variant", 4.5],
    ["Outline / Surface", "outline", "surface", 3],
  ];
  return pairs.map(([label, fg, bg, bar]) => {
    const ratio = contrastRatio(roles[fg], roles[bg]);
    return {
      label,
      fg: roles[fg],
      bg: roles[bg],
      ratio,
      passesAA: ratio >= bar,
      passesAAA: ratio >= 7,
    };
  });
}

/**
 * Nudge failing "on-*" tones until they hit 4.5:1 against their background.
 * Hue/chroma are preserved — only tone moves, so the palette still reads as
 * one system. Returns adjusted roles + human-readable notes for the notice.
 */
export function ensureContrast(roles: RoleMap): { roles: RoleMap; adjusted: boolean; notes: string[] } {
  const out: RoleMap = { ...roles };
  const notes: string[] = [];
  const guarded: Array<[RoleKey, RoleKey, string]> = [
    ["on-primary", "primary", "On primary"],
    ["on-primary-container", "primary-container", "On primary container"],
    ["on-secondary", "secondary", "On secondary"],
    ["on-secondary-container", "secondary-container", "On secondary container"],
    ["on-tertiary", "tertiary", "On tertiary"],
    ["on-tertiary-container", "tertiary-container", "On tertiary container"],
    ["on-error", "error", "On error"],
    ["on-error-container", "error-container", "On error container"],
    ["on-surface", "surface", "On surface"],
    ["on-surface-variant", "surface-variant", "On surface variant"],
  ];
  for (const [fgKey, bgKey, label] of guarded) {
    const bgTone = Hct.fromInt(argbFromHex(out[bgKey])).tone;
    if (Contrast.ratioOfTones(Hct.fromInt(argbFromHex(out[fgKey])).tone, bgTone) >= 4.5) continue;
    const fg = Hct.fromInt(argbFromHex(out[fgKey]));
    // Move away from the background: darker fg goes darker, lighter goes lighter.
    const goDarker = fg.tone < bgTone;
    const fixed = goDarker ? Contrast.darker(bgTone, 4.5) : Contrast.lighter(bgTone, 4.5);
    if (fixed < 0) continue; // unreachable — leave scheme value, report below
    // Clamp the excursion so we don't jump to pure black/white on mild misses.
    const clamped = Math.max(0, Math.min(100, fixed));
    out[fgKey] = hexFromArgb(Hct.from(fg.hue, fg.chroma, clamped).toInt());
    notes.push(`${label} tone → ${Math.round(clamped)} for 4.5:1`);
  }
  return { roles: out, adjusted: notes.length > 0, notes };
}

// ─── Shareable state (URL hash) ───────────────────────────────────────────────

export interface ShareState {
  seed: string;
  variant: SchemeVariant;
  mode: ColorMode;
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export function normalizeSeed(v: string | null): string | null {
  if (!v || !HEX_RE.test(v)) return null;
  return `#${v.replace("#", "").toUpperCase()}`;
}

export function isVariant(v: string | null): v is SchemeVariant {
  return (VARIANT_ORDER as string[]).includes(v ?? "");
}

export function parseHash(hash = window.location.hash): Partial<ShareState> {
  const out: Partial<ShareState> = {};
  const q = hash.replace(/^#/, "");
  for (const part of q.split("&")) {
    const [k, v] = part.split("=");
    if (!v) continue;
    if (k === "seed") {
      const s = normalizeSeed(decodeURIComponent(v));
      if (s) out.seed = s;
    } else if (k === "variant" && isVariant(v)) {
      out.variant = v;
    } else if (k === "mode" && (v === "dark" || v === "light")) {
      out.mode = v;
    }
  }
  return out;
}

export function writeHash(s: ShareState) {
  const seed = s.seed.replace("#", "").toUpperCase();
  window.history.replaceState(null, "", `#seed=${seed}&variant=${s.variant}&mode=${s.mode}`);
}

export function shareUrl(s: ShareState): string {
  const seed = s.seed.replace("#", "").toUpperCase();
  return `${window.location.origin}${window.location.pathname}#seed=${seed}&variant=${s.variant}&mode=${s.mode}`;
}

// ─── Ambient seed (time of day) ───────────────────────────────────────────────

/**
 * Before any interaction, the page breathes with the clock: warm hue at
 * sunrise, cool neutral at midday, amber at dusk, deep desaturated indigo
 * at night. Returns a seed hex for a given hour (0–23).
 */
export function ambientSeedForHour(hour: number): string {
  // [hour, hue, chroma]
  const stops: Array<[number, number, number]> = [
    [0, 275, 22],
    [5, 275, 22],
    [7, 35, 62],
    [10, 230, 18],
    [15, 210, 24],
    [18, 20, 68],
    [20, 260, 32],
    [22, 275, 22],
    [24, 275, 22],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (hour >= stops[i][0] && hour <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const span = Math.max(1e-6, b[0] - a[0]);
  const t = Math.min(1, Math.max(0, (hour - a[0]) / span));
  const hue = a[1] + (b[1] - a[1]) * t;
  const chroma = a[2] + (b[2] - a[2]) * t;
  return hexFromArgb(Hct.from(hue, chroma, 60).toInt());
}

// ─── Image → seed candidates (quantize + score) ───────────────────────────────

export function fileToImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/**
 * Downsample → QuantizerCelebi → Score.score. The library's own scoring
 * ranks by chroma + coverage, so the default pick is the most "themeable"
 * color, not just the most common pixel.
 */
export async function extractCandidates(img: HTMLImageElement, desired = 5): Promise<string[]> {
  const MAX_SIDE = 128;
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || MAX_SIDE) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || MAX_SIDE) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue; // skip transparent
    pixels.push((255 << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  if (!pixels.length) return [];
  const quantized = QuantizerCelebi.quantize(pixels, 128);
  const ranked = Score.score(quantized, { desired, fallbackColorARGB: 0xff6750a4 });
  return ranked.map((c) => hexFromArgb(c).toUpperCase());
}

// ─── Motion helpers ───────────────────────────────────────────────────────────

/** True when the user asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One choreographed palette sweep: wraps the variable swap in the View
 * Transitions API, falling back to an instant swap (no API, or the user
 * prefers reduced motion).
 */
export function transitionTheme(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => void;
  };
  if (prefersReducedMotion() || typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  doc.startViewTransition(update);
}

/** rAF throttle — pointer drags update the theme live without jank. */
export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let queued = false;
  let last: A | null = null;
  return (...args: A) => {
    last = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (last) fn(...last);
    });
  };
}
