import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

# A4 at 300 DPI: 2480 x 3508 pixels
WIDTH, HEIGHT = 2480, 3508

def get_font(size, bold=False, semibold=False):
    """Load crisp Windows fonts with graceful fallbacks."""
    if bold:
        candidates = ["segoeuib.ttf", "arialbd.ttf", "calibrib.ttf", "tahomabd.ttf"]
    elif semibold:
        candidates = ["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf", "calibri.ttf"]
    else:
        candidates = ["segoeui.ttf", "arial.ttf", "calibri.ttf", "tahoma.ttf"]

    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()

def draw_pill(draw, x0, y0, x1, y1, fill, outline=None, width=1):
    r = (y1 - y0) // 2
    draw.rounded_rectangle([(x0, y0), (x1, y1)], radius=r, fill=fill, outline=outline, width=width)

def draw_corner_viewfinders(draw, x0, y0, x1, y1, arm=95, stroke=10, color=(37, 99, 235)):
    """Draws high-precision camera viewfinder corner brackets."""
    # Top-Left
    draw.line([(x0, y0), (x0 + arm, y0)], fill=color, width=stroke)
    draw.line([(x0, y0), (x0, y0 + arm)], fill=color, width=stroke)
    # Top-Right
    draw.line([(x1, y0), (x1 - arm, y0)], fill=color, width=stroke)
    draw.line([(x1, y0), (x1 - arm, y0 + arm)], fill=color, width=stroke)
    draw.line([(x1, y0), (x1, y0 + arm)], fill=color, width=stroke)
    # Bottom-Left
    draw.line([(x0, y1), (x0 + arm, y1)], fill=color, width=stroke)
    draw.line([(x0, y1), (x0, y1 - arm)], fill=color, width=stroke)
    # Bottom-Right
    draw.line([(x1, y1), (x1 - arm, y1)], fill=color, width=stroke)
    draw.line([(x1, y1), (x1, y1 - arm)], fill=color, width=stroke)

def draw_camera_icon(draw, cx, cy, size=44, color=(255, 255, 255)):
    """Draws a clean modern camera vector icon."""
    w = size
    h = int(size * 0.74)
    x0 = cx - w // 2
    y0 = cy - h // 2
    # Camera top bump
    bump_w = int(w * 0.35)
    bump_h = int(h * 0.25)
    draw.rounded_rectangle(
        [(cx - bump_w // 2, y0 - bump_h), (cx + bump_w // 2, y0 + 2)],
        radius=4,
        fill=color
    )
    # Camera body
    draw.rounded_rectangle(
        [(x0, y0), (x0 + w, y0 + h)],
        radius=8,
        fill=color
    )
    # Camera lens (outer ring)
    lens_r = int(h * 0.34)
    lens_color = (37, 99, 235) if color == (255, 255, 255) else (255, 255, 255)
    draw.ellipse([(cx - lens_r, cy - lens_r + 2), (cx + lens_r, cy + lens_r + 2)], fill=lens_color)
    inner_r = int(lens_r * 0.52)
    draw.ellipse([(cx - inner_r, cy - inner_r + 2), (cx + inner_r, cy + inner_r + 2)], fill=color)

def draw_pin_icon(draw, cx, cy, size=34, color=(239, 68, 68)):
    """Draws a crisp map pin vector icon."""
    r = size // 2
    # Circle head
    draw.ellipse([(cx - r, cy - r - 4), (cx + r, cy + r - 4)], fill=color)
    # Triangle tip
    draw.polygon([
        (cx - r + 3, cy - 2),
        (cx + r - 3, cy - 2),
        (cx, cy + r + 6)
    ], fill=color)
    # Inner cutout dot
    dot_r = int(r * 0.42)
    draw.ellipse([(cx - dot_r, cy - dot_r - 4), (cx + dot_r, cy + dot_r - 4)], fill=(15, 23, 42))

def draw_bolt_icon(draw, cx, cy, size=32, color=(250, 204, 21)):
    """Draws a clean lightning bolt icon."""
    s = size // 2
    points = [
        (cx - int(s * 0.2), cy - s),
        (cx + int(s * 0.7), cy - s),
        (cx + int(s * 0.1), cy - int(s * 0.1)),
        (cx + int(s * 0.8), cy - int(s * 0.1)),
        (cx - int(s * 0.6), cy + s),
        (cx - int(s * 0.1), cy + int(s * 0.1)),
        (cx - int(s * 0.7), cy + int(s * 0.1)),
    ]
    draw.polygon(points, fill=color)

def draw_lock_icon(draw, cx, cy, size=28, color=(148, 163, 184)):
    """Draws a clean security padlock icon."""
    w = size
    h = int(size * 0.8)
    body_y0 = cy - h // 4
    sh_w = int(w * 0.6)
    sh_h = int(h * 0.85)
    sh_x0 = cx - sh_w // 2
    sh_y0 = body_y0 - sh_h + 4
    draw.arc([(sh_x0, sh_y0), (sh_x0 + sh_w, sh_y0 + sh_h)], start=180, end=0, fill=color, width=4)
    draw.line([(sh_x0, sh_y0 + sh_h // 2), (sh_x0, body_y0)], fill=color, width=4)
    draw.line([(sh_x0 + sh_w, sh_y0 + sh_h // 2), (sh_x0 + sh_w, body_y0)], fill=color, width=4)
    draw.rounded_rectangle([(cx - w // 2, body_y0), (cx + w // 2, body_y0 + h)], radius=6, fill=color)

def create_poster():
    # 1. Canvas Setup
    img = Image.new("RGB", (WIDTH, HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    margin = 80
    # Outer crisp architectural border
    draw.rounded_rectangle(
        [(margin, margin), (WIDTH - margin, HEIGHT - margin)],
        radius=44,
        fill=(255, 255, 255),
        outline=(203, 213, 225), # Slate 300
        width=4
    )

    # 2. Top Header Bar
    y_cursor = margin + 50

    # Brand Title: PrintKurox
    f_brand = get_font(56, bold=True)
    draw.text((margin + 60, y_cursor), "PrintKurox", fill=(15, 23, 42), font=f_brand)

    # Tagline
    f_brand_sub = get_font(32, semibold=True)
    draw.text((margin + 390, y_cursor + 18), "•   Campus Self-Service Cloud Kiosk", fill=(100, 116, 139), font=f_brand_sub)

    # Right Status Pill
    badge_w = 490
    badge_h = 60
    badge_x = WIDTH - margin - 60 - badge_w
    draw_pill(draw, badge_x, y_cursor, badge_x + badge_w, y_cursor + badge_h, fill=(240, 253, 244), outline=(187, 247, 208), width=2)
    draw.ellipse([(badge_x + 28, y_cursor + 22), (badge_x + 44, y_cursor + 38)], fill=(22, 163, 74))
    draw.text((badge_x + 58, y_cursor + 13), "SELF-PRINTING ACTIVE 24/7", fill=(21, 128, 61), font=get_font(27, bold=True))

    # Divider below header
    y_cursor += 88
    draw.line([(margin + 60, y_cursor), (WIDTH - margin - 60, y_cursor)], fill=(226, 232, 240), width=2)

    # 3. Main Hero Hook
    y_cursor += 55
    f_hero = get_font(114, bold=True)
    hero_text = "PRINT DIRECTLY FROM YOUR PHONE"
    bbox = draw.textbbox((0, 0), hero_text, font=f_hero)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), hero_text, fill=(15, 23, 42), font=f_hero)

    y_cursor += 135
    f_hero_sub = get_font(44, semibold=True)
    hero_sub = "No Apps Needed   •   Upload Any Document   •   Instant Laser Print in ~30s"
    bbox = draw.textbbox((0, 0), hero_sub, font=f_hero_sub)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), hero_sub, fill=(71, 85, 105), font=f_hero_sub)

    # 4. Hero Split Section: [Left: Scanner Target Viewfinder] + [Right: 4 Steps & Pickup Card]
    y_cursor += 75
    hero_box_y = y_cursor
    hero_box_h = 1240
    hero_box_w = WIDTH - 2 * (margin + 40)
    hero_box_x = margin + 40

    draw.rounded_rectangle(
        [(hero_box_x, hero_box_y), (hero_box_x + hero_box_w, hero_box_y + hero_box_h)],
        radius=36,
        fill=(248, 250, 252), # Slate 50
        outline=(226, 232, 240),
        width=3
    )

    # Left Column: Scanner Viewfinder Box
    left_w = 1040
    left_h = hero_box_h - 60
    left_x = hero_box_x + 30
    left_y = hero_box_y + 30

    draw.rounded_rectangle(
        [(left_x, left_y), (left_x + left_w, left_y + left_h)],
        radius=28,
        fill=(255, 255, 255),
        outline=(203, 213, 225),
        width=2
    )

    # Scanner Header Bar
    scan_header_h = 84
    draw.rounded_rectangle(
        [(left_x + 8, left_y + 8), (left_x + left_w - 8, left_y + scan_header_h + 8)],
        radius=20,
        fill=(37, 99, 235) # Electric Cobalt
    )

    f_scan_title = get_font(36, bold=True)
    scan_title_text = "POINT PHONE CAMERA TO PRINT"
    bbox = draw.textbbox((0, 0), scan_title_text, font=f_scan_title)
    text_w = bbox[2] - bbox[0]
    total_header_content_w = 50 + 20 + text_w # icon + gap + text
    header_content_start_x = left_x + (left_w - total_header_content_w) // 2

    # Draw vector camera icon
    cam_icon_cx = header_content_start_x + 25
    cam_icon_cy = left_y + 8 + scan_header_h // 2
    draw_camera_icon(draw, cam_icon_cx, cam_icon_cy, size=46, color=(255, 255, 255))

    draw.text((header_content_start_x + 65, left_y + 8 + (scan_header_h - (bbox[3] - bbox[1])) // 2 - 2), scan_title_text, fill=(255, 255, 255), font=f_scan_title)

    # High-Density QR Code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=21,
        border=2,
    )
    qr.add_data("https://printkurox.vercel.app")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#0f172a", back_color="#ffffff").convert("RGB")
    qr_w, qr_h = qr_img.size
    qr_x = left_x + (left_w - qr_w) // 2
    qr_y = left_y + scan_header_h + 38

    # Optical Camera Frame & Corner Brackets
    draw.rectangle([(qr_x - 12, qr_y - 12), (qr_x + qr_w + 12, qr_y + qr_h + 12)], fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw_corner_viewfinders(draw, qr_x - 30, qr_y - 30, qr_x + qr_w + 30, qr_y + qr_h + 30, arm=95, stroke=10, color=(37, 99, 235))
    img.paste(qr_img, (qr_x, qr_y))

    # Website link box
    url_box_y = qr_y + qr_h + 38
    url_box_w = 860
    url_box_h = 70
    url_box_x = left_x + (left_w - url_box_w) // 2
    draw_pill(draw, url_box_x, url_box_y, url_box_x + url_box_w, url_box_y + url_box_h, fill=(241, 245, 249), outline=(203, 213, 225), width=2)
    f_url = get_font(33, bold=True)
    url_str = "WEBSITE:   printkurox.vercel.app"
    bbox = draw.textbbox((0, 0), url_str, font=f_url)
    draw.text((url_box_x + (url_box_w - (bbox[2] - bbox[0])) // 2, url_box_y + (url_box_h - (bbox[3] - bbox[1])) // 2 - 2), url_str, fill=(30, 41, 59), font=f_url)

    # Footnote below QR
    f_scan_sub = get_font(28, semibold=True)
    scan_sub_text = "Works on iPhone & Android   •   Open in Safari, Chrome or Any Browser"
    bbox = draw.textbbox((0, 0), scan_sub_text, font=f_scan_sub)
    draw.text((left_x + (left_w - (bbox[2] - bbox[0])) // 2, url_box_y + url_box_h + 20), scan_sub_text, fill=(100, 116, 139), font=f_scan_sub)

    # Right Column: 4-Step Self-Print Flow & Physical Pickup Card
    right_x = left_x + left_w + 40
    right_w = hero_box_w - left_w - 100
    right_y = left_y

    f_flow_header = get_font(38, bold=True)
    draw.text((right_x + 10, right_y + 12), "HOW SELF-SERVICE PRINTING WORKS", fill=(15, 23, 42), font=f_flow_header)

    steps = [
        ("1", "Scan QR with Phone", "Instantly opens kiosk web app — zero downloads or logins required."),
        ("2", "Upload Document", "Upload PDF, Word DOCX, PPTX, or photos directly from your device."),
        ("3", "Pay Securely Online", "UPI (Google Pay, PhonePe, Paytm), Cards or Net Banking."),
        ("4", "Collect at Room 29", "High-speed laser printer automatically dispenses upon payment.")
    ]

    step_y = right_y + 75
    step_card_h = 136
    step_gap = 20

    for num, title, desc in steps:
        draw.rounded_rectangle(
            [(right_x, step_y), (right_x + right_w, step_y + step_card_h)],
            radius=20,
            fill=(255, 255, 255),
            outline=(226, 232, 240),
            width=2
        )
        # Step Number Badge
        draw.ellipse([(right_x + 28, step_y + 28), (right_x + 106, step_y + 106)], fill=(37, 99, 235))
        f_num = get_font(44, bold=True)
        draw.text((right_x + 51, step_y + 38), num, fill=(255, 255, 255), font=f_num)

        # Step Text
        f_st = get_font(35, bold=True)
        draw.text((right_x + 132, step_y + 24), title, fill=(15, 23, 42), font=f_st)
        f_sd = get_font(27, semibold=True)
        draw.text((right_x + 132, step_y + 74), desc, fill=(100, 116, 139), font=f_sd)

        step_y += step_card_h + step_gap

    # Physical Pickup Banner
    pickup_card_y = step_y + 18
    pickup_card_h = 360
    draw.rounded_rectangle(
        [(right_x, pickup_card_y), (right_x + right_w, pickup_card_y + pickup_card_h)],
        radius=26,
        fill=(15, 23, 42), # Obsidian Slate 900
        outline=(59, 130, 246), # Blue 500
        width=3
    )

    # Location pill tag with vector pin
    tag_w = 340
    tag_h = 54
    draw.rounded_rectangle([(right_x + 36, pickup_card_y + 30), (right_x + 36 + tag_w, pickup_card_y + 30 + tag_h)], radius=14, fill=(30, 41, 59))
    draw_pin_icon(draw, right_x + 65, pickup_card_y + 57, size=28, color=(248, 113, 113))
    draw.text((right_x + 92, pickup_card_y + 42), "PICKUP LOCATION", fill=(226, 232, 240), font=get_font(26, bold=True))

    # Room Address
    f_room = get_font(84, bold=True)
    draw.text((right_x + 36, pickup_card_y + 112), "Block B, Room 29", fill=(255, 255, 255), font=f_room)

    # Fast pickup details with vector bolt
    draw_bolt_icon(draw, right_x + 55, pickup_card_y + 242, size=36, color=(250, 204, 21))
    f_room_sub = get_font(33, semibold=True)
    draw.text((right_x + 85, pickup_card_y + 225), "Prints ready in ~30s   •   Collect with your 4-digit code", fill=(199, 210, 254), font=f_room_sub)

    f_room_sub2 = get_font(27, semibold=True)
    draw.text((right_x + 85, pickup_card_y + 280), "Fully automated laser kiosk — no waiting in counter queues", fill=(148, 163, 184), font=f_room_sub2)

    # 5. Middle Feature Highlight Bar
    y_cursor = hero_box_y + hero_box_h + 55
    feat_bar_w = hero_box_w
    feat_bar_x = hero_box_x
    feat_bar_h = 108

    features = [
        ("FILE SUPPORT", "PDF, Word, PPTX, Images"),
        ("HIGH-SPEED LASER", "Automated Duplex Printing"),
        ("DATA PRIVACY", "Auto-Purged Post Printing"),
        ("UNIVERSAL ACCESS", "Any Phone or Browser")
    ]
    f_w = (feat_bar_w - 3 * 20) // 4
    for idx, (f_title, f_sub) in enumerate(features):
        fx = feat_bar_x + idx * (f_w + 20)
        draw.rounded_rectangle(
            [(fx, y_cursor), (fx + f_w, y_cursor + feat_bar_h)],
            radius=18,
            fill=(241, 245, 249),
            outline=(226, 232, 240),
            width=2
        )
        draw.text((fx + 28, y_cursor + 22), f_title, fill=(37, 99, 235), font=get_font(26, bold=True))
        draw.text((fx + 28, y_cursor + 60), f_sub, fill=(15, 23, 42), font=get_font(25, bold=True))

    # 6. Comparative Pricing & Bulk Matrix
    y_cursor += feat_bar_h + 65

    f_price_head = get_font(60, bold=True)
    price_head_text = "TRANSPARENT PRICING & BULK SAVINGS"
    bbox = draw.textbbox((0, 0), price_head_text, font=f_price_head)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), price_head_text, fill=(15, 23, 42), font=f_price_head)

    y_cursor += 74
    f_price_sub = get_font(34, semibold=True)
    price_sub_text = "Volume discounts apply automatically at checkout based on total sheet count"
    bbox = draw.textbbox((0, 0), price_sub_text, font=f_price_sub)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), price_sub_text, fill=(100, 116, 139), font=f_price_sub)

    # Pricing Table Dimensions
    y_cursor += 50
    tbl_x = margin + 40
    tbl_w = WIDTH - 2 * (margin + 40)
    tbl_y = y_cursor

    col_w = [620, 500, 540, 580]
    col_x = [tbl_x, tbl_x + col_w[0], tbl_x + col_w[0] + col_w[1], tbl_x + col_w[0] + col_w[1] + col_w[2]]

    header_h = 150
    row_h = 160
    total_tbl_h = header_h + 4 * row_h

    # Outer table container
    draw.rounded_rectangle(
        [(tbl_x, tbl_y), (tbl_x + tbl_w, tbl_y + total_tbl_h)],
        radius=28,
        fill=(255, 255, 255),
        outline=(203, 213, 225),
        width=3
    )

    # Column background tints for tiers 2 and 3
    draw.rectangle([(col_x[2], tbl_y + header_h), (col_x[3], tbl_y + total_tbl_h - 1)], fill=(248, 250, 252))
    draw.rectangle([(col_x[3], tbl_y + header_h), (tbl_x + tbl_w - 2, tbl_y + total_tbl_h - 1)], fill=(240, 253, 244))

    # Table Header Dark Band
    draw.rounded_rectangle([(tbl_x, tbl_y), (tbl_x + tbl_w, tbl_y + header_h)], radius=28, fill=(15, 23, 42))
    draw.rectangle([(tbl_x, tbl_y + 80), (tbl_x + tbl_w, tbl_y + header_h)], fill=(15, 23, 42))

    # Header Column 1: Config
    draw.text((col_x[0] + 40, tbl_y + 54), "PRINT CONFIGURATION", fill=(148, 163, 184), font=get_font(30, bold=True))

    # Header Column 2: Standard
    draw.text((col_x[1] + 35, tbl_y + 34), "STANDARD", fill=(255, 255, 255), font=get_font(36, bold=True))
    draw.text((col_x[1] + 35, tbl_y + 88), "1 – 9 Sheets  •  Regular", fill=(148, 163, 184), font=get_font(26, semibold=True))

    # Header Column 3: Assignment Saver
    draw.text((col_x[2] + 35, tbl_y + 34), "ASSIGNMENT SAVER", fill=(255, 255, 255), font=get_font(36, bold=True))
    draw_pill(draw, col_x[2] + 35, tbl_y + 82, col_x[2] + 310, tbl_y + 126, fill=(37, 99, 235), outline=None)
    draw.text((col_x[2] + 55, tbl_y + 90), "SAVE 25%   •   10-29", fill=(255, 255, 255), font=get_font(24, bold=True))

    # Header Column 4: Mega Bulk Saver
    draw.text((col_x[3] + 35, tbl_y + 34), "MEGA BULK SAVER", fill=(255, 255, 255), font=get_font(36, bold=True))
    draw_pill(draw, col_x[3] + 35, tbl_y + 82, col_x[3] + 360, tbl_y + 126, fill=(22, 163, 74), outline=None)
    draw.text((col_x[3] + 55, tbl_y + 90), "BEST VALUE   •   30+ PGS", fill=(255, 255, 255), font=get_font(24, bold=True))

    # Rows Data
    rows_data = [
        ("Black & White", "Single-Sided (1 Side)", "₹4.00", "/ sheet", "₹3.00", "/ sheet (was ₹4)", "₹2.50", "/ sheet (was ₹4)"),
        ("Black & White", "Double-Sided (Duplex)", "₹6.00", "/ sheet (₹3/side)", "₹5.00", "/ sheet (₹2.50/side)", "₹4.00", "/ sheet (₹2/side!)"),
        ("Full Vibrant Color", "Single-Sided (1 Side)", "₹7.00", "/ sheet", "₹6.00", "/ sheet (was ₹7)", "₹5.00", "/ sheet (was ₹7)"),
        ("Full Vibrant Color", "Double-Sided (Duplex)", "₹10.00", "/ sheet (₹5/side)", "₹8.00", "/ sheet (₹4/side)", "₹7.00", "/ sheet (₹3.50/side)"),
    ]

    cur_row_y = tbl_y + header_h
    for i, (cat, mode, c1, c1_s, c2, c2_s, c3, c3_s) in enumerate(rows_data):
        draw.line([(tbl_x, cur_row_y), (tbl_x + tbl_w, cur_row_y)], fill=(226, 232, 240), width=2)

        is_color = "Color" in cat
        cat_color = (190, 24, 93) if is_color else (15, 23, 42)
        draw.text((col_x[0] + 40, cur_row_y + 38), cat, fill=cat_color, font=get_font(38, bold=True))
        draw.text((col_x[0] + 40, cur_row_y + 94), mode, fill=(100, 116, 139), font=get_font(28, semibold=True))

        # Col 1: Standard
        draw.text((col_x[1] + 35, cur_row_y + 34), c1, fill=(15, 23, 42), font=get_font(54, bold=True))
        draw.text((col_x[1] + 35, cur_row_y + 98), c1_s, fill=(100, 116, 139), font=get_font(26, semibold=True))

        # Col 2: Assignment Saver
        draw.text((col_x[2] + 35, cur_row_y + 34), c2, fill=(29, 78, 216), font=get_font(54, bold=True))
        draw.text((col_x[2] + 35, cur_row_y + 98), c2_s, fill=(37, 99, 235), font=get_font(26, bold=True))

        # Col 3: Mega Bulk Saver
        draw.text((col_x[3] + 35, cur_row_y + 34), c3, fill=(21, 128, 61), font=get_font(54, bold=True))
        draw.text((col_x[3] + 35, cur_row_y + 98), c3_s, fill=(22, 163, 74), font=get_font(26, bold=True))

        cur_row_y += row_h

    # Table Column Vertical Dividers
    for x in [col_x[1], col_x[2], col_x[3]]:
        draw.line([(x, tbl_y), (x, tbl_y + total_tbl_h)], fill=(226, 232, 240), width=2)

    # 7. Footer Trust & Security
    y_cursor = tbl_y + total_tbl_h + 65
    draw.line([(margin + 60, y_cursor), (WIDTH - margin - 60, y_cursor)], fill=(226, 232, 240), width=2)

    y_cursor += 42
    f_pay = get_font(32, bold=True)
    pay_text = "All Payment Methods Accepted:   Google Pay   •   PhonePe   •   Paytm   •   BHIM UPI   •   Cards & Net Banking"
    bbox = draw.textbbox((0, 0), pay_text, font=f_pay)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), pay_text, fill=(71, 85, 105), font=f_pay)

    y_cursor += 55
    f_sec = get_font(28, semibold=True)
    sec_text = "256-Bit SSL Encrypted   •   Privacy Guaranteed: All uploaded documents are automatically purged after printing"
    bbox = draw.textbbox((0, 0), sec_text, font=f_sec)
    text_x = (WIDTH - (bbox[2] - bbox[0])) // 2
    # Draw vector lock icon before text
    draw_lock_icon(draw, text_x - 30, y_cursor + 16, size=28, color=(100, 116, 139))
    draw.text((text_x, y_cursor), sec_text, fill=(148, 163, 184), font=f_sec)

    # Save High-Res PNG & PDF
    os.makedirs("public", exist_ok=True)
    png_path = "public/printkurox_qr_poster.png"
    pdf_path = "public/printkurox_qr_poster.pdf"

    img.save(png_path, "PNG")
    print(f"Saved PNG to {png_path}")

    img.save(pdf_path, "PDF", resolution=300.0)
    print(f"Saved PDF to {pdf_path}")

if __name__ == "__main__":
    create_poster()
