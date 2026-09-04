import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  generateTonalPalette,
  generateTheme,
  getEngineTheme,
  getHueRamps,
  auditContrast,
  applyThemeRoles,
  transitionTheme,
  prefersReducedMotion,
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
} from "./lib/materialEngine";

// ─── Legacy shapes (kept for component props; values come from the engine) ────

export interface TonalPalette {
  tone: number;
  hex: string;
}

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

// ─── Theme application ────────────────────────────────────────────────────────
// Roles come from the real HCT engine (see lib/materialEngine). Canonical
// `--md-sys-color-*` vars are written first; legacy `--rt-*` aliases follow
// so existing components keep working untouched.

function applyTheme(t: EngineTheme) {
  const root = document.querySelector(".retone-app") as HTMLElement;
  if (!root) return;
  applyThemeRoles(root, t);
}

// ─── Material ripple (origin follows the pointer) ────────────────────────────

function spawnRipple(e: React.PointerEvent<HTMLElement>) {
  if (prefersReducedMotion()) return;
  const host = e.currentTarget;
  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const ink = document.createElement("span");
  ink.className = "ripple-ink";
  ink.setAttribute("aria-hidden", "true");
  ink.style.width = `${size}px`;
  ink.style.height = `${size}px`;
  ink.style.left = `${e.clientX - rect.left - size / 2}px`;
  ink.style.top = `${e.clientY - rect.top - size / 2}px`;
  host.appendChild(ink);
  const anim = ink.animate(
    [
      { transform: "scale(0)", opacity: 0.16 },
      { transform: "scale(1)", opacity: 0 },
    ],
    { duration: 500, easing: "cubic-bezier(0.05, 0.7, 0.1, 1)", fill: "forwards" },
  );
  anim.onfinish = () => ink.remove();
}

// ─── Component Library ────────────────────────────────────────────────────────

const PRESET_SEEDS = [
  { name: "Violet", hex: "#6750A4" },
  { name: "Emerald", hex: "#00695C" },
  { name: "Flame", hex: "#B5370D" },
  { name: "Azure", hex: "#1565C0" },
  { name: "Rose", hex: "#AD1457" },
];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (permissions / insecure context) — legacy path.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// ─── Sections ────────────────────────────────────────────────────────────────

// Hue/sat pad: a real HCT surface (hue × chroma at tone 60) rendered once to
// canvas. Dragging updates the seed live via rAF throttle; arrow keys step
// hue/chroma for keyboard users.
const PAD_W = 240;
const PAD_H = 132;
const PAD_CELLS_X = 60;
const PAD_CELLS_Y = 33;
const PAD_MAX_CHROMA = 120;

function HueSatPad({
  seed,
  onSeedChange,
}: {
  seed: string;
  onSeedChange: (hex: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hct = useMemo(() => seedHct(seed), [seed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cw = Math.ceil(PAD_W / PAD_CELLS_X);
    const ch = Math.ceil(PAD_H / PAD_CELLS_Y);
    for (let x = 0; x < PAD_CELLS_X; x++) {
      for (let y = 0; y < PAD_CELLS_Y; y++) {
        ctx.fillStyle = hexFromHct(
          (x / (PAD_CELLS_X - 1)) * 360,
          (1 - y / (PAD_CELLS_Y - 1)) * PAD_MAX_CHROMA,
          60,
        );
        ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1);
      }
    }
  }, []);

  const throttled = useMemo(() => rafThrottle((hex: string) => onSeedChange(hex)), [onSeedChange]);

  const pickAt = useCallback(
    (clientX: number, clientY: number, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      throttled(hexFromHct(fx * 360, (1 - fy) * PAD_MAX_CHROMA, 60));
    },
    [throttled],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const HUE_STEP = 4;
      const CHROMA_STEP = 6;
      let hue = hct.hue;
      let chroma = hct.chroma;
      if (e.key === "ArrowLeft") hue -= HUE_STEP;
      else if (e.key === "ArrowRight") hue += HUE_STEP;
      else if (e.key === "ArrowUp") chroma += CHROMA_STEP;
      else if (e.key === "ArrowDown") chroma -= CHROMA_STEP;
      else return;
      e.preventDefault();
      hue = ((hue % 360) + 360) % 360;
      chroma = Math.min(PAD_MAX_CHROMA, Math.max(0, chroma));
      onSeedChange(hexFromHct(hue, chroma, 60));
    },
    [hct, onSeedChange],
  );

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Hue and saturation pad. Drag or use arrow keys."
      aria-valuetext={`Hue ${Math.round(hct.hue)} degrees, chroma ${Math.round(hct.chroma)}`}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Older browsers — dragging still works without capture.
        }
        pickAt(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (e.buttons) pickAt(e.clientX, e.clientY, e.currentTarget);
      }}
      onKeyDown={onKeyDown}
      className="relative w-full rounded-2xl overflow-hidden touch-none select-none"
      style={{ border: "1px solid var(--rt-surf3)", cursor: "crosshair" }}
    >
      <canvas ref={canvasRef} width={PAD_W} height={PAD_H} aria-hidden="true" className="block w-full h-auto" />
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
  );
}

// Ambient background: slow-drifting blurred blobs in primary-container /
// tertiary-container / primary at low opacity. Quarter-res canvas, paused
// when hidden or under reduced motion (single static paint).
function AmbientCanvas({
  seed,
  variant,
  mode,
}: {
  seed: string;
  variant: SchemeVariant;
  mode: ColorMode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rolesRef = useRef(getEngineTheme(seed, variant, mode).roles);

  useEffect(() => {
    rolesRef.current = getEngineTheme(seed, variant, mode).roles;
  }, [seed, variant, mode]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = Math.max(2, Math.ceil(window.innerWidth / 4));
      h = canvas.height = Math.max(2, Math.ceil(window.innerHeight / 4));
    };
    resize();
    window.addEventListener("resize", resize);

    const paint = (t: number) => {
      const r = rolesRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.filter = "blur(24px)";
      ctx.globalAlpha = 0.16;
      const blobs = [
        {
          c: r["primary-container"],
          x: 0.3 + 0.12 * Math.sin(t / 9000),
          y: 0.35 + 0.1 * Math.cos(t / 11000),
          rad: 0.42,
        },
        {
          c: r["tertiary-container"],
          x: 0.72 + 0.1 * Math.cos(t / 8000),
          y: 0.6 + 0.12 * Math.sin(t / 10000),
          rad: 0.38,
        },
        {
          c: r.primary,
          x: 0.55 + 0.08 * Math.sin(t / 12000 + 2),
          y: 0.2 + 0.06 * Math.cos(t / 9000 + 1),
          rad: 0.22,
        },
      ];
      const m = Math.max(w, h);
      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.rad * m);
        g.addColorStop(0, b.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.filter = "none";
      ctx.globalAlpha = 1;
    };

    if (prefersReducedMotion()) {
      paint(0);
      return () => window.removeEventListener("resize", resize);
    }
    const loop = (t: number) => {
      paint(t);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: mode === "dark" ? 1 : 0.45 }}
    />
  );
}

function HeroSection({
  seed,
  onSeedChange,
  variant,
  onVariantChange,
  contrastNotes,
  share,
  mode,
}: {
  seed: string;
  onSeedChange: (hex: string) => void;
  variant: SchemeVariant;
  onVariantChange: (v: SchemeVariant) => void;
  contrastNotes: string[] | null;
  share: ShareState;
  mode: ColorMode;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dropImg, setDropImg] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>("Violet");
  const [shareCopied, setShareCopied] = useState(false);
  const seedRamp = useMemo(
    () => generateTonalPalette(seed, variant, mode).filter(({ tone }) => [20, 40, 60, 80].includes(tone)),
    [seed, variant, mode],
  );
  const hct = useMemo(() => seedHct(seed), [seed]);
  const eyeSupported = typeof window !== "undefined" && "EyeDropper" in window;

  const pickFromScreen = useCallback(async () => {
    try {
      const eye = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
      const { sRGBHex } = await eye.open();
      if (sRGBHex) {
        setActivePreset(null);
        onSeedChange(sRGBHex.toUpperCase());
      }
    } catch {
      // Dismissed — stay on the current seed.
    }
  }, [onSeedChange]);

  // Image → 5 ranked candidates (quantize + chroma/coverage score).
  // Defaults to the top-ranked seed; top 3 stay selectable below.
  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setImgError("That file is not an image — try a JPG, PNG, or WebP.");
        return;
      }
      setExtracting(true);
      setImgError(null);
      try {
        const { img, url } = await fileToImage(file);
        setDropImg((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        const ranked = await extractCandidates(img, 5);
        setCandidates(ranked.slice(0, 3));
        if (ranked[0]) {
          onSeedChange(ranked[0]);
          setActivePreset(null);
        }
      } catch {
        setImgError("Could not read that image. Try another file.");
      } finally {
        setExtracting(false);
      }
    },
    [onSeedChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
      e.target.value = ""; // allow re-picking the same file
    },
    [processFile],
  );

  // Clipboard paste: screenshot → theme without touching the disk.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) {
        e.preventDefault();
        void processFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [processFile]);

  const clearImage = useCallback(() => {
    setDropImg((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCandidates(null);
    setImgError(null);
  }, []);

  const pickPreset = (name: string, hex: string) => {
    setActivePreset(name);
    clearImage();
    onSeedChange(hex);
  };

  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
      style={{ background: "var(--rt-surf)", minHeight: "100dvh" }}
    >
      {/* Ambient gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 60% 40%, color-mix(in srgb, var(--rt-seed) 18%, transparent), transparent 70%)`,
          transition: "background var(--transition-theme)",
        }}
      />
      <div
        className="absolute top-0 left-0 w-full pointer-events-none"
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent, var(--rt-p), transparent)",
          opacity: 0.5,
        }}
      />

      {/* Nav */}
      <nav aria-label="Primary" className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 md:px-10 py-6 z-10">
        <span
          className="font-display text-xl font-700 tracking-tight"
          style={{ color: "var(--rt-p)", fontWeight: 700 }}
        >
          Retone
        </span>
        <div className="flex items-center gap-6 text-sm" style={{ color: "var(--rt-osv)" }}>
          <a href="#palette" className="hover:opacity-80 transition-opacity">Palette</a>
          <a href="#showcase" className="hover:opacity-80 transition-opacity">Components</a>
          <span
            className="px-4 py-1.5 rounded-full text-xs font-500"
            style={{
              background: "var(--rt-surf3)",
              color: "var(--rt-p)",
              border: "1px solid var(--rt-outline)",
              fontWeight: 500,
            }}
          >
            Material You
          </span>
        </div>
      </nav>

      {/* Hero Content */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-5 md:px-10 pt-28 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left copy */}
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mb-8"
              style={{
                background: "var(--rt-surf3)",
                color: "var(--rt-p)",
                border: "1px solid color-mix(in srgb, var(--rt-p) 30%, transparent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--rt-p)" }}
              />
              HCT Color Engine · Live
            </div>

            <h1
              className="font-display leading-none mb-6"
              style={{
                fontSize: "clamp(3rem, 7vw, 6rem)",
                fontWeight: 800,
                color: "var(--rt-onsf)",
                letterSpacing: "-0.02em",
              }}
            >
              Design that{" "}
              <span
                style={{
                  color: "var(--rt-p)",
                  transition: "color var(--transition-theme)",
                }}
              >
                adapts
              </span>
              <br />
              to you.
            </h1>

            <p
              className="text-lg leading-relaxed mb-10 max-w-lg"
              style={{ color: "var(--rt-osv)", lineHeight: 1.7 }}
            >
              Pick a seed color or drop a photo. Retone's HCT engine derives a complete
              Material You tonal system — every surface, container, and role recalibrated
              in real time.
            </p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-2 mb-8">
              <span className="text-xs self-center mr-2" style={{ color: "var(--rt-outline)" }}>
                Try a seed:
              </span>
              {PRESET_SEEDS.map(({ name, hex }) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={activePreset === name}
                  onClick={() => pickPreset(name, hex)}
                  className="touch-hit flex items-center gap-2 px-4 py-2 rounded-full text-xs transition-all"
                  style={{
                    minHeight: 36,
                    background:
                      activePreset === name ? "var(--rt-pc)" : "var(--rt-surf2)",
                    color:
                      activePreset === name
                        ? "var(--rt-opc)"
                        : "var(--rt-osv)",
                    border: `1px solid ${activePreset === name ? "var(--rt-p)" : "var(--rt-surf3)"}`,
                    fontWeight: 500,
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ background: hex }}
                    aria-hidden="true"
                  />
                  {name}
                </button>
              ))}
            </div>

            {/* Scheme variants — the library's six DynamicSchemes */}
            <div className="mb-8">
              <span
                id="variant-label"
                className="text-xs block mb-2"
                style={{ color: "var(--rt-outline)" }}
              >
                Scheme variant
              </span>
              <div role="group" aria-labelledby="variant-label" className="flex flex-wrap gap-2">
                {VARIANT_ORDER.map((v) => {
                  const selected = variant === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onVariantChange(v)}
                      className="touch-hit px-4 rounded-full text-xs transition-all"
                      style={{
                        minHeight: 36,
                        display: "inline-flex",
                        alignItems: "center",
                        background: selected ? "var(--rt-p)" : "var(--rt-surf2)",
                        color: selected ? "var(--rt-op)" : "var(--rt-osv)",
                        border: `1px solid ${selected ? "var(--rt-p)" : "var(--rt-surf3)"}`,
                        fontWeight: selected ? 600 : 500,
                      }}
                    >
                      {VARIANT_LABELS[v]}
                    </button>
                  );
                })}
              </div>
            </div>

            {contrastNotes && contrastNotes.length > 0 && (
              <p
                role="status"
                className="text-xs mb-8 px-3 py-2 rounded-xl inline-block"
                style={{
                  background: "color-mix(in srgb, #EAB308 12%, transparent)",
                  color: "var(--rt-osv)",
                  border: "1px solid color-mix(in srgb, #EAB308 35%, transparent)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Contrast adjusted · {contrastNotes.length} role{contrastNotes.length > 1 ? "s" : ""} retuned to 4.5:1
              </p>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex flex-col gap-5">
            {/* Color Picker */}
            <div
              className="rounded-3xl p-6"
              style={{
                background: "var(--rt-surf2)",
                border: "1px solid var(--rt-surf3)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-sm font-500"
                  style={{ color: "var(--rt-osv)", fontWeight: 500 }}
                >
                  Seed Color
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: "var(--rt-surf3)",
                      color: "var(--rt-outline)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {seed.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await copyText(shareUrl(share))) {
                        setShareCopied(true);
                        window.setTimeout(() => setShareCopied(false), 1600);
                      }
                    }}
                    className="text-xs px-3 rounded-full transition-opacity hover:opacity-90"
                    style={{
                      minHeight: 32,
                      display: "inline-flex",
                      alignItems: "center",
                      background: "var(--rt-surf3)",
                      color: "var(--rt-p)",
                      border: "1px solid var(--rt-outline)",
                      fontWeight: 500,
                    }}
                    aria-live="polite"
                  >
                    {shareCopied ? "Link copied ✓" : "Copy share link"}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <div
                  className="seed-ring relative flex-shrink-0 rounded-full overflow-hidden glow-hover"
                  style={{
                    width: 80,
                    height: 80,
                    background: seed,
                    boxShadow: `0 0 0 3px var(--rt-surf3), 0 0 20px color-mix(in srgb, ${seed} 50%, transparent)`,
                    transition: "background var(--transition-theme), box-shadow var(--transition-theme)",
                  }}
                >
                  <input
                    type="color"
                    value={seed}
                    aria-label="Pick seed color"
                    onChange={(e) => {
                      setActivePreset(null);
                      onSeedChange(e.target.value);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Pick seed color"
                    style={{ width: "100%", height: "100%" }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full pointer-events-none flex items-center justify-center"
                    style={{ background: seed }}
                  />
                </div>

                <div className="flex-1">
                  <p className="text-xs mb-2" style={{ color: "var(--rt-outline)" }}>
                    Circle opens the picker
                    {eyeSupported && " · eyedropper samples the screen"}
                  </p>
                  {eyeSupported && (
                    <button
                      type="button"
                      onClick={() => void pickFromScreen()}
                      className="text-xs px-4 rounded-full transition-opacity hover:opacity-90 mb-3"
                      style={{
                        minHeight: 36,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        background: "var(--rt-surf3)",
                        color: "var(--rt-p)",
                        border: "1px solid var(--rt-outline)",
                        fontWeight: 500,
                      }}
                    >
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 22l4.5-1L20 7.5a2.12 2.12 0 0 0-3-3L3.5 18 2 22z" />
                        <path d="M14.5 5.5l3 3" />
                      </svg>
                      Eyedropper
                    </button>
                  )}
                  <div className="flex gap-1.5" role="img" aria-label="Current seed at tones 20, 40, 60, 80">
                    {seedRamp.map(({ tone, hex }) => (
                      <div
                        key={tone}
                        className="flex-1 h-6 rounded-lg"
                        style={{ background: hex, transition: "background var(--transition-theme)" }}
                        title={`Tone ${tone}: ${hex}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Hue/sat surface — drag to retone live */}
              <div className="mt-5">
                <HueSatPad seed={seed} onSeedChange={(hex) => { setActivePreset(null); onSeedChange(hex); }} />
                <p
                  className="text-xs mt-2 text-center"
                  aria-live="polite"
                  style={{ color: "var(--rt-osv)", fontFamily: "var(--font-mono)" }}
                >
                  H {hct.hue.toFixed(0)}° · C {hct.chroma.toFixed(1)} · T {hct.tone.toFixed(0)} · {seed.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Image seed — drop, browse, or paste. Quantized + scored. */}
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              aria-busy={extracting}
              className="rounded-3xl transition-all"
              style={{
                border: `2px dashed ${dragging ? "var(--rt-p)" : "var(--rt-surf3)"}`,
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
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label="Remove uploaded image"
                      className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center"
                      style={{
                        minWidth: 36,
                        minHeight: 36,
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.25)",
                      }}
                    >
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {candidates && candidates.length > 0 && (
                    <div className="flex items-center gap-3 mt-3 px-1 pb-1">
                      <span
                        className="text-xs"
                        style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
                      >
                        Top picks
                      </span>
                      <div className="flex gap-2" role="group" aria-label="Top extracted seed colors">
                        {candidates.map((hex, i) => {
                          const selected = seed.toUpperCase() === hex.toUpperCase();
                          return (
                            <button
                              key={hex + i}
                              type="button"
                              aria-pressed={selected}
                              title={`${hex} — use as seed${i === 0 ? " (top ranked)" : ""}`}
                              aria-label={`Use ${hex} as seed${i === 0 ? ", top ranked" : ""}`}
                              onClick={() => {
                                setActivePreset(null);
                                onSeedChange(hex);
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
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-auto min-h-36 gap-2 py-6 px-4 text-center">
                  <svg
                    aria-hidden="true"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    style={{ color: "var(--rt-outline)" }}
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span className="text-sm" style={{ color: "var(--rt-outline)" }}>
                    {extracting ? "Scoring colors…" : "Drop a photo to extract its palette"}
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
                      style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                    />
                  </label>
                  <span className="text-xs" style={{ color: "var(--rt-outline)", opacity: 0.6 }}>
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
                <p role="alert" className="text-xs text-center pb-3 px-4" style={{ color: "#FCA5A5" }}>
                  {imgError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div aria-hidden="true" className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-xs" style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}>
          scroll
        </span>
        <div
          className="w-px h-8 animate-pulse"
          style={{ background: "linear-gradient(to bottom, var(--rt-outline), transparent)" }}
        />
      </div>
    </section>
  );
}

const RAMP_FAMILIES = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "tertiary", label: "Tertiary" },
  { key: "neutral", label: "Neutral" },
  { key: "neutral-variant", label: "Neutral Variant" },
  { key: "error", label: "Error" },
] as const;

/** Container/on-container pairs the inspector proves with live badges. */
const PAIR_CARDS: Array<{ bg: RoleKey; fg: RoleKey; title: string }> = [
  { bg: "primary", fg: "on-primary", title: "Primary" },
  { bg: "primary-container", fg: "on-primary-container", title: "Primary container" },
  { bg: "secondary-container", fg: "on-secondary-container", title: "Secondary container" },
  { bg: "tertiary-container", fg: "on-tertiary-container", title: "Tertiary container" },
  { bg: "error-container", fg: "on-error-container", title: "Error container" },
  { bg: "surface", fg: "on-surface", title: "Surface" },
];

function ContrastBadge({ ratio }: { ratio: number }) {
  const aaa = ratio >= 7;
  const aa = ratio >= 4.5;
  const label = aaa ? "AAA" : aa ? "AA" : "Low";
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{
        background: aa ? "color-mix(in srgb, #22C55E 18%, transparent)" : "color-mix(in srgb, #EF4444 18%, transparent)",
        color: aa ? "#4ADE80" : "#FCA5A5",
        border: `1px solid ${aa ? "color-mix(in srgb, #22C55E 40%, transparent)" : "color-mix(in srgb, #EF4444 40%, transparent)"}`,
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
      }}
      title={`Contrast ratio ${ratio.toFixed(2)}:1`}
    >
      {label} · {ratio.toFixed(1)}
    </span>
  );
}

function PalettePanel({
  seed,
  variant = "tonal-spot",
  mode = "dark",
}: {
  seed: string;
  variant?: SchemeVariant;
  mode?: ColorMode;
}) {
  const ramps = useMemo(() => getHueRamps(seed, variant, mode), [seed, variant, mode]);
  const theme = useMemo(() => getEngineTheme(seed, variant, mode), [seed, variant, mode]);
  const checks = useMemo(() => auditContrast(theme.roles), [theme]);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
    }
  }, []);

  return (
    <section id="palette" className="py-24 px-5 md:px-10" style={{ background: "var(--rt-surf1)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p
              className="text-xs mb-2 tracking-widest uppercase"
              style={{ color: "var(--rt-p)", fontFamily: "var(--font-mono)" }}
            >
              System / Tonal Palettes
            </p>
            <h2
              className="font-display text-4xl font-bold"
              style={{ color: "var(--rt-onsf)", fontWeight: 700 }}
            >
              Every hue, 0–100
            </h2>
          </div>
          <span
            className="text-sm px-3 py-1.5 rounded-xl"
            style={{
              background: "var(--rt-surf3)",
              color: "var(--rt-osv)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {VARIANT_LABELS[variant]} · {mode} · {seed.toUpperCase()}
          </span>
        </div>

        {/* Per-hue ramps — hover reveals hex, click copies it */}
        <div className="flex flex-col gap-4 mb-12">
          {RAMP_FAMILIES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <span
                className="text-xs shrink-0 hidden sm:block"
                style={{ width: 120, color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
              >
                {label}
              </span>
              <div
                role="group"
                aria-label={`${label} tonal ramp, tones 0 to 100. Activate a swatch to copy its hex.`}
                className="flex gap-1 flex-1 overflow-x-auto pb-1"
              >
                {ramps[key].map(({ tone, hex }) => (
                  <button
                    key={tone}
                    type="button"
                    title={`${label} ${tone} · ${hex.toUpperCase()} — copy hex`}
                    aria-label={`${label} tone ${tone}, ${hex.toUpperCase()}. Copy hex.`}
                    onClick={() => copy(`${key}-${tone}`, hex.toUpperCase())}
                    className="group relative flex-1 rounded-xl transition-transform hover:-translate-y-0.5"
                    style={{ background: hex, minWidth: 40, height: 56 }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-1 text-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.55rem",
                        color: tone < 50 ? "#fff" : "#000",
                      }}
                    >
                      {copied === `${key}-${tone}` ? "copied" : hex.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Container/on-container proof cards with live contrast badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAIR_CARDS.map(({ bg, fg, title }) => {
            const bgHex = theme.roles[bg];
            const fgHex = theme.roles[fg];
            const check = checks.find(
              (c) => c.fg === fgHex && c.bg === bgHex,
            );
            const varName = `var(--md-sys-color-${bg})`;
            return (
              <div
                key={bg}
                className="rounded-2xl p-5"
                style={{ background: bgHex, transition: "background var(--transition-theme)" }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-sm font-600" style={{ color: fgHex, fontWeight: 600 }}>
                    {title}
                  </p>
                  {check && <ContrastBadge ratio={check.ratio} />}
                </div>
                <p
                  className="text-sm leading-relaxed mb-4"
                  style={{ color: fgHex, opacity: 0.85, lineHeight: 1.6 }}
                >
                  On-container text stays legible at every seed.
                </p>
                <button
                  type="button"
                  onClick={() => copy(`pair-${bg}`, varName)}
                  className="text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-90"
                  style={{
                    minHeight: 36,
                    background: "rgba(0,0,0,0.28)",
                    color: fgHex,
                    border: "1px solid rgba(255,255,255,0.18)",
                    fontFamily: "var(--font-mono)",
                  }}
                  aria-label={`Copy CSS variable name ${varName}`}
                  title="Copy CSS variable name"
                >
                  {copied === `pair-${bg}` ? "Copied ✓" : varName}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ComponentShowcase({
  theme,
  mode,
  onModeChange,
}: {
  theme: ThemeRoles;
  mode: ColorMode;
  onModeChange: (m: ColorMode) => void;
}) {
  const darkMode = mode === "dark";
  const [toggles, setToggles] = useState({ notifications: true, haptics: false, autoTheme: true });
  const [fabOn, setFabOn] = useState(false);

  return (
    <section
      id="showcase"
      className="py-24 px-5 md:px-10"
      style={{ background: "var(--rt-surf)" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <p
            className="text-xs mb-2 tracking-widest uppercase"
            style={{ color: "var(--rt-p)", fontFamily: "var(--font-mono)" }}
          >
            System / Component Showcase
          </p>
          <h2
            className="font-display text-4xl font-bold"
            style={{ color: "var(--rt-onsf)", fontWeight: 700 }}
          >
            Theme in Action
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Col 1: Buttons + FAB */}
          <div className="flex flex-col gap-5">
            {/* Button variants */}
            <div
              className="rounded-3xl p-6"
              style={{ background: "var(--rt-surf2)", border: "1px solid var(--rt-surf3)" }}
            >
              <p
                className="text-xs mb-5 tracking-widest uppercase"
                style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
              >
                Button Hierarchy
              </p>
              <div className="flex flex-col gap-3">
                {/* Filled */}
                <button
                  type="button"
                  onPointerDown={spawnRipple}
                  className="m3-btn w-full py-3 rounded-full text-sm font-600 transition-all"
                  style={{
                    background: "var(--rt-p)",
                    color: "var(--rt-op)",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Filled — Primary action
                </button>
                {/* Tonal */}
                <button
                  type="button"
                  onPointerDown={spawnRipple}
                  className="m3-btn w-full py-3 rounded-full text-sm font-600 transition-all"
                  style={{
                    background: "var(--rt-pc)",
                    color: "var(--rt-opc)",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Tonal — Secondary action
                </button>
                {/* Outlined */}
                <button
                  type="button"
                  onPointerDown={spawnRipple}
                  className="m3-btn w-full py-3 rounded-full text-sm font-600 transition-all"
                  style={{
                    background: "transparent",
                    color: "var(--rt-p)",
                    border: "1.5px solid var(--rt-outline)",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Outlined — Tertiary
                </button>
                {/* Text */}
                <button
                  type="button"
                  onPointerDown={spawnRipple}
                  className="m3-btn w-full py-3 rounded-full text-sm transition-all"
                  style={{
                    background: "transparent",
                    color: "var(--rt-p)",
                    fontWeight: 500,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Text — Subtle action
                </button>
              </div>
            </div>

            {/* FAB */}
            <div
              className="rounded-3xl p-6 flex flex-col items-center gap-4"
              style={{ background: "var(--rt-surf2)", border: "1px solid var(--rt-surf3)" }}
            >
              <p
                className="text-xs tracking-widest uppercase self-start"
                style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
              >
                Floating Action Button
              </p>
              <button
                type="button"
                aria-label={fabOn ? "Confirm theme" : "Create theme from current seed"}
                aria-pressed={fabOn}
                data-on={fabOn}
                onClick={() => setFabOn((v) => !v)}
                onPointerDown={spawnRipple}
                className="fab-morph flex items-center justify-center"
                title="FAB — square morphs to stadium, toggles edit to check"
              >
                <span className="fab-turn" aria-hidden="true">
                  <svg
                    className="fab-icon-plus"
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  <svg
                    className="fab-icon-check"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              </button>
              <p className="text-xs text-center" style={{ color: "var(--rt-outline)" }}>
                16px square → stadium · 45° toggle · Spring morph
              </p>
            </div>
          </div>

          {/* Col 2: Content Cards */}
          <div className="flex flex-col gap-5">
            <p
              className="text-xs tracking-widest uppercase"
              style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
            >
              Content Cards
            </p>

            {/* Card 1 */}
            <div
              className="rounded-3xl overflow-hidden glow-hover transition-all"
              style={{
                background: "var(--rt-surf2)",
                border: "1px solid var(--rt-surf3)",
              }}
            >
              <div
                className="h-36 w-full"
                style={{
                  background: `linear-gradient(135deg, var(--rt-pc), color-mix(in srgb, var(--rt-p) 60%, var(--rt-surf)))`,
                  transition: "background var(--transition-theme)",
                }}
              >
                <div className="p-5 pt-4">
                  <span
                    className="text-xs px-2.5 py-1 rounded-full"
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      color: "var(--rt-opc)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Design System
                  </span>
                </div>
              </div>
              <div className="p-5">
                <h3
                  className="font-display text-lg font-bold mb-2"
                  style={{ color: "var(--rt-onsf)", fontWeight: 700 }}
                >
                  Color Roles
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--rt-osv)", lineHeight: 1.6 }}>
                  Every surface is semantically named. Primary, container, and variant roles ensure
                  accessible contrast at every tone.
                </p>
                <button
                  type="button"
                  className="mt-4 text-sm font-500 transition-opacity hover:opacity-80"
                  style={{ color: "var(--rt-p)", fontWeight: 500, minHeight: 44 }}
                >
                  Explore system →
                </button>
              </div>
            </div>

            {/* Card 2 — error state */}
            <div
              className="rounded-3xl p-5"
              style={{
                background: "color-mix(in srgb, #B3261E 15%, var(--rt-surf2))",
                border: "1px solid color-mix(in srgb, #B3261E 30%, var(--rt-surf3))",
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  aria-hidden="true"
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "#B3261E" }}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB4AB" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <span className="text-sm font-600" style={{ color: "#FFB4AB", fontWeight: 600 }}>
                  Error Container
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--rt-osv)" }}>
                Error role stays consistent regardless of seed — HCT maps #B3261E to the error
                channel independently of the primary hue.
              </p>
            </div>
          </div>

          {/* Col 3: Settings panel */}
          <div className="flex flex-col gap-5">
            <div
              className="rounded-3xl p-6"
              style={{ background: "var(--rt-surf2)", border: "1px solid var(--rt-surf3)" }}
            >
              <p
                className="text-xs mb-5 tracking-widest uppercase"
                style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
              >
                Settings Panel
              </p>

              {/* Light/dark mode — global, persisted, shared in the link */}
              <div
                className="flex items-center justify-between py-3.5 border-b"
                style={{ borderColor: "var(--rt-surf3)" }}
              >
                <div>
                  <p className="text-sm font-500" style={{ color: "var(--rt-onsf)", fontWeight: 500 }}>
                    {darkMode ? "Dark" : "Light"} mode
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--rt-outline)" }}>
                    Whole page · saved · in share link
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={darkMode}
                  aria-label="Toggle dark mode"
                  onClick={() => onModeChange(darkMode ? "light" : "dark")}
                  className="touch-hit relative transition-all"
                  style={{
                    width: 52,
                    height: 32,
                    minHeight: 32,
                    borderRadius: 16,
                    background: darkMode ? "var(--rt-p)" : "var(--rt-outline)",
                    border: "none",
                    cursor: "pointer",
                    transition: "background var(--transition-theme)",
                  }}
                >
                  <span
                    className="absolute top-1 transition-all"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: darkMode ? "var(--rt-op)" : "var(--rt-surf)",
                      left: darkMode ? "calc(100% - 26px)" : "4px",
                      transition: "left 250ms cubic-bezier(0.2,0,0,1), background var(--transition-theme)",
                      display: "block",
                    }}
                  />
                </button>
              </div>

              {[
                { key: "notifications" as const, label: "Notifications", desc: "Push & in-app alerts" },
                { key: "haptics" as const, label: "Haptic feedback", desc: "Touch response patterns" },
                { key: "autoTheme" as const, label: "Adaptive theming", desc: "Extract from wallpaper" },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-3.5 border-b last:border-0"
                  style={{ borderColor: "var(--rt-surf3)" }}
                >
                  <div>
                    <p className="text-sm font-500" style={{ color: "var(--rt-onsf)", fontWeight: 500 }}>
                      {label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--rt-outline)" }}>
                      {desc}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={toggles[key]}
                    aria-label={label}
                    onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}
                    className="touch-hit relative"
                    style={{
                      width: 52,
                      height: 32,
                      borderRadius: 16,
                      background: toggles[key] ? "var(--rt-p)" : "var(--rt-surf3)",
                      border: "none",
                      cursor: "pointer",
                      transition: "background var(--transition-theme)",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 4,
                        left: toggles[key] ? "calc(100% - 26px)" : 4,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: toggles[key] ? "var(--rt-op)" : "var(--rt-outline)",
                        transition: "left 250ms cubic-bezier(0.2,0,0,1), background var(--transition-theme)",
                        display: "block",
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Semantic color chips */}
            <div
              className="rounded-3xl p-5"
              style={{ background: "var(--rt-surf2)", border: "1px solid var(--rt-surf3)" }}
            >
              <p
                className="text-xs mb-4 tracking-widest uppercase"
                style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
              >
                Role Tokens
              </p>
              <div className="flex flex-col gap-2">
                {[
                  { label: "Primary", bg: "var(--rt-p)", fg: "var(--rt-op)" },
                  { label: "Primary Container", bg: "var(--rt-pc)", fg: "var(--rt-opc)" },
                  { label: "Surface Variant", bg: "var(--rt-surf3)", fg: "var(--rt-osv)" },
                  { label: "Outline", bg: "var(--rt-outline)", fg: "var(--rt-surf)" },
                ].map(({ label, bg, fg }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-3 py-2 rounded-xl"
                    style={{ background: bg, transition: "background var(--transition-theme)" }}
                  >
                    <span className="text-xs font-500" style={{ color: fg, fontWeight: 500 }}>
                      {label}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: fg, opacity: 0.7, fontFamily: "var(--font-mono)" }}
                    >
                      {label.toLowerCase().replace(/ /g, "-")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AlternateThemePreview({
  hex,
  name,
  variant = "tonal-spot",
  mode = "dark",
}: {
  hex: string;
  name: string;
  variant?: SchemeVariant;
  mode?: ColorMode;
}) {
  const theme = useMemo(() => generateTheme(hex, variant, mode), [hex, variant, mode]);
  const palette = useMemo(() => generateTonalPalette(hex, variant, mode), [hex, variant, mode]);

  return (
    <div
      className="rounded-3xl overflow-hidden"
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
          style={{ color: theme.onSurface, fontWeight: 700, fontFamily: "var(--font-display)" }}
        >
          Design that adapts.
        </h3>
        {/* Mini buttons */}
        <div className="flex gap-2">
          <span
            className="px-4 py-2 rounded-full text-xs font-600"
            style={{ background: theme.primary, color: theme.onPrimary, fontWeight: 600 }}
          >
            Get started
          </span>
          <span
            className="px-4 py-2 rounded-full text-xs font-600"
            style={{ background: theme.primaryContainer, color: theme.onPrimaryContainer, fontWeight: 600 }}
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
        <p className="text-xs" style={{ color: theme.outline, fontFamily: "var(--font-mono)" }}>
          {name} theme · {palette.length} tones derived from single seed
        </p>
      </div>
    </div>
  );
}

function Footer({ seed }: { seed: string }) {
  return (
    <footer
      className="py-12 px-5 md:px-10"
      style={{ background: "var(--rt-surf1)", borderTop: "1px solid var(--rt-surf3)" }}
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
              HCT dynamic theming · Material You · Built with React + Tailwind CSS v4
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
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

const MODE_KEY = "retone:mode";
const VARIANT_KEY = "retone:variant";

function readStoredMode(): ColorMode | null {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function readStoredVariant(): SchemeVariant | null {
  try {
    const v = window.localStorage.getItem(VARIANT_KEY);
    return v && (VARIANT_ORDER as string[]).includes(v) ? (v as SchemeVariant) : null;
  } catch {
    return null;
  }
}

export default function App() {
  // Init order: URL hash → localStorage → default.
  const [seed, setSeed] = useState(() => parseHash().seed ?? "#232329");
  // Ambient mode: no hash seed means the page wakes with the clock and
  // settles into the time-of-day seed. Any interaction disarms it.
  const [ambientOn, setAmbientOn] = useState(() => !parseHash().seed);
  const [variant, setVariant] = useState<SchemeVariant>(
    () => parseHash().variant ?? readStoredVariant() ?? "tonal-spot",
  );
  const [mode, setMode] = useState<ColorMode>(() => parseHash().mode ?? readStoredMode() ?? "dark");

  // One memo builds scheme → roles → contrast-guarded roles. Retoning is a
  // variable swap downstream; nothing below recomputes color.
  const applied = useMemo(() => {
    const t = getEngineTheme(seed, variant, mode);
    const guard = ensureContrast(t.roles);
    return { theme: { ...t, roles: guard.roles }, adjusted: guard.adjusted, notes: guard.notes };
  }, [seed, variant, mode]);
  const theme = useMemo(() => toLegacyRoles(applied.theme), [applied]);

  useEffect(() => {
    applyTheme(applied.theme);
    document.documentElement.style.colorScheme = mode;
    writeHash({ seed, variant, mode });
    try {
      window.localStorage.setItem(MODE_KEY, mode);
      window.localStorage.setItem(VARIANT_KEY, variant);
    } catch {
      // Private mode — theming still works, it just won't persist.
    }
  }, [applied, seed, variant, mode]);

  // Every retone — picker, presets, image, ambient — resolves as one
  // choreographed sweep (View Transitions API + graceful fallback).
  // User-driven changes disarm the ambient settle.
  const handleSeedChange = useCallback((hex: string) => {
    setAmbientOn(false);
    transitionTheme(() => setSeed(hex.toUpperCase()));
  }, []);

  const handleVariantChange = useCallback((v: SchemeVariant) => {
    setAmbientOn(false);
    transitionTheme(() => setVariant(v));
  }, []);

  // Ambient settle: neutral → time-of-day seed over ~2s on first paint.
  useEffect(() => {
    if (!ambientOn) return;
    const target = ambientSeedForHour(new Date().getHours());
    if (prefersReducedMotion()) {
      setSeed(target);
      return;
    }
    let raf = 0;
    const from = "#232329";
    const start = performance.now();
    const DUR = 2000;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const eased = 1 - Math.pow(1 - t, 3);
      setSeed(lerpSeedHex(from, target, eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ambientOn]);

  const handleModeChange = useCallback((m: ColorMode) => {
    transitionTheme(() => setMode(m));
  }, []);

  return (
    <div className="retone-app theme-transition min-h-screen" style={{ background: "var(--rt-surf)" }}>
      <AmbientCanvas seed={seed} variant={variant} mode={mode} />
      <div className="relative" style={{ zIndex: 1 }}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <HeroSection
        seed={seed}
        onSeedChange={handleSeedChange}
        variant={variant}
        onVariantChange={handleVariantChange}
        contrastNotes={applied.adjusted ? applied.notes : null}
        share={{ seed, variant, mode }}
        mode={mode}
      />
      <main id="main">
      <PalettePanel seed={seed} variant={variant} mode={mode} />
      <ComponentShowcase theme={theme} mode={mode} onModeChange={handleModeChange} />

      {/* Alternate Theme Section */}
      <section
        className="py-24 px-5 md:px-10"
        style={{ background: "var(--rt-surf1)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <p
              className="text-xs mb-2 tracking-widest uppercase"
              style={{ color: "var(--rt-p)", fontFamily: "var(--font-mono)" }}
            >
              System / Theming Range
            </p>
            <h2
              className="font-display text-4xl font-bold mb-3"
              style={{ color: "var(--rt-onsf)", fontWeight: 700 }}
            >
              One system, infinite palettes
            </h2>
            <p className="text-base" style={{ color: "var(--rt-osv)", maxWidth: 520, lineHeight: 1.7 }}>
              The same layout, token structure, and component hierarchy — two different seed colors.
              Same code, completely different feel.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AlternateThemePreview hex="#6750A4" name="Violet" variant={variant} mode={mode} />
            <AlternateThemePreview hex="#00695C" name="Emerald" variant={variant} mode={mode} />
          </div>
        </div>
      </section>
      </main>

      <Footer seed={seed} />
      </div>
    </div>
  );
}
