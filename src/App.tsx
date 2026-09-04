import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ─── HCT-approximate Color Engine ───────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    r = f(h + 1/3); g = f(h); b = f(h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

// Simulate HCT chroma behavior: chroma peaks at mid-tones, falls to 0 at extremes
function chromaScale(tone: number, maxChroma: number): number {
  // HCT-like behavior: near-zero chroma at tone 0 and 100, peak around 40-70
  const t = tone / 100;
  const peak = 4 * t * (1 - t); // parabola 0→1→0
  return maxChroma * Math.pow(peak, 0.6);
}

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

function generateTonalPalette(seedHex: string): TonalPalette[] {
  const [r, g, b] = hexToRgb(seedHex);
  const [hue, sat] = rgbToHsl(r, g, b);
  const maxChroma = Math.min(sat, 80); // cap chroma

  const tones = [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
  return tones.map((tone) => {
    const chroma = chromaScale(tone, maxChroma);
    const lightness = tone; // tone maps linearly to lightness
    const [rr, gg, bb] = hslToRgb(hue, chroma, lightness);
    return { tone, hex: rgbToHex(rr, gg, bb) };
  });
}

function generateTheme(seedHex: string): ThemeRoles {
  const [r, g, b] = hexToRgb(seedHex);
  const [hue, sat] = rgbToHsl(r, g, b);
  const maxChroma = Math.min(sat, 80);

  const tone = (t: number) => {
    const chroma = chromaScale(t, maxChroma);
    const [rr, gg, bb] = hslToRgb(hue, chroma, t);
    return rgbToHex(rr, gg, bb);
  };

  return {
    primary: tone(80),
    onPrimary: tone(20),
    primaryContainer: tone(30),
    onPrimaryContainer: tone(90),
    secondary: tone(75),
    onSecondary: tone(18),
    surface: tone(8),
    surface1: tone(11),
    surface2: tone(14),
    surface3: tone(17),
    onSurface: tone(92),
    onSurfaceVariant: tone(78),
    outline: tone(55),
    error: "#FFB4AB",
    seed: seedHex,
  };
}

function applyTheme(theme: ThemeRoles) {
  const root = document.querySelector(".retone-app") as HTMLElement;
  if (!root) return;
  root.style.setProperty("--rt-p", theme.primary);
  root.style.setProperty("--rt-op", theme.onPrimary);
  root.style.setProperty("--rt-pc", theme.primaryContainer);
  root.style.setProperty("--rt-opc", theme.onPrimaryContainer);
  root.style.setProperty("--rt-s", theme.secondary);
  root.style.setProperty("--rt-os", theme.onSecondary);
  root.style.setProperty("--rt-surf", theme.surface);
  root.style.setProperty("--rt-surf1", theme.surface1);
  root.style.setProperty("--rt-surf2", theme.surface2);
  root.style.setProperty("--rt-surf3", theme.surface3);
  root.style.setProperty("--rt-onsf", theme.onSurface);
  root.style.setProperty("--rt-osv", theme.onSurfaceVariant);
  root.style.setProperty("--rt-outline", theme.outline);
  root.style.setProperty("--rt-err", theme.error);
  root.style.setProperty("--rt-seed", theme.seed);
}

// ─── Dominant color extraction from image ────────────────────────────────────

function extractDominantColor(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 16) {
    const [rr, gg, bb] = [data[i], data[i + 1], data[i + 2]];
    const [, sat, lit] = rgbToHsl(rr, gg, bb);
    // only include non-grey, non-extreme pixels
    if (sat > 10 && lit > 10 && lit < 90) {
      r += rr; g += gg; b += bb; count++;
    }
  }
  if (!count) return "#6750A4";
  return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

// ─── Component Library ────────────────────────────────────────────────────────

const PRESET_SEEDS = [
  { name: "Violet", hex: "#6750A4" },
  { name: "Emerald", hex: "#00695C" },
  { name: "Flame", hex: "#B5370D" },
  { name: "Azure", hex: "#1565C0" },
  { name: "Rose", hex: "#AD1457" },
];

const TONE_ROLES: Record<number, string> = {
  0: "Black",
  10: "On-Primary",
  20: "Primary Cont.",
  30: "Secondary Cont.",
  40: "—",
  50: "Outline",
  60: "Outline Var.",
  70: "On-Surf. Var.",
  80: "Primary",
  90: "On-Prim. Cont.",
  95: "Surface Var.",
  100: "White",
};

// ─── Sections ────────────────────────────────────────────────────────────────

function HeroSection({
  seed,
  onSeedChange,
}: {
  seed: string;
  onSeedChange: (hex: string) => void;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dropImg, setDropImg] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>("Violet");

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      setDropImg(url);
      const img = new Image();
      img.onload = () => {
        const color = extractDominantColor(img);
        onSeedChange(color);
        setActivePreset(null);
      };
      img.src = url;
    },
    [onSeedChange]
  );

  const pickPreset = (name: string, hex: string) => {
    setActivePreset(name);
    setDropImg(null);
    onSeedChange(hex);
  };

  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
      style={{ background: "var(--rt-surf)" }}
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
      <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-10 py-6 z-10">
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
      <div className="relative z-10 max-w-7xl mx-auto w-full px-10 pt-28 pb-16">
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
                  onClick={() => pickPreset(name, hex)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all"
                  style={{
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
                  />
                  {name}
                </button>
              ))}
            </div>
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
              </div>

              <div className="flex items-center gap-5">
                <div
                  className="relative flex-shrink-0 rounded-full overflow-hidden glow-hover"
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
                    onChange={(e) => {
                      setActivePreset(null);
                      onSeedChange(e.target.value);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Pick seed color"
                    style={{ width: "100%", height: "100%" }}
                  />
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none flex items-center justify-center"
                    style={{ background: seed }}
                  />
                </div>

                <div className="flex-1">
                  <p className="text-xs mb-2" style={{ color: "var(--rt-outline)" }}>
                    Click the circle to open the color picker
                  </p>
                  <div className="flex gap-1.5">
                    {[20, 40, 60, 80].map((t) => {
                      const [r, g, b] = hexToRgb(seed);
                      const [h, s] = rgbToHsl(r, g, b);
                      const chroma = chromaScale(t, Math.min(s, 80));
                      const [rr, gg, bb] = hslToRgb(h, chroma, t);
                      const hex = rgbToHex(rr, gg, bb);
                      return (
                        <div
                          key={t}
                          className="flex-1 h-6 rounded-lg"
                          style={{ background: hex, transition: "background var(--transition-theme)" }}
                          title={`Tone ${t}: ${hex}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Image Drop Zone */}
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className="rounded-3xl transition-all cursor-default"
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
                <img
                  src={dropImg}
                  alt="Dropped image for color extraction"
                  className="w-full h-40 object-cover"
                  style={{ borderRadius: 22 }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-36 gap-2">
                  <svg
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
                    Drop a photo to extract its palette
                  </span>
                  <span className="text-xs" style={{ color: "var(--rt-surf3)", color: "var(--rt-outline)", opacity: 0.6 }}>
                    JPG, PNG, WebP
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
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

function PalettePanel({ seed }: { seed: string }) {
  const palette = useMemo(() => generateTonalPalette(seed), [seed]);

  return (
    <section id="palette" className="py-24 px-10" style={{ background: "var(--rt-surf1)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p
              className="text-xs mb-2 tracking-widest uppercase"
              style={{ color: "var(--rt-p)", fontFamily: "var(--font-mono)" }}
            >
              System / Tonal Palette
            </p>
            <h2
              className="font-display text-4xl font-bold"
              style={{ color: "var(--rt-onsf)", fontWeight: 700 }}
            >
              13-Step Tonal Ramp
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
            HCT · Seed {seed.toUpperCase()}
          </span>
        </div>

        {/* Tone ramp */}
        <div className="flex gap-1.5 mb-10 overflow-x-auto pb-2">
          {palette.map(({ tone, hex }) => (
            <div key={tone} className="flex flex-col items-center gap-2 min-w-0 flex-1">
              <div
                className="w-full rounded-2xl swatch-new"
                style={{
                  height: 80,
                  background: hex,
                  transition: "background var(--transition-theme)",
                  minWidth: 48,
                }}
                title={`Tone ${tone}: ${hex}`}
              />
              <span
                className="text-xs leading-tight text-center"
                style={{ color: "var(--rt-outline)", fontFamily: "var(--font-mono)" }}
              >
                {tone}
              </span>
              <span
                className="text-xs leading-tight text-center"
                style={{
                  color: "var(--rt-osv)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                }}
              >
                {hex.toUpperCase()}
              </span>
            </div>
          ))}
        </div>

        {/* Role grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {palette
            .filter(({ tone }) => [10, 20, 30, 50, 80, 90, 95].includes(tone))
            .map(({ tone, hex }) => {
              const role = TONE_ROLES[tone] || "—";
              const textColor =
                tone < 50
                  ? palette.find((p) => p.tone === 90)?.hex || "#fff"
                  : palette.find((p) => p.tone === 10)?.hex || "#000";
              return (
                <div
                  key={tone}
                  className="rounded-2xl p-4"
                  style={{
                    background: hex,
                    transition: "background var(--transition-theme)",
                  }}
                >
                  <p
                    className="text-xs font-600 mb-1"
                    style={{ color: textColor, fontWeight: 600, opacity: 0.8 }}
                  >
                    {role}
                  </p>
                  <p
                    className="text-xs"
                    style={{
                      color: textColor,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.65rem",
                      opacity: 0.7,
                    }}
                  >
                    {hex.toUpperCase()}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: textColor, opacity: 0.5, fontSize: "0.6rem" }}
                  >
                    Tone {tone}
                  </p>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}

function ComponentShowcase({ theme }: { theme: ThemeRoles }) {
  const [darkMode, setDarkMode] = useState(true);
  const [toggles, setToggles] = useState({ notifications: true, haptics: false, autoTheme: true });
  const [fabHovered, setFabHovered] = useState(false);

  return (
    <section
      id="showcase"
      className="py-24 px-10"
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
                  className="w-full py-3 rounded-full text-sm font-600 transition-all active:scale-95"
                  style={{
                    background: "var(--rt-p)",
                    color: "var(--rt-op)",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.filter = "brightness(1.12)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.filter = "brightness(1)")
                  }
                >
                  Filled — Primary action
                </button>
                {/* Tonal */}
                <button
                  className="w-full py-3 rounded-full text-sm font-600 transition-all active:scale-95"
                  style={{
                    background: "var(--rt-pc)",
                    color: "var(--rt-opc)",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.filter = "brightness(1.12)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.filter = "brightness(1)")
                  }
                >
                  Tonal — Secondary action
                </button>
                {/* Outlined */}
                <button
                  className="w-full py-3 rounded-full text-sm font-600 transition-all active:scale-95"
                  style={{
                    background: "transparent",
                    color: "var(--rt-p)",
                    border: "1.5px solid var(--rt-outline)",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "color-mix(in srgb, var(--rt-p) 10%, transparent)";
                    e.currentTarget.style.borderColor = "var(--rt-p)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "var(--rt-outline)";
                  }}
                >
                  Outlined — Tertiary
                </button>
                {/* Text */}
                <button
                  className="w-full py-3 rounded-full text-sm transition-all active:scale-95"
                  style={{
                    background: "transparent",
                    color: "var(--rt-p)",
                    fontWeight: 500,
                    fontFamily: "var(--font-body)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "color-mix(in srgb, var(--rt-p) 10%, transparent)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
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
                onMouseEnter={() => setFabHovered(true)}
                onMouseLeave={() => setFabHovered(false)}
                className="fab-blob flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 80,
                  height: 80,
                  background: "var(--rt-pc)",
                  color: "var(--rt-opc)",
                  boxShadow: fabHovered
                    ? `0 8px 32px color-mix(in srgb, var(--rt-seed) 40%, transparent)`
                    : `0 4px 16px rgba(0,0,0,0.4)`,
                  transform: fabHovered ? "scale(1.08)" : "scale(1)",
                  transition: "box-shadow 300ms ease, transform 300ms cubic-bezier(0.2,0,0,1)",
                }}
                title="FAB — organic blob shape"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <p className="text-xs text-center" style={{ color: "var(--rt-outline)" }}>
                Morphing blob shape · Spring physics
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
                  className="mt-4 text-sm font-500 transition-opacity hover:opacity-80"
                  style={{ color: "var(--rt-p)", fontWeight: 500 }}
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
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "#B3261E" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB4AB" strokeWidth="2">
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

              {/* Light/dark toggle */}
              <div
                className="flex items-center justify-between py-3.5 border-b"
                style={{ borderColor: "var(--rt-surf3)" }}
              >
                <div>
                  <p className="text-sm font-500" style={{ color: "var(--rt-onsf)", fontWeight: 500 }}>
                    {darkMode ? "Dark" : "Light"} mode
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--rt-outline)" }}>
                    Surface tone {darkMode ? "8" : "98"}
                  </p>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="relative transition-all"
                  style={{
                    width: 52,
                    height: 30,
                    borderRadius: 15,
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
                    onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}
                    className="relative"
                    style={{
                      width: 52,
                      height: 30,
                      borderRadius: 15,
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

function AlternateThemePreview({ hex, name }: { hex: string; name: string }) {
  const theme = useMemo(() => generateTheme(hex), [hex]);
  const palette = useMemo(() => generateTonalPalette(hex), [hex]);

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
      className="py-12 px-10"
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

export default function App() {
  const [seed, setSeed] = useState("#6750A4");
  const theme = useMemo(() => generateTheme(seed), [seed]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="retone-app theme-transition min-h-screen" style={{ background: "var(--rt-surf)" }}>
      <HeroSection seed={seed} onSeedChange={setSeed} />
      <PalettePanel seed={seed} />
      <ComponentShowcase theme={theme} />

      {/* Alternate Theme Section */}
      <section
        className="py-24 px-10"
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
            <AlternateThemePreview hex="#6750A4" name="Violet" />
            <AlternateThemePreview hex="#00695C" name="Emerald" />
          </div>
        </div>
      </section>

      <Footer seed={seed} />
    </div>
  );
}
