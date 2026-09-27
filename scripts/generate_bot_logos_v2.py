import os
import subprocess

BASE_DIR = r"C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint"
BRAIN_DIR = r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\49496b5a-49a2-4708-b374-c4f3796517c0"
EDGE_EXE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

# --- V3: Ceramic White Apple Bot (High Contrast, Pops on WhatsApp) ---
html_3 = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1024px;
    height: 1024px;
    background: radial-gradient(circle at 50% 46%, #15161b 0%, #060608 75%, #000000 100%);
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
  .outer-ring {
    position: absolute;
    width: 880px;
    height: 880px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 60px rgba(255, 255, 255, 0.03);
  }
  svg {
    width: 520px;
    height: 520px;
    filter: drop-shadow(0 25px 50px rgba(0, 0, 0, 0.9));
    z-index: 2;
  }
  .branding {
    margin-top: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 2;
  }
  .brand-title {
    font-size: 60px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    text-indent: 0.32em;
    text-shadow: 0 4px 25px rgba(255, 255, 255, 0.25);
  }
  .brand-subtitle {
    margin-top: 14px;
    font-size: 16px;
    font-weight: 600;
    color: #838896;
    letter-spacing: 0.52em;
    text-transform: uppercase;
    text-indent: 0.52em;
  }
</style>
</head>
<body>
<div class="container">
  <div class="outer-ring"></div>

  <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Ceramic Shell Gradient (Apple Style) -->
      <linearGradient id="ceramicGrad" x1="200" y1="50" x2="200" y2="330" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="60%" stop-color="#edf0f5" />
        <stop offset="100%" stop-color="#c8cdd6" />
      </linearGradient>

      <!-- Glossy Visor Screen -->
      <linearGradient id="oledVisor" x1="200" y1="110" x2="200" y2="250" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#121318" />
        <stop offset="100%" stop-color="#050608" />
      </linearGradient>

      <!-- Specular Highlight for Visor -->
      <linearGradient id="visorGlass" x1="120" y1="120" x2="280" y2="180" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25" />
        <stop offset="45%" stop-color="#ffffff" stop-opacity="0.05" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>

      <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <filter id="eyeBeam" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="12" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Top Neural Signal Node (Antenna) -->
    <rect x="195" y="44" width="10" height="26" rx="5" fill="#a0a5b2" />
    <circle cx="200" cy="38" r="8" fill="#ffffff" filter="url(#softGlow)" />

    <!-- Left Audio Node (Ear) -->
    <rect x="52" y="145" width="22" height="75" rx="11" fill="#c4c9d4" stroke="#888e9d" stroke-width="1.5" />
    <circle cx="63" cy="182" r="5" fill="#717684" />

    <!-- Right Audio Node (Ear) -->
    <rect x="326" y="145" width="22" height="75" rx="11" fill="#c4c9d4" stroke="#888e9d" stroke-width="1.5" />
    <circle cx="337" cy="182" r="5" fill="#717684" />

    <!-- Main Ceramic Head Chassis (Squircle with 3D Depth) -->
    <rect x="70" y="65" width="260" height="236" rx="85" fill="url(#ceramicGrad)" stroke="#ffffff" stroke-width="2" />

    <!-- Inner Shadow Ring of Visor Socket -->
    <rect x="92" y="88" width="216" height="190" rx="64" fill="#1e2027" />

    <!-- OLED Deep Obsidian Visor Screen -->
    <rect x="96" y="92" width="208" height="182" rx="60" fill="url(#oledVisor)" />

    <!-- Visor Curved Glass Specular Highlight -->
    <path d="M 108 126 C 145 106, 255 106, 292 126 C 255 146, 145 146, 108 126 Z" fill="url(#visorGlass)" />

    <!-- Glowing Futuristic AI Eyes (Dual Curved Pill Visors) -->
    <g filter="url(#eyeBeam)">
      <!-- Left Eye -->
      <rect x="136" y="152" width="26" height="46" rx="13" fill="#ffffff" />
      <circle cx="149" cy="165" r="4.5" fill="#ffffff" />
      <!-- Right Eye -->
      <rect x="238" y="152" width="26" height="46" rx="13" fill="#ffffff" />
      <circle cx="251" cy="165" r="4.5" fill="#ffffff" />
    </g>

    <!-- Friendly Subtle AI Smile Arc -->
    <path d="M 182 225 Q 200 236 218 225" stroke="#ffffff" stroke-width="4" stroke-linecap="round" filter="url(#softGlow)" opacity="0.9" />

    <!-- Robot Base / Collar Stand -->
    <path d="M 126 312 C 126 304, 155 298, 200 298 C 245 298, 274 304, 274 312 L 292 352 C 292 358, 278 364, 200 364 C 122 364, 108 358, 108 352 Z" fill="#b0b5c2" stroke="#8d93a2" stroke-width="1.5" />
    <line x1="160" y1="334" x2="240" y2="334" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6" />
  </svg>

  <div class="branding">
    <div class="brand-title">ASN KUROX</div>
    <div class="brand-subtitle">AUTONOMOUS AI BOT</div>
  </div>
</div>
</body>
</html>
"""

# --- V4: Grok / Modern AI Lab Precision Silhouette (Pure Geometric Luxury) ---
html_4 = """<!DOCTYPE html>
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
  .circular-frame {
    position: absolute;
    width: 860px;
    height: 860px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.15);
  }
  svg {
    width: 490px;
    height: 490px;
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
    letter-spacing: 0.35em;
    text-transform: uppercase;
    text-indent: 0.35em;
  }
  .brand-subtitle {
    margin-top: 14px;
    font-size: 15px;
    font-weight: 600;
    color: #7b808e;
    letter-spacing: 0.55em;
    text-transform: uppercase;
    text-indent: 0.55em;
  }
</style>
</head>
<body>
<div class="container">
  <div class="circular-frame"></div>

  <!-- Pure Geometric AI Bot Symbol (Grok & Apple Hybrid) -->
  <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="10" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Top Signal Antenna Node -->
    <line x1="200" y1="44" x2="200" y2="78" stroke="#ffffff" stroke-width="8" stroke-linecap="round" />
    <circle cx="200" cy="38" r="8" fill="#ffffff" filter="url(#neonGlow)" />

    <!-- External Audio/Sensor Nodes -->
    <rect x="42" y="160" width="16" height="70" rx="8" fill="#ffffff" fill-opacity="0.8" />
    <rect x="342" y="160" width="16" height="70" rx="8" fill="#ffffff" fill-opacity="0.8" />

    <!-- Primary Bot Head Mask -->
    <rect x="74" y="80" width="252" height="230" rx="80" fill="#ffffff" />

    <!-- Visor Inset (Deep Dark Contrast) -->
    <rect x="100" y="106" width="200" height="178" rx="60" fill="#000000" />

    <!-- Glowing Twin Aperture Eyes (Apple/Grok Precision) -->
    <g filter="url(#neonGlow)">
      <!-- Left Eye -->
      <rect x="138" y="152" width="28" height="50" rx="14" fill="#ffffff" />
      <!-- Right Eye -->
      <rect x="234" y="152" width="28" height="50" rx="14" fill="#ffffff" />
    </g>

    <!-- Elegant Visor Pulse / Smile Arc -->
    <path d="M 180 236 Q 200 248 220 236" stroke="#ffffff" stroke-width="5" stroke-linecap="round" filter="url(#neonGlow)" />
  </svg>

  <div class="branding">
    <div class="brand-title">ASN KUROX</div>
    <div class="brand-subtitle">AUTONOMOUS BOT</div>
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
    
    if os.path.exists(png_file):
        with open(png_file, "rb") as src, open(workspace_png, "wb") as dst:
            dst.write(src.read())
        print(f"Rendered: {png_file} and {workspace_png} (Size: {os.path.getsize(png_file)} bytes)")

render_html_to_png(html_3, "asn_kurox_apple_ceramic_v3")
render_html_to_png(html_4, "asn_kurox_grok_geometric_v4")
print("V3 & V4 RENDERED SUCCESSFULLY!")
