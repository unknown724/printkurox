import os
import subprocess
import json

BASE_DIR = r"C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint"
BRAIN_DIR = r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\49496b5a-49a2-4708-b374-c4f3796517c0"
EDGE_EXE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

# --- HTML TEMPLATE 1: Apple Visor Bot (Sleek Minimalist Robot Mascot) ---
html_1 = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1024px;
    height: 1024px;
    background: radial-gradient(circle at 50% 45%, #181920 0%, #08080a 70%, #030304 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
  }
  .container {
    width: 1000px;
    height: 1000px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  /* Outer Apple-style subtle ring */
  .halo-ring {
    position: absolute;
    width: 880px;
    height: 880px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 0 60px rgba(255, 255, 255, 0.02), 0 0 80px rgba(0, 0, 0, 0.8);
  }
  .inner-halo {
    position: absolute;
    width: 820px;
    height: 820px;
    border-radius: 50%;
    border: 1px dashed rgba(255, 255, 255, 0.05);
  }
  svg {
    width: 540px;
    height: 540px;
    filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.9));
    z-index: 2;
  }
  .branding {
    margin-top: 45px;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 2;
  }
  .brand-title {
    font-size: 58px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    text-indent: 0.32em; /* optical centering */
    text-shadow: 0 4px 20px rgba(255, 255, 255, 0.2);
  }
  .brand-subtitle {
    margin-top: 14px;
    font-size: 16px;
    font-weight: 500;
    color: #8a8f9d;
    letter-spacing: 0.52em;
    text-transform: uppercase;
    text-indent: 0.52em;
  }
</style>
</head>
<body>
<div class="container">
  <div class="halo-ring"></div>
  <div class="inner-halo"></div>

  <!-- Sleek Apple-Design AI Robot Emblem -->
  <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Gradients -->
      <linearGradient id="headGrad" x1="200" y1="50" x2="200" y2="350" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#2a2d36" />
        <stop offset="40%" stop-color="#181a20" />
        <stop offset="100%" stop-color="#0e0f13" />
      </linearGradient>

      <linearGradient id="strokeGrad" x1="100" y1="60" x2="300" y2="340" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.1" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.03" />
      </linearGradient>

      <linearGradient id="visorGrad" x1="200" y1="120" x2="200" y2="280" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#08080a" />
        <stop offset="100%" stop-color="#020203" />
      </linearGradient>

      <linearGradient id="glareGrad" x1="200" y1="120" x2="200" y2="200" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>

      <filter id="eyeGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <filter id="auraGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="25" />
      </filter>
    </defs>

    <!-- Subtle Background Aura -->
    <ellipse cx="200" cy="190" rx="140" ry="110" fill="#ffffff" fill-opacity="0.03" filter="url(#auraGlow)" />

    <!-- Antenna Base & Tip -->
    <rect x="196" y="44" width="8" height="28" rx="4" fill="#32353e" stroke="url(#strokeGrad)" stroke-width="1.5" />
    <circle cx="200" cy="38" r="7" fill="#ffffff" filter="url(#eyeGlow)" opacity="0.9" />

    <!-- Left Ear Pod -->
    <rect x="52" y="150" width="22" height="70" rx="11" fill="#1b1c22" stroke="url(#strokeGrad)" stroke-width="2" />
    <line x1="63" y1="165" x2="63" y2="205" stroke="#ffffff" stroke-opacity="0.3" stroke-width="2" stroke-linecap="round" />

    <!-- Right Ear Pod -->
    <rect x="326" y="150" width="22" height="70" rx="11" fill="#1b1c22" stroke="url(#strokeGrad)" stroke-width="2" />
    <line x1="337" y1="165" x2="337" y2="205" stroke="#ffffff" stroke-opacity="0.3" stroke-width="2" stroke-linecap="round" />

    <!-- Main Robot Head Outer Shell (Squircle) -->
    <rect x="70" y="68" width="260" height="236" rx="85" fill="url(#headGrad)" stroke="url(#strokeGrad)" stroke-width="3" />

    <!-- Inner Bevel Shadow -->
    <rect x="80" y="78" width="240" height="216" rx="75" fill="none" stroke="#000000" stroke-width="4" stroke-opacity="0.6" />

    <!-- Sleek OLED Visor Screen -->
    <rect x="88" y="86" width="224" height="200" rx="68" fill="url(#visorGrad)" stroke="#1a1c22" stroke-width="2" />

    <!-- Visor Glass Glare / Curved Specular Highlight -->
    <path d="M 100 120 C 140 98, 260 98, 300 120 C 260 140, 140 140, 100 120 Z" fill="url(#glareGrad)" />

    <!-- Glowing Minimalist Visor Eyes (Friendly Pill Shape) -->
    <!-- Left Eye -->
    <g filter="url(#eyeGlow)">
      <rect x="136" y="160" width="24" height="42" rx="12" fill="#ffffff" />
      <circle cx="148" cy="172" r="4" fill="#ffffff" />
    </g>
    <!-- Right Eye -->
    <g filter="url(#eyeGlow)">
      <rect x="240" y="160" width="24" height="42" rx="12" fill="#ffffff" />
      <circle cx="252" cy="172" r="4" fill="#ffffff" />
    </g>

    <!-- Subtle Intelligent AI Smile / Arc Line -->
    <path d="M 182 226 Q 200 236 218 226" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-opacity="0.85" filter="url(#eyeGlow)" />

    <!-- Subtle Bot Body / Collar Base -->
    <path d="M 125 315 C 125 304, 150 298, 200 298 C 250 298, 275 304, 275 315 L 290 355 C 290 360, 280 365, 200 365 C 120 365, 110 360, 110 355 Z" fill="#14151b" stroke="url(#strokeGrad)" stroke-width="2" />
    <!-- Collar Line -->
    <line x1="165" y1="330" x2="235" y2="330" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2" stroke-linecap="round" />
  </svg>

  <div class="branding">
    <div class="brand-title">ASN KUROX</div>
    <div class="brand-subtitle">AUTONOMOUS AI BOT</div>
  </div>
</div>
</body>
</html>
"""

# --- HTML TEMPLATE 2: Pure Minimalist Monogram Bot (Grok / Apple Intelligence Line-Art Aesthetic) ---
html_2 = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1024px;
    height: 1024px;
    background: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
  }
  .container {
    width: 1000px;
    height: 1000px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  /* Outer Precision Circle */
  .outer-circle {
    position: absolute;
    width: 860px;
    height: 860px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .branding {
    margin-top: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .brand-title {
    font-size: 56px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    text-indent: 0.35em;
  }
  .brand-subtitle {
    margin-top: 14px;
    font-size: 15px;
    font-weight: 500;
    color: #727785;
    letter-spacing: 0.55em;
    text-transform: uppercase;
    text-indent: 0.55em;
  }
</style>
</head>
<body>
<div class="container">
  <div class="outer-circle"></div>

  <!-- Ultra Clean Minimalist Bot Glyph -->
  <svg width="480" height="480" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Outer Squircle Bot Head -->
    <rect x="70" y="80" width="260" height="240" rx="90" stroke="#ffffff" stroke-width="8" stroke-linecap="round" />

    <!-- Sleek Minimalist Audio/Signal Nodes (Ears) -->
    <line x1="42" y1="170" x2="42" y2="230" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.6" />
    <line x1="358" y1="170" x2="358" y2="230" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.6" />

    <!-- Top Neural Signal Antenna -->
    <line x1="200" y1="46" x2="200" y2="76" stroke="#ffffff" stroke-width="7" stroke-linecap="round" />
    <circle cx="200" cy="38" r="6" fill="#ffffff" filter="url(#softGlow)" />

    <!-- Continuous Visor Pill Bar -->
    <rect x="115" y="155" width="170" height="52" rx="26" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-width="5" />

    <!-- Glowing Twin Core AI Eyes inside Visor -->
    <circle cx="160" cy="181" r="12" fill="#ffffff" filter="url(#softGlow)" />
    <circle cx="240" cy="181" r="12" fill="#ffffff" filter="url(#softGlow)" />

    <!-- Clean AI Aperture / Smile Arc -->
    <path d="M 172 254 Q 200 270 228 254" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
  </svg>

  <div class="branding">
    <div class="brand-title">ASN KUROX</div>
    <div class="brand-subtitle">INTELLIGENT BOT</div>
  </div>
</div>
</body>
</html>
"""

def render_html_to_png(html_str, name):
    html_file = os.path.join(BRAIN_DIR, f"{name}.html")
    png_file = os.path.join(BRAIN_DIR, f"{name}.png")
    workspace_png = os.path.join(BASE_DIR, f"{name}.png")

    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_str)

    cmd = [
        EDGE_EXE,
        "--headless=new",
        f"--screenshot={png_file}",
        "--window-size=1024,1024",
        "--hide-scrollbars",
        f"file:///{html_file.replace(os.sep, '/')}"
    ]
    subprocess.run(cmd, check=True)
    
    # Also copy to workspace for user convenience
    if os.path.exists(png_file):
        with open(png_file, "rb") as src, open(workspace_png, "wb") as dst:
            dst.write(src.read())
        print(f"Rendered: {png_file} and {workspace_png} (Size: {os.path.getsize(png_file)} bytes)")

render_html_to_png(html_1, "asn_kurox_apple_bot_v1")
render_html_to_png(html_2, "asn_kurox_minimal_bot_v2")
print("ALL DONE SUCCESSFULLY!")
