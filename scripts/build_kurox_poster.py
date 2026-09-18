import os
import math
import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

def get_bold_font(size):
    for name in ["segoeuib.ttf", "arialbd.ttf", "seguisb.ttf", "calibrib.ttf"]:
        path = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def get_semibold_font(size):
    for name in ["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"]:
        path = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def get_regular_font(size):
    for name in ["segoeui.ttf", "arial.ttf", "calibri.ttf"]:
        path = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def draw_vector_star(draw, center_x, center_y, size, fill_color):
    points = []
    for i in range(10):
        angle = i * math.pi / 5 - math.pi / 2
        r = size if i % 2 == 0 else size * 0.42
        points.append((center_x + r * math.cos(angle), center_y + r * math.sin(angle)))
    draw.polygon(points, fill=fill_color)

def draw_vector_check_circle(draw, center_x, center_y, radius, circle_color, check_color, stroke=4):
    draw.ellipse(
        [(center_x - radius, center_y - radius), (center_x + radius, center_y + radius)],
        fill=circle_color
    )
    p1 = (center_x - radius * 0.46, center_y - radius * 0.04)
    p2 = (center_x - radius * 0.12, center_y + radius * 0.38)
    p3 = (center_x + radius * 0.48, center_y - radius * 0.42)
    draw.line([p1, p2, p3], fill=check_color, width=stroke, joint="curve")

def draw_vector_lightning(draw, center_x, center_y, size, fill_color):
    s = size
    points = [
        (center_x + 0.1 * s, center_y - 0.5 * s),
        (center_x - 0.4 * s, center_y + 0.05 * s),
        (center_x - 0.05 * s, center_y + 0.05 * s),
        (center_x - 0.2 * s, center_y + 0.5 * s),
        (center_x + 0.4 * s, center_y - 0.05 * s),
        (center_x + 0.05 * s, center_y - 0.05 * s),
    ]
    draw.polygon(points, fill=fill_color)

def generate_scannable_qr(url="https://printkurox.vercel.app/", size=280, dark_color="#071126"):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color=dark_color, back_color="white").convert('RGBA')
    return img.resize((size, size), Image.Resampling.LANCZOS)

def build_blue_poster(out_dir, public_dir):
    base_path = r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\27721978-e678-4434-ad5d-a4ba9d5124ba\printkurox_ad_base_1789735121835.jpg"
    img = Image.open(base_path).convert('RGBA')
    W, H = 2048, 2048
    img = img.resize((W, H), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(img)

    # -------------------------------------------------------------
    # 1. TOP RIGHT: Replace "FOLLOW US NOW" with Real Scannable QR Card
    # -------------------------------------------------------------
    qr_card_w = 480
    qr_card_h = 430
    qr_x0 = 1480
    qr_y0 = 60

    qr_card = Image.new('RGBA', (qr_card_w, qr_card_h), (0, 0, 0, 0))
    qdraw = ImageDraw.Draw(qr_card)

    # Card outer border & body
    qdraw.rounded_rectangle(
        [(0, 0), (qr_card_w - 1, qr_card_h - 1)],
        radius=24,
        fill=(255, 255, 255, 255),
        outline=(0, 220, 255, 255),
        width=4
    )

    # Top Header inside QR Card
    header_h = 52
    qdraw.rounded_rectangle(
        [(16, 14), (qr_card_w - 16, 14 + header_h)],
        radius=14,
        fill=(8, 24, 52, 255)
    )
    font_qr_hdr = get_bold_font(25)
    text_qr_hdr = "SCAN TO PRINT"
    bbox_qh = qdraw.textbbox((0, 0), text_qr_hdr, font=font_qr_hdr)
    qw = bbox_qh[2] - bbox_qh[0]
    qh = bbox_qh[3] - bbox_qh[1]
    qdraw.text(
        ((qr_card_w - qw) // 2, 14 + (header_h - qh) // 2 - 2),
        text_qr_hdr,
        fill=(0, 240, 255, 255),
        font=font_qr_hdr
    )

    # Scannable QR Code
    qr_code_size = 280
    qr_img = generate_scannable_qr("https://printkurox.vercel.app/", size=qr_code_size, dark_color="#071126")
    qr_paste_x = (qr_card_w - qr_code_size) // 2
    qr_paste_y = 74
    qr_card.paste(qr_img, (qr_paste_x, qr_paste_y), qr_img)

    # Bottom link inside QR Card
    font_qr_sub = get_bold_font(23)
    text_qr_sub = "printkurox.vercel.app"
    bbox_qs = qdraw.textbbox((0, 0), text_qr_sub, font=font_qr_sub)
    qsw = bbox_qs[2] - bbox_qs[0]
    qdraw.text(
        ((qr_card_w - qsw) // 2, 368),
        text_qr_sub,
        fill=(10, 28, 60, 255),
        font=font_qr_sub
    )

    img.paste(qr_card, (qr_x0, qr_y0), qr_card)

    # -------------------------------------------------------------
    # 2. UNIFIED RATE CARD: Covers all old checklist text completely
    # Starts below Offer at y=925, covers down to y=1495 (flush with top of shields)
    # -------------------------------------------------------------
    plate_x0, plate_y0 = 180, 925
    plate_x1, plate_y1 = 940, 1495

    # Cyan Outer Glow
    draw.rounded_rectangle(
        [(plate_x0 - 3, plate_y0 - 3), (plate_x1 + 3, plate_y1 + 3)],
        radius=26,
        fill=(0, 240, 255, 50)
    )
    # Solid Deep Navy Glass Body
    draw.rounded_rectangle(
        [(plate_x0, plate_y0), (plate_x1, plate_y1)],
        radius=24,
        fill=(7, 22, 50, 250),
        outline=(0, 220, 255, 200),
        width=3
    )

    # Top Highlight Header: "★ WEBSITE ONLY OFFER PRICE ★"
    hdr_x0, hdr_y0 = plate_x0 + 16, plate_y0 + 16
    hdr_x1, hdr_y1 = plate_x1 - 16, plate_y0 + 82
    draw.rounded_rectangle(
        [(hdr_x0, hdr_y0), (hdr_x1, hdr_y1)],
        radius=14,
        fill=(10, 30, 68, 255),
        outline=(0, 240, 255, 255),
        width=2
    )

    font_badge = get_bold_font(31)
    text_badge = "WEBSITE ONLY OFFER PRICE"
    bbox_b = draw.textbbox((0, 0), text_badge, font=font_badge)
    bw = bbox_b[2] - bbox_b[0]
    bh = bbox_b[3] - bbox_b[1]
    
    badge_center_x = (hdr_x0 + hdr_x1) // 2
    badge_center_y = (hdr_y0 + hdr_y1) // 2
    draw.text(
        (badge_center_x - bw // 2, badge_center_y - bh // 2 - 2),
        text_badge,
        fill=(255, 255, 255, 255),
        font=font_badge
    )

    # Decorative vector stars on both sides of header
    star_offset = bw // 2 + 28
    draw_vector_star(draw, badge_center_x - star_offset, badge_center_y - 2, size=14, fill_color=(250, 204, 21, 255))
    draw_vector_star(draw, badge_center_x + star_offset, badge_center_y - 2, size=14, fill_color=(250, 204, 21, 255))

    # 5 concise items:
    # 1. Black & White: ₹3 / Page
    # 2. Color Print: ₹5 / Page
    # 3. Mega Bulk: Up to 40% Off
    # 4. Instant Print: Room 29, Block B
    # 5. Self-Service: Upload from Phone
    items = [
        ("Black & White:", " ₹4 / Page", (0, 240, 255)),
        ("Color Print:", " ₹7 / Page", (52, 211, 153)),
        ("Mega Bulk:", " Up to 40% Off", (251, 191, 36)),
        ("Instant Print:", " Room 29, Block B", (255, 255, 255)),
        ("Self-Service:", " Upload from Phone", (186, 230, 253)),
    ]

    font_label = get_bold_font(31)
    font_val = get_bold_font(31)

    start_y = plate_y0 + 104
    row_h = 76

    for i, (label, val, clr) in enumerate(items):
        cy = start_y + i * row_h
        
        # Vector checkmark circle
        draw_vector_check_circle(
            draw,
            center_x=plate_x0 + 44,
            center_y=cy + 22,
            radius=19,
            circle_color=(0, 210, 255, 240),
            check_color=(6, 18, 42, 255),
            stroke=4
        )

        # Label
        draw.text(
            (plate_x0 + 78, cy + 4),
            label,
            fill=(255, 255, 255, 255),
            font=font_label
        )
        
        bbox_lbl = draw.textbbox((0, 0), label, font=font_label)
        lw = bbox_lbl[2] - bbox_lbl[0]

        # Value with theme color
        draw.text(
            (plate_x0 + 78 + lw, cy + 4),
            val,
            fill=clr,
            font=font_val
        )

    # -------------------------------------------------------------
    # 3. BOTTOM OFFICIAL WEBSITE CARD (Spans bottom-right, matches theme)
    # -------------------------------------------------------------
    web_x0, web_y0 = 860, 1535
    web_x1, web_y1 = 1960, 1870

    # Glow
    draw.rounded_rectangle(
        [(web_x0 - 3, web_y0 - 3), (web_x1 + 3, web_y1 + 3)],
        radius=26,
        fill=(0, 240, 255, 50)
    )
    # Solid Deep Navy Body
    draw.rounded_rectangle(
        [(web_x0, web_y0), (web_x1, web_y1)],
        radius=24,
        fill=(7, 20, 48, 250),
        outline=(0, 230, 255, 255),
        width=3
    )

    # Sub-header
    font_web_sub = get_bold_font(28)
    text_web_sub = "OFFICIAL CAMPUS PRINTING PORTAL"
    draw.text((web_x0 + 48, web_y0 + 34), text_web_sub, fill=(0, 240, 255, 255), font=font_web_sub)

    # Giant prominent URL
    font_web_url = get_bold_font(58)
    text_web_url = "printkurox.vercel.app"
    draw.text((web_x0 + 48, web_y0 + 82), text_web_url, fill=(255, 255, 255, 255), font=font_web_url)

    # Tagline with vector lightning icon
    draw_vector_lightning(draw, center_x=web_x0 + 64, center_y=web_y0 + 192, size=32, fill_color=(0, 240, 255, 255))

    font_web_tag = get_semibold_font(27)
    text_web_tag = "Instant Print · Room 29, Block B · Order from Any Phone"
    draw.text((web_x0 + 92, web_y0 + 176), text_web_tag, fill=(186, 230, 253, 255), font=font_web_tag)

    # Save to all target paths
    out_jpg = os.path.join(out_dir, "printkurox_ad_poster_pro_blue.jpg")
    out_public_jpg = os.path.join(public_dir, "printkurox_ad_poster_pro_blue.jpg")
    out_public_default = os.path.join(public_dir, "printkurox_ad_poster.jpg")

    final_rgb = img.convert('RGB')
    final_rgb.save(out_jpg, "JPEG", quality=98, optimize=True)
    final_rgb.save(out_public_jpg, "JPEG", quality=98, optimize=True)
    final_rgb.save(out_public_default, "JPEG", quality=98, optimize=True)
    print("Blue poster built and saved successfully!")

def build_red_poster(out_dir, public_dir):
    base_path = r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\27721978-e678-4434-ad5d-a4ba9d5124ba\printkurox_ad_red_base_1789735181299.jpg"
    img = Image.open(base_path).convert('RGBA')
    W, H = 2048, 2048
    img = img.resize((W, H), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(img)

    # -------------------------------------------------------------
    # 1. TOP RIGHT: Replace "FOLLOW US NOW" with Real Scannable QR Card
    # -------------------------------------------------------------
    qr_card_w = 480
    qr_card_h = 430
    qr_x0 = 1480
    qr_y0 = 60

    qr_card = Image.new('RGBA', (qr_card_w, qr_card_h), (0, 0, 0, 0))
    qdraw = ImageDraw.Draw(qr_card)

    qdraw.rounded_rectangle(
        [(0, 0), (qr_card_w - 1, qr_card_h - 1)],
        radius=24,
        fill=(255, 255, 255, 255),
        outline=(225, 29, 72, 255),
        width=4
    )

    header_h = 52
    qdraw.rounded_rectangle(
        [(16, 14), (qr_card_w - 16, 14 + header_h)],
        radius=14,
        fill=(159, 18, 57, 255)
    )
    font_qr_hdr = get_bold_font(25)
    text_qr_hdr = "SCAN TO PRINT"
    bbox_qh = qdraw.textbbox((0, 0), text_qr_hdr, font=font_qr_hdr)
    qw = bbox_qh[2] - bbox_qh[0]
    qh = bbox_qh[3] - bbox_qh[1]
    qdraw.text(
        ((qr_card_w - qw) // 2, 14 + (header_h - qh) // 2 - 2),
        text_qr_hdr,
        fill=(255, 255, 255, 255),
        font=font_qr_hdr
    )

    qr_code_size = 280
    qr_img = generate_scannable_qr("https://printkurox.vercel.app/", size=qr_code_size, dark_color="#881337")
    qr_paste_x = (qr_card_w - qr_code_size) // 2
    qr_paste_y = 74
    qr_card.paste(qr_img, (qr_paste_x, qr_paste_y), qr_img)

    font_qr_sub = get_bold_font(23)
    text_qr_sub = "printkurox.vercel.app"
    bbox_qs = qdraw.textbbox((0, 0), text_qr_sub, font=font_qr_sub)
    qsw = bbox_qs[2] - bbox_qs[0]
    qdraw.text(
        ((qr_card_w - qsw) // 2, 368),
        text_qr_sub,
        fill=(136, 19, 55, 255),
        font=font_qr_sub
    )

    img.paste(qr_card, (qr_x0, qr_y0), qr_card)

    # -------------------------------------------------------------
    # 2. UNIFIED RATE CARD (Red Edition)
    # Starts at y=1040, covers down to y=1545
    # -------------------------------------------------------------
    plate_x0, plate_y0 = 160, 1040
    plate_x1, plate_y1 = 820, 1545

    draw.rounded_rectangle(
        [(plate_x0, plate_y0), (plate_x1, plate_y1)],
        radius=24,
        fill=(255, 255, 255, 255),
        outline=(250, 204, 21, 255),
        width=3
    )

    # Top Highlight Header
    hdr_x0, hdr_y0 = plate_x0 + 14, plate_y0 + 14
    hdr_x1, hdr_y1 = plate_x1 - 14, plate_y0 + 80
    draw.rounded_rectangle(
        [(hdr_x0, hdr_y0), (hdr_x1, hdr_y1)],
        radius=14,
        fill=(185, 28, 28, 255)
    )

    font_badge = get_bold_font(30)
    text_badge = "WEBSITE ONLY OFFER PRICE"
    bbox_b = draw.textbbox((0, 0), text_badge, font=font_badge)
    bw = bbox_b[2] - bbox_b[0]
    bh = bbox_b[3] - bbox_b[1]
    badge_center_x = (hdr_x0 + hdr_x1) // 2
    badge_center_y = (hdr_y0 + hdr_y1) // 2
    draw.text(
        (badge_center_x - bw // 2, badge_center_y - bh // 2 - 2),
        text_badge,
        fill=(255, 255, 255, 255),
        font=font_badge
    )

    star_offset = bw // 2 + 28
    draw_vector_star(draw, badge_center_x - star_offset, badge_center_y - 2, size=14, fill_color=(250, 204, 21, 255))
    draw_vector_star(draw, badge_center_x + star_offset, badge_center_y - 2, size=14, fill_color=(250, 204, 21, 255))

    items = [
        ("Black & White:", " ₹4 / Page", (185, 28, 28)),
        ("Color Print:", " ₹7 / Page", (16, 185, 129)),
        ("Mega Bulk:", " Up to 40% Off", (217, 119, 6)),
        ("Instant Print:", " Room 29, Block B", (15, 23, 42)),
        ("Self-Service:", " Upload from Phone", (15, 23, 42)),
    ]

    font_label = get_bold_font(31)
    font_val = get_bold_font(31)

    start_y = plate_y0 + 104
    row_h = 76

    for i, (label, val, clr) in enumerate(items):
        cy = start_y + i * row_h
        
        draw_vector_check_circle(
            draw,
            center_x=plate_x0 + 44,
            center_y=cy + 22,
            radius=19,
            circle_color=(225, 29, 72, 255),
            check_color=(255, 255, 255, 255),
            stroke=4
        )

        draw.text(
            (plate_x0 + 78, cy + 4),
            label,
            fill=(15, 23, 42, 255),
            font=font_label
        )
        
        bbox_lbl = draw.textbbox((0, 0), label, font=font_label)
        lw = bbox_lbl[2] - bbox_lbl[0]

        draw.text(
            (plate_x0 + 78 + lw, cy + 4),
            val,
            fill=clr,
            font=font_val
        )

    # -------------------------------------------------------------
    # 3. BOTTOM OFFICIAL WEBSITE CARD (Red Edition)
    # Starts at y=1565, completely covers old fake QR pill
    # -------------------------------------------------------------
    web_x0, web_y0 = 160, 1565
    web_x1, web_y1 = 1200, 1890

    draw.rounded_rectangle(
        [(web_x0, web_y0), (web_x1, web_y1)],
        radius=24,
        fill=(159, 18, 57, 250),
        outline=(255, 255, 255, 240),
        width=3
    )

    font_web_sub = get_bold_font(28)
    text_web_sub = "OFFICIAL CAMPUS PRINTING PORTAL"
    draw.text((web_x0 + 48, web_y0 + 34), text_web_sub, fill=(254, 205, 211, 255), font=font_web_sub)

    font_web_url = get_bold_font(58)
    text_web_url = "printkurox.vercel.app"
    draw.text((web_x0 + 48, web_y0 + 82), text_web_url, fill=(255, 255, 255, 255), font=font_web_url)

    draw_vector_lightning(draw, center_x=web_x0 + 64, center_y=web_y0 + 192, size=32, fill_color=(254, 240, 138, 255))

    font_web_tag = get_semibold_font(27)
    text_web_tag = "Instant Print · Room 29, Block B · Order from Any Phone"
    draw.text((web_x0 + 92, web_y0 + 176), text_web_tag, fill=(254, 240, 138, 255), font=font_web_tag)

    # Footer banner covering bottom dummy text
    draw.rectangle([(0, 1920), (W, H)], fill=(120, 15, 40, 255))
    footer_font = get_bold_font(28)
    f_text = "CAMPUS AUTONOMOUS PRINT KIOSK · ROOM 29, BLOCK B · NERIST"
    f_box = draw.textbbox((0, 0), f_text, font=footer_font)
    fw = f_box[2] - f_box[0]
    draw.text(((W - fw) // 2, 1955), f_text, fill=(255, 255, 255, 240), font=footer_font)

    out_jpg = os.path.join(out_dir, "printkurox_ad_poster_pro_red.jpg")
    out_public_jpg = os.path.join(public_dir, "printkurox_ad_poster_pro_red.jpg")

    final_rgb = img.convert('RGB')
    final_rgb.save(out_jpg, "JPEG", quality=98, optimize=True)
    final_rgb.save(out_public_jpg, "JPEG", quality=98, optimize=True)
    print("Red poster built and saved successfully!")

def main():
    artifact_dir = r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\27721978-e678-4434-ad5d-a4ba9d5124ba"
    public_dir = r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public"
    
    os.makedirs(artifact_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    build_blue_poster(artifact_dir, public_dir)
    build_red_poster(artifact_dir, public_dir)
    print("All posters built successfully!")

if __name__ == "__main__":
    main()
