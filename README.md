<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Retone — README</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --accent: #ff6b4a;
    --code-bg: #1e2530;
    --link: #58a6ff;
  }
 
  * { box-sizing: border-box; }
 
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    line-height: 1.6;
  }
 
  .container {
    max-width: 860px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }
 
  header.page-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 32px;
  }
 
  header.page-header svg { flex-shrink: 0; }
 
  header.page-header h1 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
 
  h1.title {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 4px;
    border-bottom: 2px solid var(--accent);
    display: inline-block;
    padding-bottom: 6px;
  }
 
  .badges { margin: 12px 0 28px; display: flex; gap: 8px; }
  .badge {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 4px;
    color: #0d1117;
  }
  .badge.status { background: #f0883e; }
  .badge.license { background: #58a6ff; }
 
  p { color: var(--text); margin: 0 0 16px; }
  p.lead { color: var(--text-dim); font-size: 16px; }
 
  h2 {
    font-size: 22px;
    font-weight: 700;
    margin: 40px 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
 
  h3 { font-size: 17px; font-weight: 700; margin: 24px 0 10px; }
 
  ul { padding-left: 22px; margin: 0 0 16px; }
  li { margin-bottom: 8px; }
 
  strong { color: var(--text); font-weight: 700; }
 
  code {
    background: var(--code-bg);
    color: #ffa07a;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.9em;
  }
 
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 0 0 20px;
  }
 
  pre code {
    background: none;
    padding: 0;
    color: var(--text);
    font-size: 13.5px;
  }
 
  .comment { color: #6a737d; }
 
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 20px;
    font-size: 14px;
  }
 
  th, td {
    text-align: left;
    padding: 10px 14px;
    border: 1px solid var(--border);
  }
 
  th {
    background: var(--surface);
    font-weight: 600;
  }
 
  td { color: var(--text-dim); }
 
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
 
  .checklist { list-style: none; padding-left: 0; }
  .checklist li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--text-dim);
  }
  .checklist input {
    margin-top: 4px;
    accent-color: var(--accent);
  }
 
  .note {
    font-size: 13px;
    color: var(--text-dim);
    font-style: italic;
    margin: -8px 0 20px;
  }
</style>
</head>
<body>
<div class="container">
 
  <header class="page-header">
    <svg width="20" height="20" viewBox="0 0 16 16" fill="var(--text-dim)"><path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Z"/></svg>
    <h1>README</h1>
  </header>
 
  <h1 class="title">Retone</h1>
 
  <div class="badges">
    <span class="badge status">status: in development</span>
    <span class="badge license">license: MIT</span>
  </div>
 
  <p class="lead">A live, interactive demonstration of Material You–style dynamic theming for the web. Pick a seed color or drop an image, and the entire interface retones itself in real time — using the same HCT (Hue-Chroma-Tone) color science behind Android's Material You, rather than a naive HSL shift.</p>
 
  <h2>Overview</h2>
  <p>Retone isn't a static site with a light/dark toggle — it's a working color engine. Every surface, button, and card reads its color from a semantically-named set of design tokens (<code>primary</code>, <code>surface</code>, <code>on-surface</code>, <code>primary-container</code>, etc.), and those tokens are regenerated live from a single seed color using tonal palette algorithms. The interaction is the design language: change the seed, and the whole system responds.</p>
  <p>The base aesthetic is dark and cinematic rather than Google's typical light/pastel Material look — Material You's systematic color roles and expressive shape language, layered onto a moodier visual foundation.</p>
 
  <h2>Features</h2>
  <ul>
    <li><strong>Live color engine</strong> — full tonal palette (13 tones) generated from any seed color using Material Color Utilities (HCT color space)</li>
    <li><strong>Image-to-theme</strong> — drop a photo and extract a dominant color to seed the palette, mirroring Android's wallpaper-based theming</li>
    <li><strong>Semantic color roles</strong> — components consume roles (<code>primary</code>, <code>on-primary-container</code>, <code>outline</code>, <code>error</code>, etc.), not hardcoded hex values, so retoning requires no per-component logic</li>
    <li><strong>Light and dark mode</strong> — both generated from the same seed, using Material 3's tone mappings per mode</li>
    <li><strong>Component showcase</strong> — buttons (filled, tonal, outlined, text), a morphing FAB, containerized cards, and a palette inspector panel that visualizes the generated tone ramp</li>
    <li><strong>Smooth transitions</strong> — theme changes animate across the interface using Material's emphasized easing curves</li>
  </ul>
 
  <h2>Tech Stack</h2>
  <table>
    <tr><th>Layer</th><th>Choice</th></tr>
    <tr><td>Color engine</td><td><code>@material/material-color-utilities</code></td></tr>
    <tr><td>Frontend</td><td>Plain HTML, CSS, and JavaScript (no framework)</td></tr>
    <tr><td>Styling</td><td>CSS custom properties driven by generated tokens</td></tr>
    <tr><td>Image color extraction</td><td>Canvas API + color quantization</td></tr>
  </table>
 
  <h2>Getting Started</h2>
  <pre><code><span class="comment"># clone the repo</span>
git clone https://github.com/&lt;your-org&gt;/retone.git
cd retone
 
<span class="comment"># no build step required — just open index.html in a browser,
# or serve it locally to avoid CORS issues with modules/fetch:</span>
npx serve .</code></pre>
  <p class="note">The color engine (@material/material-color-utilities) is loaded via a &lt;script type="module"&gt; import from a CDN (e.g. jsDelivr/esm.sh), so no bundler or package manager is required to run the project.</p>
 
  <h2>Project Structure</h2>
  <pre><code>retone/
├── index.html            <span class="comment"># main page — hero, showcase, footer markup</span>
├── css/
│   ├── tokens.css         <span class="comment"># CSS custom properties for color roles, spacing, radius scale</span>
│   └── styles.css         <span class="comment"># component and layout styles, consuming the tokens</span>
├── js/
│   ├── engine.js           <span class="comment"># seed color → tonal palette → role mapping</span>
│   ├── image-seed.js        <span class="comment"># canvas-based color extraction from dropped images</span>
│   ├── components.js         <span class="comment"># button, card, FAB, palette panel behavior</span>
│   └── main.js                 <span class="comment"># wiring: picker input, theme apply, transitions</span>
├── assets/
└── README.md</code></pre>
  <p class="note">Adjust to match your actual repo layout.</p>
 
  <h2>Roadmap</h2>
  <ul class="checklist">
    <li><input type="checkbox" disabled> Core HCT palette engine</li>
    <li><input type="checkbox" disabled> Seed color picker UI</li>
    <li><input type="checkbox" disabled> Image-drop seed extraction</li>
    <li><input type="checkbox" disabled> Component showcase (buttons, FAB, cards)</li>
    <li><input type="checkbox" disabled> Light/dark mode generation</li>
    <li><input type="checkbox" disabled> Theme transition animations</li>
    <li><input type="checkbox" disabled> Palette inspector panel</li>
  </ul>
 
  <h2>License</h2>
  <p>MIT — see <a href="#">LICENSE</a> for details.</p>
 
</div>
</body>
</html>
