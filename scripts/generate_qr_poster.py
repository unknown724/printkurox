import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

# A4 at 300 DPI: 2480 x 3508 pixels
WIDTH, HEIGHT = 2480, 3508

def get_font(size, bold=False, semibold=False):
    """Load high-quality Windows font with graceful fallbacks."""
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

def draw_corner_brackets(draw, x0, y0, x1, y1, bracket_len=65, stroke=8, color=(79, 70, 229)):
    """Draws sleek camera viewfinder corner brackets."""
    # Top-Left
    draw.line([(x0, y0), (x0 + bracket_len, y0)], fill=color, width=stroke)
    draw.line([(x0, y0), (x0, y0 + bracket_len)], fill=color, width=stroke)
    # Top-Right
    draw.line([(x1, y0), (x1 - bracket_len, y0)], fill=color, width=stroke)
    draw.line([(x1, y0), (x1, y0 + bracket_len)], fill=color, width=stroke)
    # Bottom-Left
    draw.line([(x0, y1), (x0 + bracket_len, y1)], fill=color, width=stroke)
    draw.line([(x0, y1), (x0, y1 - bracket_len)], fill=color, width=stroke)
    # Bottom-Right
    draw.line([(x1, y1), (x1 - bracket_len, y1)], fill=color, width=stroke)
    draw.line([(x1, y1), (x1, y1 - bracket_len)], fill=color, width=stroke)

def create_poster():
    # 1. Base Canvas
    img = Image.new("RGB", (WIDTH, HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    margin = 75

    # 2. Outer Framing & Margin with Subtle Drop Highlight
    draw.rounded_rectangle(
        [(margin, margin), (WIDTH - margin, HEIGHT - margin)],
        radius=44,
        fill=(255, 255, 255),
        outline=(226, 232, 240), # Slate 200
        width=4
    )

    # 3. Top Professional Header Accent Bar (Replaces Google Pay 4-color stripe)
    # Perfectly fits within the top border curve
    header_top = margin + 4
    header_h = 24
    draw.rounded_rectangle(
        [(margin + 16, header_top), (WIDTH - margin - 16, header_top + header_h)],
        radius=12,
        fill=(15, 23, 42) # Slate 900
    )
    # Gradient/Accent Indigo Line centered within
    draw.rounded_rectangle(
        [(WIDTH // 2 - 400, header_top + 4), (WIDTH // 2 + 400, header_top + header_h - 4)],
        radius=6,
        fill=(99, 102, 241) # Indigo 500
    )

    y_cursor = margin + 70

    # 4. Brand & Header Section
    # Top Kiosk Pill Badge
    pill_w = 1040
    pill_h = 58
    pill_x0 = (WIDTH - pill_w) // 2
    draw_pill(draw, pill_x0, y_cursor, pill_x0 + pill_w, y_cursor + pill_h, fill=(241, 245, 249), outline=(203, 213, 225), width=2)
    f_kiosk = get_font(28, bold=True)
    kiosk_text = "CAMPUS SMART CLOUD PRINT KIOSK  •  24/7 INSTANT SELF-SERVICE"
    bbox = draw.textbbox((0, 0), kiosk_text, font=f_kiosk)
    draw.text((pill_x0 + (pill_w - (bbox[2] - bbox[0])) // 2, y_cursor + (pill_h - (bbox[3] - bbox[1])) // 2 - 3), kiosk_text, fill=(71, 85, 105), font=f_kiosk)

    y_cursor += pill_h + 30

    # Brand Title: PrintKurox
    f_brand = get_font(136, bold=True)
    brand_text = "PrintKurox"
    bbox = draw.textbbox((0, 0), brand_text, font=f_brand)
    w_text = bbox[2] - bbox[0]
    draw.text(((WIDTH - w_text) // 2, y_cursor), brand_text, fill=(15, 23, 42), font=f_brand)

    # Subtitle
    y_cursor += 155
    f_sub = get_font(42, semibold=True)
    sub_text = "Zero App Required  •  Instant Document Upload  •  Laser-Sharp Output"
    bbox = draw.textbbox((0, 0), sub_text, font=f_sub)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), sub_text, fill=(100, 116, 139), font=f_sub)

    # 5. Hero QR Code Card
    y_cursor += 80
    hero_w = 1580
    hero_h = 1040
    hero_x0 = (WIDTH - hero_w) // 2
    hero_y0 = y_cursor

    # Soft subtle outer card
    draw.rounded_rectangle(
        [(hero_x0, hero_y0), (hero_x0 + hero_w, hero_y0 + hero_h)],
        radius=36,
        fill=(255, 255, 255),
        outline=(199, 210, 254), # Indigo 200
        width=4
    )

    # Top CTA banner inside card
    banner_h = 96
    draw.rounded_rectangle(
        [(hero_x0 + 8, hero_y0 + 8), (hero_x0 + hero_w - 8, hero_y0 + banner_h + 8)],
        radius=28,
        fill=(79, 70, 229) # Indigo 600
    )
    f_cta = get_font(52, bold=True)
    cta_text = "SCAN WITH CAMERA TO PRINT"
    bbox = draw.textbbox((0, 0), cta_text, font=f_cta)
    draw.text((hero_x0 + (hero_w - (bbox[2] - bbox[0])) // 2, hero_y0 + 8 + (banner_h - (bbox[3] - bbox[1])) // 2 - 4), cta_text, fill=(255, 255, 255), font=f_cta)

    # Generate QR Code: box_size = 18 -> exactly 666 x 666 px
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=18,
        border=2,
    )
    qr.add_data("https://printkurox.vercel.app")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#0f172a", back_color="#ffffff").convert("RGB")
    qr_w, qr_h = qr_img.size
    qr_x = (WIDTH - qr_w) // 2
    qr_y = hero_y0 + banner_h + 45

    # Draw quiet zone frame
    draw.rectangle(
        [(qr_x - 14, qr_y - 14), (qr_x + qr_w + 14, qr_y + qr_h + 14)],
        fill=(255, 255, 255),
        outline=(226, 232, 240),
        width=3
    )
    # Viewfinder corner brackets with proper breathing room
    draw_corner_brackets(draw, qr_x - 32, qr_y - 32, qr_x + qr_w + 32, qr_y + qr_h + 32, bracket_len=65, stroke=8, color=(79, 70, 229))

    img.paste(qr_img, (qr_x, qr_y))

    # Website link pill below QR
    url_box_y = qr_y + qr_h + 40
    url_box_w = 1120
    url_box_h = 72
    url_box_x = (WIDTH - url_box_w) // 2
    draw_pill(draw, url_box_x, url_box_y, url_box_x + url_box_w, url_box_y + url_box_h, fill=(248, 250, 252), outline=(203, 213, 225), width=2)
    
    f_url = get_font(38, bold=True)
    url_text = "WEBSITE:  https://printkurox.vercel.app"
    bbox = draw.textbbox((0, 0), url_text, font=f_url)
    draw.text((url_box_x + (url_box_w - (bbox[2] - bbox[0])) // 2, url_box_y + (url_box_h - (bbox[3] - bbox[1])) // 2 - 3), url_text, fill=(30, 41, 59), font=f_url)

    # Hint text
    f_hint = get_font(32, semibold=True)
    hint_text = "Works with iPhone & Android camera  •  Upload PDF, Word, PPT or Photos"
    bbox = draw.textbbox((0, 0), hint_text, font=f_hint)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, url_box_y + url_box_h + 18), hint_text, fill=(100, 116, 139), font=f_hint)

    # 6. Pricing Section Header
    y_cursor = hero_y0 + hero_h + 65

    f_sec_title = get_font(56, bold=True)
    sec_title = "TRANSPARENT PRICING & BULK OFFERS"
    bbox = draw.textbbox((0, 0), sec_title, font=f_sec_title)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), sec_title, fill=(15, 23, 42), font=f_sec_title)

    y_cursor += 72
    f_sec_sub = get_font(34, semibold=True)
    sec_sub = "Direct volume discounts applied automatically at checkout based on total sheets"
    bbox = draw.textbbox((0, 0), sec_sub, font=f_sec_sub)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), sec_sub, fill=(100, 116, 139), font=f_sec_sub)

    # 7. Three-Tier Pricing Grid (Standard | Assignment Saver | Mega Bulk Saver)
    y_cursor += 60
    card_w = 720
    card_h = 715
    gap = 40
    start_x = (WIDTH - (3 * card_w + 2 * gap)) // 2

    # CARD 1: STANDARD (1-9 Sheets)
    c1_x0 = start_x
    draw.rounded_rectangle(
        [(c1_x0, y_cursor), (c1_x0 + card_w, y_cursor + card_h)],
        radius=28,
        fill=(255, 255, 255),
        outline=(226, 232, 240),
        width=4
    )
    # Header strip
    draw.rounded_rectangle([(c1_x0, y_cursor), (c1_x0 + card_w, y_cursor + 115)], radius=28, fill=(248, 250, 252))
    draw.rectangle([(c1_x0, y_cursor + 80), (c1_x0 + card_w, y_cursor + 115)], fill=(248, 250, 252))
    draw.line([(c1_x0, y_cursor + 115), (c1_x0 + card_w, y_cursor + 115)], fill=(226, 232, 240), width=3)
    
    # Title & Sub-badge
    draw.text((c1_x0 + 35, y_cursor + 22), "Standard", fill=(15, 23, 42), font=get_font(42, bold=True))
    draw.text((c1_x0 + 35, y_cursor + 72), "1 – 9 Sheets  •  Regular Rate", fill=(100, 116, 139), font=get_font(28, semibold=True))
    draw_pill(draw, c1_x0 + card_w - 200, y_cursor + 28, c1_x0 + card_w - 30, y_cursor + 78, fill=(241, 245, 249), outline=(203, 213, 225), width=2)
    draw.text((c1_x0 + card_w - 180, y_cursor + 38), "REGULAR", fill=(71, 85, 105), font=get_font(24, bold=True))

    # B&W Box
    box1_y0 = y_cursor + 140
    box_h = 230
    draw.rounded_rectangle([(c1_x0 + 25, box1_y0), (c1_x0 + card_w - 25, box1_y0 + box_h)], radius=20, fill=(248, 250, 252), outline=(226, 232, 240), width=2)
    draw.text((c1_x0 + 45, box1_y0 + 18), "BLACK & WHITE", fill=(71, 85, 105), font=get_font(26, bold=True))
    draw.text((c1_x0 + 45, box1_y0 + 58), "₹4", fill=(15, 23, 42), font=get_font(84, bold=True))
    draw.text((c1_x0 + 180, box1_y0 + 95), "/ single sheet", fill=(100, 116, 139), font=get_font(34, semibold=True))
    draw.line([(c1_x0 + 45, box1_y0 + 160), (c1_x0 + card_w - 45, box1_y0 + 160)], fill=(226, 232, 240), width=2)
    draw.text((c1_x0 + 45, box1_y0 + 175), "Double-Sided (Duplex):  ₹6 / sheet", fill=(30, 41, 59), font=get_font(30, bold=True))

    # Color Box
    box2_y0 = box1_y0 + box_h + 25
    draw.rounded_rectangle([(c1_x0 + 25, box2_y0), (c1_x0 + card_w - 25, box2_y0 + box_h)], radius=20, fill=(255, 241, 242), outline=(254, 205, 211), width=2)
    draw.text((c1_x0 + 45, box2_y0 + 18), "FULL VIBRANT COLOR", fill=(190, 24, 93), font=get_font(26, bold=True))
    draw.text((c1_x0 + 45, box2_y0 + 58), "₹7", fill=(190, 24, 93), font=get_font(84, bold=True))
    draw.text((c1_x0 + 180, box2_y0 + 95), "/ single sheet", fill=(100, 116, 139), font=get_font(34, semibold=True))
    draw.line([(c1_x0 + 45, box2_y0 + 160), (c1_x0 + card_w - 45, box2_y0 + 160)], fill=(254, 205, 211), width=2)
    draw.text((c1_x0 + 45, box2_y0 + 175), "Double-Sided (Duplex):  ₹10 / sheet", fill=(159, 18, 57), font=get_font(30, bold=True))

    # Bottom Note
    draw.text((c1_x0 + 35, y_cursor + card_h - 48), "• Everyday fast printouts & forms", fill=(148, 163, 184), font=get_font(26, semibold=True))

    # CARD 2: ASSIGNMENT SAVER (10-29 Sheets) - FEATURED
    c2_x0 = start_x + card_w + gap
    draw.rounded_rectangle(
        [(c2_x0, y_cursor), (c2_x0 + card_w, y_cursor + card_h)],
        radius=28,
        fill=(255, 255, 255),
        outline=(99, 102, 241), # Indigo 500
        width=5
    )
    # Header strip
    draw.rounded_rectangle([(c2_x0, y_cursor), (c2_x0 + card_w, y_cursor + 115)], radius=28, fill=(238, 242, 255))
    draw.rectangle([(c2_x0, y_cursor + 80), (c2_x0 + card_w, y_cursor + 115)], fill=(238, 242, 255))
    draw.line([(c2_x0, y_cursor + 115), (c2_x0 + card_w, y_cursor + 115)], fill=(199, 210, 254), width=3)
    
    # Title & Badge
    draw.text((c2_x0 + 35, y_cursor + 22), "Assignment Saver", fill=(49, 46, 129), font=get_font(42, bold=True))
    draw.text((c2_x0 + 35, y_cursor + 72), "10 – 29 Sheets  •  Auto-Applied", fill=(79, 70, 229), font=get_font(28, bold=True))
    draw_pill(draw, c2_x0 + card_w - 230, y_cursor + 28, c2_x0 + card_w - 30, y_cursor + 78, fill=(79, 70, 229), outline=None)
    draw.text((c2_x0 + card_w - 208, y_cursor + 38), "SAVE 25%", fill=(255, 255, 255), font=get_font(25, bold=True))

    # B&W Box
    draw.rounded_rectangle([(c2_x0 + 25, box1_y0), (c2_x0 + card_w - 25, box1_y0 + box_h)], radius=20, fill=(248, 250, 252), outline=(226, 232, 240), width=2)
    draw.text((c2_x0 + 45, box1_y0 + 18), "BLACK & WHITE", fill=(71, 85, 105), font=get_font(26, bold=True))
    draw.text((c2_x0 + 45, box1_y0 + 58), "₹3", fill=(15, 23, 42), font=get_font(84, bold=True))
    draw.text((c2_x0 + 180, box1_y0 + 95), "/ single sheet  (was ₹4)", fill=(79, 70, 229), font=get_font(32, bold=True))
    draw.line([(c2_x0 + 45, box1_y0 + 160), (c2_x0 + card_w - 45, box1_y0 + 160)], fill=(226, 232, 240), width=2)
    draw.text((c2_x0 + 45, box1_y0 + 175), "Double-Sided (Duplex):  ₹5 / sheet", fill=(30, 41, 59), font=get_font(30, bold=True))

    # Color Box
    draw.rounded_rectangle([(c2_x0 + 25, box2_y0), (c2_x0 + card_w - 25, box2_y0 + box_h)], radius=20, fill=(255, 241, 242), outline=(254, 205, 211), width=2)
    draw.text((c2_x0 + 45, box2_y0 + 18), "FULL VIBRANT COLOR", fill=(190, 24, 93), font=get_font(26, bold=True))
    draw.text((c2_x0 + 45, box2_y0 + 58), "₹6", fill=(190, 24, 93), font=get_font(84, bold=True))
    draw.text((c2_x0 + 180, box2_y0 + 95), "/ single sheet  (was ₹7)", fill=(190, 24, 93), font=get_font(32, bold=True))
    draw.line([(c2_x0 + 45, box2_y0 + 160), (c2_x0 + card_w - 45, box2_y0 + 160)], fill=(254, 205, 211), width=2)
    draw.text((c2_x0 + 45, box2_y0 + 175), "Double-Sided (Duplex):  ₹8 / sheet", fill=(159, 18, 57), font=get_font(30, bold=True))

    # Bottom Note
    draw.text((c2_x0 + 35, y_cursor + card_h - 48), "• Popular for Lab Records & Assignments", fill=(79, 70, 229), font=get_font(26, bold=True))

    # CARD 3: MEGA BULK SAVER (30+ Sheets) - BEST VALUE
    c3_x0 = start_x + 2 * (card_w + gap)
    draw.rounded_rectangle(
        [(c3_x0, y_cursor), (c3_x0 + card_w, y_cursor + card_h)],
        radius=28,
        fill=(255, 255, 255),
        outline=(16, 185, 129), # Emerald 500
        width=5
    )
    # Header strip
    draw.rounded_rectangle([(c3_x0, y_cursor), (c3_x0 + card_w, y_cursor + 115)], radius=28, fill=(236, 253, 245))
    draw.rectangle([(c3_x0, y_cursor + 80), (c3_x0 + card_w, y_cursor + 115)], fill=(236, 253, 245))
    draw.line([(c3_x0, y_cursor + 115), (c3_x0 + card_w, y_cursor + 115)], fill=(167, 243, 208), width=3)
    
    # Title & Badge
    draw.text((c3_x0 + 35, y_cursor + 22), "Mega Bulk Saver", fill=(6, 78, 59), font=get_font(42, bold=True))
    draw.text((c3_x0 + 35, y_cursor + 72), "30+ Sheets  •  Maximum Savings", fill=(21, 128, 61), font=get_font(28, bold=True))
    draw_pill(draw, c3_x0 + card_w - 240, y_cursor + 28, c3_x0 + card_w - 30, y_cursor + 78, fill=(5, 150, 105), outline=None)
    draw.text((c3_x0 + card_w - 225, y_cursor + 38), "SAVE 37.5%", fill=(255, 255, 255), font=get_font(25, bold=True))

    # B&W Box
    draw.rounded_rectangle([(c3_x0 + 25, box1_y0), (c3_x0 + card_w - 25, box1_y0 + box_h)], radius=20, fill=(240, 253, 244), outline=(187, 247, 208), width=2)
    draw.text((c3_x0 + 45, box1_y0 + 18), "BLACK & WHITE", fill=(22, 101, 52), font=get_font(26, bold=True))
    draw.text((c3_x0 + 45, box1_y0 + 58), "₹2.50", fill=(21, 128, 61), font=get_font(84, bold=True))
    draw.text((c3_x0 + 280, box1_y0 + 95), "/ single sheet", fill=(100, 116, 139), font=get_font(34, semibold=True))
    draw.line([(c3_x0 + 45, box1_y0 + 160), (c3_x0 + card_w - 45, box1_y0 + 160)], fill=(187, 247, 208), width=2)
    draw.text((c3_x0 + 45, box1_y0 + 175), "Double-Sided:  ₹4 / sheet (₹2/side!)", fill=(21, 128, 61), font=get_font(30, bold=True))

    # Color Box
    draw.rounded_rectangle([(c3_x0 + 25, box2_y0), (c3_x0 + card_w - 25, box2_y0 + box_h)], radius=20, fill=(255, 241, 242), outline=(254, 205, 211), width=2)
    draw.text((c3_x0 + 45, box2_y0 + 18), "FULL VIBRANT COLOR", fill=(190, 24, 93), font=get_font(26, bold=True))
    draw.text((c3_x0 + 45, box2_y0 + 58), "₹5", fill=(190, 24, 93), font=get_font(84, bold=True))
    draw.text((c3_x0 + 180, box2_y0 + 95), "/ single sheet  (was ₹7)", fill=(190, 24, 93), font=get_font(32, bold=True))
    draw.line([(c3_x0 + 45, box2_y0 + 160), (c3_x0 + card_w - 45, box2_y0 + 160)], fill=(254, 205, 211), width=2)
    draw.text((c3_x0 + 45, box2_y0 + 175), "Double-Sided (Duplex):  ₹7 / sheet", fill=(159, 18, 57), font=get_font(30, bold=True))

    # Bottom Note
    draw.text((c3_x0 + 35, y_cursor + card_h - 48), "• Best for Lecture Notes, Thesis & Manuals", fill=(5, 150, 105), font=get_font(26, bold=True))

    # 8. Pickup Location Banner
    y_cursor += card_h + 65
    loc_w = 2240
    loc_h = 165
    loc_x0 = (WIDTH - loc_w) // 2

    draw.rounded_rectangle(
        [(loc_x0, y_cursor), (loc_x0 + loc_w, y_cursor + loc_h)],
        radius=26,
        fill=(15, 23, 42), # Slate 900
        outline=(99, 102, 241), # Indigo 500
        width=4
    )
    # Left accent tag
    draw.rounded_rectangle([(loc_x0 + 35, y_cursor + 32), (loc_x0 + 360, y_cursor + loc_h - 32)], radius=16, fill=(30, 41, 59))
    draw.text((loc_x0 + 65, y_cursor + 54), "COLLECT AT", fill=(148, 163, 184), font=get_font(30, bold=True))
    draw.text((loc_x0 + 65, y_cursor + 94), "PICKUP POINT", fill=(255, 255, 255), font=get_font(28, bold=True))

    # Main Address
    draw.text((loc_x0 + 400, y_cursor + 40), "Block B, Room 29", fill=(255, 255, 255), font=get_font(74, bold=True))
    draw.text((loc_x0 + 405, y_cursor + 115), "Instant auto-print • Collect your prints with your 4-digit Pickup Code", fill=(199, 210, 254), font=get_font(30, semibold=True))

    # Right side badge
    badge_w = 410
    badge_h = 72
    badge_x = loc_x0 + loc_w - badge_w - 35
    badge_y = y_cursor + (loc_h - badge_h) // 2
    draw_pill(draw, badge_x, badge_y, badge_x + badge_w, badge_y + badge_h, fill=(22, 163, 74), outline=None)
    draw.text((badge_x + 35, badge_y + 18), "READY INSTANTLY", fill=(255, 255, 255), font=get_font(30, bold=True))

    # 9. How It Works Steps
    y_cursor += loc_h + 60
    f_step_sec = get_font(38, bold=True)
    step_sec_title = "HOW TO PRINT IN 4 SIMPLE STEPS"
    bbox = draw.textbbox((0, 0), step_sec_title, font=f_step_sec)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), step_sec_title, fill=(71, 85, 105), font=f_step_sec)

    y_cursor += 60
    step_box_w = 525
    step_box_h = 145
    step_gap = 46
    step_start_x = (WIDTH - (4 * step_box_w + 3 * step_gap)) // 2

    steps = [
        ("1", "Scan QR Code", "Open kiosk on phone"),
        ("2", "Upload Files", "PDF, Docs or Photos"),
        ("3", "Pay Online", "UPI / QR / Cards"),
        ("4", "Collect Prints", "Block B, Room 29")
    ]

    for i, (num, title, desc) in enumerate(steps):
        sx0 = step_start_x + i * (step_box_w + step_gap)
        # Step card
        draw.rounded_rectangle([(sx0, y_cursor), (sx0 + step_box_w, y_cursor + step_box_h)], radius=20, fill=(248, 250, 252), outline=(226, 232, 240), width=2)
        # Number badge
        draw.ellipse([(sx0 + 25, y_cursor + 38), (sx0 + 95, y_cursor + 108)], fill=(79, 70, 229))
        draw.text((sx0 + 46, y_cursor + 51), num, fill=(255, 255, 255), font=get_font(36, bold=True))
        # Text
        draw.text((sx0 + 120, y_cursor + 36), title, fill=(15, 23, 42), font=get_font(32, bold=True))
        draw.text((sx0 + 120, y_cursor + 82), desc, fill=(100, 116, 139), font=get_font(26, semibold=True))

    # 10. Footer Trust & Accepted Payments
    y_cursor += step_box_h + 55
    draw.line([(margin + 60, y_cursor), (WIDTH - margin - 60, y_cursor)], fill=(226, 232, 240), width=2)

    y_cursor += 35
    f_pay = get_font(32, bold=True)
    pay_text = "Accepted: Google Pay  •  PhonePe  •  Paytm  •  BHIM UPI  •  All Credit & Debit Cards"
    bbox = draw.textbbox((0, 0), pay_text, font=f_pay)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), pay_text, fill=(71, 85, 105), font=f_pay)

    y_cursor += 50
    f_sec = get_font(28, semibold=True)
    sec_text = "256-Bit SSL Encrypted  •  Privacy Guaranteed: Documents automatically purged after printing"
    bbox = draw.textbbox((0, 0), sec_text, font=f_sec)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), sec_text, fill=(148, 163, 184), font=f_sec)

    y_cursor += 48
    f_support = get_font(26, semibold=True)
    sup_text = "Need Assistance? Visit Room 29  •  Fast Self-Service High-Speed Duplex Laser Printing"
    bbox = draw.textbbox((0, 0), sup_text, font=f_support)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, y_cursor), sup_text, fill=(160, 174, 192), font=f_support)

    # 11. Save PNG & PDF
    os.makedirs("public", exist_ok=True)
    png_path = "public/printkurox_qr_poster.png"
    pdf_path = "public/printkurox_qr_poster.pdf"

    img.save(png_path, "PNG")
    print(f"Saved PNG to {png_path}")

    img.save(pdf_path, "PDF", resolution=300.0)
    print(f"Saved PDF to {pdf_path}")

if __name__ == "__main__":
    create_poster()
