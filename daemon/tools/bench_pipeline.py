#!/usr/bin/env python3
"""
PrintKurox ARM64 Pipeline Benchmark Harness
===========================================
Measures render_s, wire_bytes, peak_rss_mb, CPU temp, and throttle flags
across Gutenprint ESC/P2 presets vs ESC/P-R baseline on Raspberry Pi 3B+.
Dry-run by default (zero ink/paper); requires `--live --confirm-print` to print.
"""

import argparse
import glob
import json
import os
import platform
import resource
import subprocess
import sys
import time

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.dirname(TOOLS_DIR)
if DAEMON_DIR not in sys.path:
    sys.path.insert(0, DAEMON_DIR)


def _read_pi_thermals():
    temp_c = None
    throttled = None
    try:
        t = subprocess.run(["vcgencmd", "measure_temp"], capture_output=True, text=True, timeout=2)
        if t.returncode == 0 and "=" in t.stdout:
            temp_c = float(t.stdout.strip().split("=", 1)[1].rstrip("'C"))
    except Exception:
        pass
    try:
        th = subprocess.run(["vcgencmd", "get_throttled"], capture_output=True, text=True, timeout=2)
        if th.returncode == 0 and "=" in th.stdout:
            throttled = th.stdout.strip().split("=", 1)[1]
    except Exception:
        pass
    return temp_c, throttled


def _pick_default_pdf():
    arch = os.path.join(DAEMON_DIR, "printed_archive")
    pdfs = sorted(glob.glob(os.path.join(arch, "*.pdf")), key=os.path.getmtime, reverse=True)
    return pdfs[0] if pdfs else None


def bench_one(pdl, dup, printer_name, pdf_path, preset_name, live=False):
    color_mode = "color" if preset_name.startswith(("color", "photo")) else "bw"
    is_bw = (color_mode == "bw")
    t_all = time.monotonic()

    if preset_name == "escpr_baseline":
        ppd = pdl._get_readable_ppd_path(printer_name)
        kind, dbin = pdl._detect_prespool_driver(ppd)
        tokens = ["Ink=MONO" if is_bw else "Ink=COLOR"]
        label = "escpr_baseline"
    else:
        ppd, kind, dbin, label, tokens, _ = pdl.resolve_preset_pipeline(
            printer_name, color_mode=color_mode, preset_override=preset_name
        )

    if not ppd or not kind:
        raise RuntimeError(f"Could not resolve PPD/driver for preset {preset_name}")

    opt_tokens = ["PageSize=A4", "fit-to-page", "position=center", "cm-calibration=true"] + list(tokens) + ["sides=one-sided"]
    ds_pdf = pdl._maybe_downsample_oversized_pdf(pdf_path, is_bw=is_bw)
    use_pop = pdl._should_use_pdftoraster(ds_pdf)
    candidates = [
        os.path.join(pdl._CUPS_FILTER_DIR, "pdftoraster") if use_pop else os.path.join(pdl._CUPS_FILTER_DIR, "gstoraster"),
        os.path.join(pdl._CUPS_FILTER_DIR, "gstoraster"),
    ]
    # Deduplicate candidate list while preserving order
    candidates = list(dict.fromkeys([c for c in candidates if os.path.exists(c)]))

    t0 = time.monotonic()
    prn_path, filter_tag, render_s = pdl._prespool_single_job_to_ram(
        printer_name, ds_pdf, opt_tokens, ppd, kind, dbin, candidates
    )
    if ds_pdf != pdf_path and os.path.exists(ds_pdf):
        try:
            os.remove(ds_pdf)
        except Exception:
            pass
    if not prn_path:
        raise RuntimeError(f"Render failed for {label}")

    try:
        wire_bytes = os.path.getsize(prn_path)
        rss_mb = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024.0
        usb_s = None
        if live:
            queue_uri = pdl._get_cached_queue_uris().get(printer_name or "", "")
            tu = time.monotonic()
            dup.send_prn_direct_usb(prn_path, queue_uri=queue_uri, copies=1, log_fn=print)
            usb_s = round(time.monotonic() - tu, 2)
        total_s = round(time.monotonic() - t0, 2)
        temp_c, throttled = _read_pi_thermals()
        return {
            "preset": label,
            "driver": kind,
            "raster": filter_tag,
            "render_s": round(render_s, 2),
            "wire_bytes": wire_bytes,
            "wire_mb": round(wire_bytes / (1024 * 1024), 2),
            "usb_transfer_s": usb_s,
            "total_s": total_s,
            "peak_rss_mb": round(rss_mb, 1),
            "peak_temp_c": temp_c,
            "throttled": throttled,
            "wall_s": round(time.monotonic() - t_all, 2),
        }
    finally:
        if os.path.exists(prn_path):
            try:
                os.remove(prn_path)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="PrintKurox ARM64 Pipeline Benchmark Harness")
    parser.add_argument("--pdf", help="Target PDF path (defaults to newest archived PDF)")
    parser.add_argument("--printer", default="EPSON_L3210_Series", help="Target CUPS printer name")
    parser.add_argument(
        "--presets",
        nargs="+",
        default=["bw_economy", "bw_draft", "bw_standard", "color_draft", "color_standard", "escpr_baseline"],
        help="Preset names to benchmark",
    )
    parser.add_argument("--live", action="store_true", help="Send rendered stream over DirectUSB")
    parser.add_argument("--confirm-print", action="store_true", help="Required alongside --live to print on paper")
    parser.add_argument("--json", action="store_true", help="Emit JSON summary")
    args = parser.parse_args()

    arch = platform.machine().lower()
    if arch != "aarch64":
        print(f"ERROR: bench_pipeline.py must run on Raspberry Pi arm64 (detected {arch}).", file=sys.stderr)
        sys.exit(2)

    if args.live and not args.confirm_print:
        print("ERROR: Refusing physical print without both --live and --confirm-print.", file=sys.stderr)
        sys.exit(2)

    import printer_daemon_linux as pdl
    import direct_usb_printer as dup

    pdf_path = args.pdf or _pick_default_pdf()
    if not pdf_path or not os.path.isfile(pdf_path):
        print(f"ERROR: Target PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Benchmarking PDF: {os.path.basename(pdf_path)} ({os.path.getsize(pdf_path)/1024:.1f} KB) | live={args.live}")
    results = []
    for preset in args.presets:
        res = bench_one(pdl, dup, args.printer, pdf_path, preset, live=args.live)
        results.append(res)
        if not args.json:
            usb_str = f" usb={res['usb_transfer_s']}s" if res["usb_transfer_s"] is not None else ""
            print(
                f"  {res['preset']:16s} [{res['driver']:10s}/{res['raster']:11s}] "
                f"render={res['render_s']:5.2f}s  wire={res['wire_mb']:5.2f}MB ({res['wire_bytes']} B){usb_str}  "
                f"rss={res['peak_rss_mb']}MB  temp={res['peak_temp_c']}C  throttled={res['throttled']}"
            )
    if args.json:
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
