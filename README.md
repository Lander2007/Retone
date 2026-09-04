<div align="center">
Retone

A live, interactive demonstration of Material You–style dynamic theming for the web.

Pick a seed color or drop an image, and the entire interface retones itself in real time — using the same HCT (Hue-Chroma-Tone) color science behind Android's Material You, rather than a naive HSL shift.

Status License: MIT Made with HTML/CSS/JS

</div>
Overview

Retone isn't a static site with a light/dark toggle — it's a working color engine. Every surface, button, and card reads its color from a semantically-named set of design tokens (primary, surface, on-surface, primary-container, etc.), and those tokens are regenerated live from a single seed color using tonal palette algorithms. The interaction is the design language: change the seed, and the whole system responds.

The base aesthetic is dark and cinematic rather than Google's typical light/pastel Material look — Material You's systematic color roles and expressive shape language, layered onto a moodier visual foundation.

Features
🎨 Live color engine — full tonal palette (13 tones) generated from any seed color using Material Color Utilities (HCT color space)
🖼️ Image-to-theme — drop a photo and extract a dominant color to seed the palette, mirroring Android's wallpaper-based theming
🧩 Semantic color roles — components consume roles (primary, on-primary-container, outline, error, etc.), not hardcoded hex values, so retoning requires no per-component logic
🌓 Light and dark mode — both generated from the same seed, using Material 3's tone mappings per mode
🧱 Component showcase — buttons (filled, tonal, outlined, text), a morphing FAB, containerized cards, and a palette inspector panel that visualizes the generated tone ramp
✨ Smooth transitions — theme changes animate across the interface using Material's emphasized easing curves
Tech Stack
Layer	Choice
Color engine	@material/material-color-utilities
Frontend	Plain HTML, CSS, and JavaScript (no framework)
Styling	CSS custom properties driven by generated tokens
Image color extraction	Canvas API + color quantization
Getting Started
bash
# clone the repo
git clone https://github.com/<your-org>/retone.git
cd retone

# no build step required — just open index.html in a browser,
# or serve it locally to avoid CORS issues with modules/fetch:
npx serve .

The color engine (@material/material-color-utilities) is loaded via a <script type="module"> import from a CDN (e.g. jsDelivr/esm.sh), so no bundler or package manager is required to run the project.

Project Structure
retone/
├── index.html            # main page — hero, showcase, footer markup
├── css/
│   ├── tokens.css        # CSS custom properties for color roles, spacing, radius scale
│   └── styles.css        # component and layout styles, consuming the tokens
├── js/
│   ├── engine.js         # seed color → tonal palette → role mapping
│   ├── image-seed.js     # canvas-based color extraction from dropped images
│   ├── components.js     # button, card, FAB, palette panel behavior
│   └── main.js            # wiring: picker input, theme apply, transitions
├── assets/
└── README.md

Adjust to match your actual repo layout.

Roadmap
 Core HCT palette engine
 Seed color picker UI
 Image-drop seed extraction
 Component showcase (buttons, FAB, cards)
 Light/dark mode generation
 Theme transition animations
 Palette inspector panel
License

MIT — see LICENSE for details.
