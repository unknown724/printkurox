import sys
import os
import io
import json
import glob
import re
import shutil
import subprocess
import tempfile
import argparse
try:
    import pymupdf
except ImportError:
    pymupdf = None
from PIL import Image, ImageOps, ImageDraw, ImageFont

def render_preview(input_path, output_path, color_mode="bw", page_indices=None, max_pages=4, dpi=140):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    ext = os.path.splitext(input_path)[1].lower()
    with open(input_path, 'rb') as f:
        header = f.read(1024)

    if b'%PDF-' in header:
        is_img = False
    elif (
        header.startswith((b'\xff\xd8\xff', b'\x89PNG\r\n\x1a\n', b'GIF8', b'BM'))
        or (len(header) >= 12 and header[:4] == b'RIFF' and header[8:12] == b'WEBP')
    ):
        is_img = True
    else:
        is_img = ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.heic', '.tiff']
    is_bw = (str(color_mode).lower() in ['bw', 'b&w', 'black', 'mono', 'grayscale'])

    if is_img:
        img = Image.open(input_path)
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        if is_bw:
            img = ImageOps.grayscale(img)

        max_dim = 1800
        if max(img.width, img.height) > max_dim:
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

        draw = ImageDraw.Draw(img)
        border_col = 200 if is_bw else (200, 200, 200)
        draw.rectangle([0, 0, img.width - 1, img.height - 1], outline=border_col, width=1)

        img.save(output_path, 'JPEG', quality=88, optimize=True)
        return {
            "success": True,
            "type": "image",
            "pagesRendered": [1],
            "totalPages": 1,
            "width": img.width,
            "height": img.height
        }

    # PDF Rendering (PyMuPDF if installed, else Poppler pdftoppm + pdfinfo fallback for Raspberry Pi)
    rendered_pages = []
    if pymupdf is not None:
        doc = pymupdf.open(input_path)
        total_pages = len(doc)
        if total_pages == 0:
            raise ValueError("PDF document has 0 pages")

        if page_indices and len(page_indices) > 0:
            target_indices = [p for p in page_indices if 0 <= p < total_pages]
        else:
            target_indices = list(range(min(total_pages, max_pages)))

        if not target_indices:
            target_indices = [0]

        target_indices = target_indices[:max_pages]

        max_edge_px = max(900, min(1400, int(dpi * 8.5)))
        for idx in target_indices:
            page = doc[idx]
            longest_pt = max(1.0, float(page.rect.width), float(page.rect.height))
            zoom = min(dpi / 72.0, float(max_edge_px) / longest_pt)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
            img_bytes = pix.tobytes("png")
            page_img = Image.open(io.BytesIO(img_bytes))
            page_img.load()
            if is_bw:
                page_img = ImageOps.grayscale(page_img)
            elif page_img.mode != 'RGB':
                page_img = page_img.convert('RGB')

            draw = ImageDraw.Draw(page_img)
            border_col = 180 if is_bw else (180, 180, 180)
            draw.rectangle([0, 0, page_img.width - 1, page_img.height - 1], outline=border_col, width=1)
            rendered_pages.append({
                "page_num": idx + 1,
                "img": page_img
            })
    else:
        total_pages = 1
        try:
            info_out = subprocess.check_output(["pdfinfo", input_path], stderr=subprocess.STDOUT, text=True)
            m = re.search(r'^Pages:\s+(\d+)', info_out, re.MULTILINE)
            if m:
                total_pages = max(1, int(m.group(1)))
        except Exception:
            total_pages = 1

        if page_indices and len(page_indices) > 0:
            target_indices = [p for p in page_indices if 0 <= p < total_pages]
        else:
            target_indices = list(range(min(total_pages, max_pages)))

        if not target_indices:
            target_indices = [0]

        target_indices = target_indices[:max_pages]

        tmp_dir = tempfile.mkdtemp(prefix="pk_prev_")
        max_edge_px = max(900, min(1400, int(dpi * 8.5)))
        try:
            for idx in target_indices:
                page_num = idx + 1
                prefix = os.path.join(tmp_dir, f"p{page_num}")
                cmd = ["pdftoppm", "-jpeg", "-scale-to", str(max_edge_px), "-f", str(page_num), "-l", str(page_num)]
                if is_bw:
                    cmd.append("-gray")
                cmd.extend([input_path, prefix])
                subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                matches = sorted(glob.glob(f"{prefix}*.jpg"))
                if not matches:
                    raise RuntimeError(f"pdftoppm produced no output for page {page_num}")
                with Image.open(matches[0]) as raw_img:
                    page_img = raw_img.copy()
                if is_bw and page_img.mode != 'L':
                    page_img = ImageOps.grayscale(page_img)
                elif not is_bw and page_img.mode != 'RGB':
                    page_img = page_img.convert('RGB')

                draw = ImageDraw.Draw(page_img)
                border_col = 180 if is_bw else (180, 180, 180)
                draw.rectangle([0, 0, page_img.width - 1, page_img.height - 1], outline=border_col, width=1)
                rendered_pages.append({
                    "page_num": page_num,
                    "img": page_img
                })
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    count = len(rendered_pages)
    pad = 16
    banner_h = 28
    bg_val = 242 if is_bw else (242, 242, 244)
    text_col = 80 if is_bw else (80, 80, 80)

    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    if count == 1:
        item = rendered_pages[0]
        final_img = item["img"]
        final_img.save(output_path, 'JPEG', quality=88, optimize=True)
    elif count == 2:
        img1 = rendered_pages[0]["img"]
        img2 = rendered_pages[1]["img"]
        if img1.height >= img1.width:
            sheet_w = img1.width + img2.width + pad * 3
            sheet_h = max(img1.height, img2.height) + pad * 2 + banner_h
            sheet = Image.new('L' if is_bw else 'RGB', (sheet_w, sheet_h), bg_val)
            draw = ImageDraw.Draw(sheet)

            p1_x = pad
            p1_y = pad
            sheet.paste(img1, (p1_x, p1_y))
            draw.text((p1_x + 6, p1_y + img1.height + 6), f"Page {rendered_pages[0]['page_num']}", fill=text_col, font=font)

            p2_x = p1_x + img1.width + pad
            p2_y = pad
            sheet.paste(img2, (p2_x, p2_y))
            draw.text((p2_x + 6, p2_y + img2.height + 6), f"Page {rendered_pages[1]['page_num']}", fill=text_col, font=font)
            sheet.save(output_path, 'JPEG', quality=88, optimize=True)
        else:
            sheet_w = max(img1.width, img2.width) + pad * 2
            sheet_h = img1.height + img2.height + pad * 3 + banner_h * 2
            sheet = Image.new('L' if is_bw else 'RGB', (sheet_w, sheet_h), bg_val)
            draw = ImageDraw.Draw(sheet)

            p1_x = pad
            p1_y = pad
            sheet.paste(img1, (p1_x, p1_y))
            draw.text((p1_x + 6, p1_y + img1.height + 6), f"Page {rendered_pages[0]['page_num']}", fill=text_col, font=font)

            p2_x = pad
            p2_y = p1_y + img1.height + pad + banner_h
            sheet.paste(img2, (p2_x, p2_y))
            draw.text((p2_x + 6, p2_y + img2.height + 6), f"Page {rendered_pages[1]['page_num']}", fill=text_col, font=font)
            sheet.save(output_path, 'JPEG', quality=88, optimize=True)
    else:
        max_w = max(p["img"].width for p in rendered_pages)
        max_h = max(p["img"].height for p in rendered_pages)
        grid_w = max_w * 2 + pad * 3
        grid_h = max_h * 2 + pad * 3 + banner_h * 2
        sheet = Image.new('L' if is_bw else 'RGB', (grid_w, grid_h), bg_val)
        draw = ImageDraw.Draw(sheet)

        slots = [
            (pad, pad),
            (max_w + pad * 2, pad),
            (pad, max_h + pad * 2 + banner_h),
            (max_w + pad * 2, max_h + pad * 2 + banner_h)
        ]

        for i, item in enumerate(rendered_pages):
            x, y = slots[i]
            sheet.paste(item["img"], (x, y))
            draw.text((x + 6, y + item["img"].height + 4), f"Page {item['page_num']}", fill=text_col, font=font)

        sheet.save(output_path, 'JPEG', quality=88, optimize=True)

    return {
        "success": True,
        "type": "pdf",
        "pagesRendered": [p["page_num"] for p in rendered_pages],
        "totalPages": total_pages,
        "mode": "bw" if is_bw else "color"
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Render PDF / Image preview for PrintKurox WhatsApp Bot")
    parser.add_argument("--input", required=True, help="Input PDF or Image path")
    parser.add_argument("--output", required=True, help="Output preview JPEG path")
    parser.add_argument("--color", default="bw", help="Color mode: 'bw' or 'color'")
    parser.add_argument("--pages", default="", help="Comma separated page indices or 'all'")
    parser.add_argument("--max-pages", type=int, default=4, help="Maximum pages to stitch into layout")
    parser.add_argument("--dpi", type=int, default=140, help="Rendering DPI (default 140)")

    args = parser.parse_args()

    page_indices = None
    if args.pages and args.pages.lower() != 'all':
        try:
            page_indices = [int(p.strip()) - 1 for p in args.pages.split(',') if p.strip().isdigit()]
        except Exception:
            page_indices = None

    try:
        result = render_preview(
            input_path=args.input,
            output_path=args.output,
            color_mode=args.color,
            page_indices=page_indices,
            max_pages=args.max_pages,
            dpi=args.dpi
        )
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        sys.stderr.write(f"Error rendering preview: {str(e)}\n")
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
