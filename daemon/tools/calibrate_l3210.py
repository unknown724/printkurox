#!/usr/bin/env python3
"""
Epson L3210 Dye-Black & Color Calibration Sheet Generator
=========================================================
Builds a single-page A4 diagnostic sheet (text sharpness, 1px alignment grid,
11-step grayscale ramp, C/M/Y/K/R/G/B swatches, and scan crop simulation)
and measures Gutenprint ESC/P2 output size before any paper is printed.
"""

import argparse
import os
import platform
import sys

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.dirname(TOOLS_DIR)
if DAEMON_DIR not in sys.path:
    sys.path.insert(0, DAEMON_DIR)


def generate_calibration_pdf(out_pdf_path: str, cal_cfg: dict) -> str:
    """Generates a single crisp 300 DPI A4 calibration PDF via Pillow."""
    from PIL import Image, ImageDraw, ImageFont

    # A4 at 300 DPI (2480 x 3508 px) with generous margins
    w, h = 2480, 3508
    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    def _font(sz):
        for fp in (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ):
            if os.path.exists(fp):
                try:
                    return ImageFont.truetype(fp, sz)
                except Exception:
                    pass
        return ImageFont.load_default()

    cal = cal_cfg.get("calibration") or {}
    x0, y = 140, 120
    draw.text((x0, y), "PrintKurox Epson L3210 Calibration Sheet", fill=(0, 0, 0), font=_font(56))
    y += 85
    meta = (
        f"Model={cal_cfg.get('gutenprint_ppd_model', '')} | "
        f"BlackDensity={cal.get('StpBlackDensity', '?')} | Density={cal.get('StpDensity', '?')} | "
        f"Gamma={cal.get('StpGamma', '?')} | Corr={cal.get('StpColorCorrection', '?')}"
    )
    draw.text((x0, y), meta, fill=(40, 40, 40), font=_font(28))
    y += 65
    draw.line([(x0, y), (w - x0, y)], fill=(0, 0, 0), width=4)
    y += 45

    # 1. Text Sharpness & Dye-Black Feathering Check
    draw.text((x0, y), "1. Text Crispness & Dye-Black Bleed Test (Plain Paper)", fill=(0, 0, 0), font=_font(36))
    y += 55
    for pt_lbl, sz in [("18pt", 38), ("12pt", 30), ("9pt", 24), ("7pt", 18)]:
        sample = f"[{pt_lbl}] The quick brown fox jumps over 0123456789 (Dye Black Edge Crispness)"
        draw.text((x0, y), sample, fill=(0, 0, 0), font=_font(sz))
        y += int(sz * 1.45)
    y += 30

    # 2. Bidirectional Line Alignment Grid
    draw.text((x0, y), "2. Bidirectional & Line Alignment Grid (Look for Jagged Vertical Bars)", fill=(0, 0, 0), font=_font(36))
    y += 55
    for gx in range(x0, x0 + 2100, 35):
        draw.line([(gx, y), (gx, y + 180)], fill=(0, 0, 0), width=2)
    for gy in range(y, y + 181, 45):
        draw.line([(x0, gy), (x0 + 2065, gy)], fill=(0, 0, 0), width=2)
    y += 235

    # 3. 11-Step Grayscale Ramp
    draw.text((x0, y), "3. 11-Step Grayscale Ramp (0% White -> 100% Pure Black)", fill=(0, 0, 0), font=_font(36))
    y += 55
    sw_w = 190
    for step in range(11):
        v = int(round(255 * (1.0 - step / 10.0)))
        sx = x0 + step * sw_w
        draw.rectangle([sx, y, sx + sw_w - 10, y + 180], fill=(v, v, v), outline=(0, 0, 0), width=2)
        draw.text((sx + 35, y + 195), f"{step * 10}%", fill=(0, 0, 0), font=_font(26))
    y += 265

    # 4. Color Swatches (C/M/Y/K/R/G/B)
    draw.text((x0, y), "4. Primary & Secondary Plain-Paper Color Balance", fill=(0, 0, 0), font=_font(36))
    y += 55
    swatches = [
        ("Black", (0, 0, 0)),
        ("Cyan", (0, 175, 240)),
        ("Magenta", (230, 0, 126)),
        ("Yellow", (255, 235, 0)),
        ("Red", (225, 30, 30)),
        ("Green", (25, 165, 65)),
        ("Blue", (30, 70, 210)),
    ]
    cw = 295
    for idx, (lbl, rgb) in enumerate(swatches):
        sx = x0 + idx * cw
        draw.rectangle([sx, y, sx + cw - 20, y + 210], fill=rgb, outline=(0, 0, 0), width=2)
        # Half-tint 50% patch below solid swatch
        tint = tuple(128 + c // 2 for c in rgb)
        draw.rectangle([sx, y + 225, sx + cw - 20, y + 345], fill=tint, outline=(0, 0, 0), width=2)
        draw.text((sx + 10, y + 360), f"{lbl} 100/50", fill=(0, 0, 0), font=_font(24))
    y += 430

    # 5. Dense Scan Halftone Crop Simulation
    draw.text((x0, y), "5. Dense Gradient / Fine Detail Box", fill=(0, 0, 0), font=_font(36))
    y += 55
    box_w, box_h = 2100, 380
    for dx in range(0, box_w, 4):
        shade = int(255 * dx / box_w)
        draw.line([(x0 + dx, y), (x0 + dx, y + box_h // 2)], fill=(shade, shade, shade), width=4)
        draw.line([(x0 + dx, y + box_h // 2), (x0 + dx, y + box_h)], fill=(shade, 255 - shade, 140), width=4)
    draw.rectangle([x0, y, x0 + box_w, y + box_h], outline=(0, 0, 0), width=3)

    img.save(out_pdf_path, "PDF", resolution=300.0)
    return out_pdf_path


def main():
    parser = argparse.ArgumentParser(description="Generate & optionally dry-run/print L3210 calibration sheet")
    parser.add_argument("--out", default="/tmp/printkurox_calibration_l3210.pdf", help="Output calibration PDF path")
    parser.add_argument("--preset", default="color_standard", help="Calibration test preset (e.g. bw_draft, color_standard)")
    parser.add_argument("--printer", default="EPSON_L3210_Series", help="CUPS printer name")
    parser.add_argument("--print-sheet", action="store_true", help="Send to USB printer via DirectUSB")
    parser.add_argument("--confirm-print", action="store_true", help="Explicit confirmation required with --print-sheet")
    args = parser.parse_args()

    import printer_daemon_linux as pdl
    cfg = pdl.load_calibration_config()
    pdf = generate_calibration_pdf(args.out, cfg)
    print(f"Generated calibration sheet: {pdf} ({os.path.getsize(pdf) / 1024:.1f} KB)")

    if platform.machine().lower() != "aarch64":
        print("Non-ARM64 host detected; skipping Pi filter render.")
        return

    from tools.bench_pipeline import bench_one
    import direct_usb_printer as dup
    do_live = bool(args.print_sheet and args.confirm_print)
    if args.print_sheet and not args.confirm_print:
        print("ERROR: Refusing paper print without --confirm-print.", file=sys.stderr)
        sys.exit(2)
    res = bench_one(pdl, dup, args.printer, pdf, args.preset, live=do_live)
    print(f"Result [{args.preset}]: {res}")


if __name__ == "__main__":
    main()
