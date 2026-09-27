import os
import subprocess

BASE_DIR = r"C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint"
BRAIN_DIR = r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\49496b5a-49a2-4708-b374-c4f3796517c0"
EDGE_EXE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

# --- V5: Ultra-Sleek Executive AI Bot (Apple Industrial / Teenage Engineering) ---
html_5 = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1024px;
    height: 1024px;
    background: radial-gradient(circle at 50% 45%, #14151a 0%, #060709 70%, #000000 100%);
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
  .precision-ring {
    position: absolute;
    width: 880px;
    height: 880px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 50px rgba(0, 0, 0, 0.8);
  }
  svg {
    width: 520px;
    height: 520px;
    filter: drop-shadow(0 20px 45px rgba(0, 0, 0, 0.95));
    z-index: 2;
  }
  .branding {
    margin-top: 42px;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 2;
  }
  .brand-title {
    font-size: 60px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.36em;
    text-transform: uppercase;
    text-indent: 0.36em;
    text-shadow: 0 4px 25px rgba(255, 255, 255, 0.2);
  }
  .brand-subtitle {
    margin-top: 14px;
    font-size: 15px;
    font-weight: 600;
    color: #848a99;
    letter-spacing: 0.58em;
    text-transform: uppercase;
    text-indent: 0.58em;
  }
</style>
</head>
<body>
<div class="container">
  <div class="precision-ring"></div>

  <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="chassisGrad" x1="200" y1="60" x2="200" y2="340" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="50%" stop-color="#e8ecf2" />
        <stop offset="100%" stop-color="#b6bcc9" />
      </linearGradient>

      <linearGradient id="darkVisor" x1="200" y1="130" x2="200" y2="230" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#0a0b0e" />
        <stop offset="100%" stop-color="#000000" />
      </linearGradient>

      <filter id="intenseGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Top Neural Apex Pill -->
    <rect x="194" y="44" width="12" height="28" rx="6" fill="#8e94a3" />
    <circle cx="200" cy="38" r="8" fill="#ffffff" filter="url(#intenseGlow)" />

    <!-- Left Geometric Ear Pod -->
    <rect x="52" y="145" width="20" height="74" rx="10" fill="#a4aab8" />
    <circle cx="62" cy="182" r="4.5" fill="#ffffff" opacity="0.9" />

    <!-- Right Geometric Ear Pod -->
    <rect x="328" y="145" width="20" height="74" rx="10" fill="#a4aab8" />
    <circle cx="338" cy="182" r="4.5" fill="#ffffff" opacity="0.9" />

    <!-- Solid Premium Chassis (Curved Helmet) -->
    <rect x="68" y="66" width="264" height="232" rx="84" fill="url(#chassisGrad)" stroke="#ffffff" stroke-width="2" />

    <!-- Dark Panoramic Visor Slot -->
    <rect x="94" y="132" width="212" height="100" rx="45" fill="url(#darkVisor)" stroke="#1a1c24" stroke-width="3" />

    <!-- Glowing Cybernetic Visor Bar / Dual Pulse Display -->
    <g filter="url(#intenseGlow)">
      <!-- Left Pill Aperture -->
      <rect x="135" y="158" width="38" height="48" rx="19" fill="#ffffff" />
      <!-- Right Pill Aperture -->
      <rect x="227" y="158" width="38" height="48" rx="19" fill="#ffffff" />
      <!-- Center Interconnect Line -->
      <line x1="173" y1="182" x2="227" y2="182" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.7" />
    </g>

    <!-- Subtle Lower Vent / Acoustic Port -->
    <line x1="170" y1="262" x2="230" y2="262" stroke="#000000" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round" />

    <!-- Solid Collar Stand -->
    <path d="M 130 308 C 130 300, 160 295, 200 295 C 240 295, 270 300, 270 308 L 288 348 C 288 354, 275 360, 200 360 C 125 360, 112 354, 112 348 Z" fill="#9399a8" />
    <line x1="160" y1="330" x2="240" y2="330" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.4" />
  </svg>

  <div class="branding">
    <div class="brand-title">ASN KUROX</div>
    <div class="brand-subtitle">AI PRINT BOT</div>
  </div>
</div>
</body>
</html>
"""

html_file = os.path.join(BRAIN_DIR, "asn_kurox_apple_pro_v5.html")
png_file = os.path.join(BRAIN_DIR, "asn_kurox_apple_pro_v5.png")
workspace_png = os.path.join(BASE_DIR, "asn_kurox_apple_pro_v5.png")

with open(html_file, "w", encoding="utf-8") as f:
    f.write(html_5)

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
    print(f"Rendered: {png_file} (Size: {os.path.getsize(png_file)} bytes)")
