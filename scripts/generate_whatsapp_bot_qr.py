import os
import math
import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

# Destination paths
PUBLIC_DIR = r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public\brand"
ARTIFACT_DIR = r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\b236c3d3-e54b-4632-be4e-e7d9b61f478c"
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

PHONE_RAW = "919362980761"
PHONE_DISPLAY = "+91 93629 80761"
WA_URL = f"https://wa.me/{PHONE_RAW}?text=Hi%20PrintKurox%2C%20I%20want%20to%20print%20a%20document"

def get_font(name_candidates, size):
    for name in name_candidates:
        p = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def bold_font(size):
    return get_font(["segoeuib.ttf", "arialbd.ttf", "seguisb.ttf", "calibrib.ttf"], size)

def semibold_font(size):
    return get_font(["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf", "calibrib.ttf"], size)

def regular_font(size):
    return get_font(["segoeui.ttf", "arial.ttf", "calibri.ttf"], size)

def get_whatsapp_logo(size):
    # Load downloaded logo or fallback to drawing
    logo_path = r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\wa_logo_test.png"
    if os.path.exists(logo_path):
        try:
            im = Image.open(logo_path).convert('RGBA')
            return im.resize((size, size), Image.Resampling.LANCZOS)
        except Exception as e:
            print("Logo load failed, creating fallback:", e)

    # Fallback: create vector-like circular green badge with phone icon
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([(0, 0), (size - 1, size - 1)], fill=(37, 211, 102, 255))
    return img

def create_clean_qr(size=1200):
    """
    Creates a pristine 1200x1200px standalone QR code with
    WhatsApp brand styling and high-res center logo.
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=16,
        border=3,
    )
    qr.add_data(WA_URL)
    qr.make(fit=True)

    # Base QR in dark emerald charcoal modules
    qr_img = qr.make_image(fill_color="#0B141A", back_color="#FFFFFF").convert('RGBA')
    qr_img = qr_img.resize((size, size), Image.Resampling.LANCZOS)

    # Create center badge container (size: ~22% of QR code)
    badge_size = int(size * 0.22)
    center = size // 2

    # Draw white pill / circle with subtle drop shadow
    badge = Image.new('RGBA', (badge_size, badge_size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(badge)
    
    # White rounded background with soft emerald stroke
    radius = badge_size // 2
    bdraw.ellipse(
        [(2, 2), (badge_size - 3, badge_size - 3)],
        fill=(255, 255, 255, 255),
        outline=(37, 211, 102, 255),
        width=int(badge_size * 0.04)
    )

    # WhatsApp logo inside
    logo_w = int(badge_size * 0.74)
    wa_logo = get_whatsapp_logo(logo_w)
    logo_offset = (badge_size - logo_w) // 2
    badge.paste(wa_logo, (logo_offset, logo_offset), wa_logo)

    # Paste badge in center of QR
    badge_x = center - (badge_size // 2)
    badge_y = center - (badge_size // 2)
    qr_img.paste(badge, (badge_x, badge_y), badge)

    return qr_img

def create_framed_badge_qr():
    """
    Creates a framed QR card with 'SCAN TO CHAT & PRINT' header and phone number footer.
    Ideal for stickers, flyers, and social media cards (1200 x 1400 px).
    """
    W, H = 1200, 1420
    canvas = Image.new('RGBA', (W, H), (255, 255, 255, 0))
    draw = ImageDraw.Draw(canvas)

    # Card background with rounded corners and gradient-like border
    card_rect = [(20, 20), (W - 20, H - 20)]
    draw.rounded_rectangle(card_rect, radius=48, fill=(255, 255, 255, 255), outline=(37, 211, 102, 255), width=6)

    # Header Bar
    header_h = 180
    header_rect = [(20, 20), (W - 20, 20 + header_h)]
    draw.rounded_rectangle(header_rect, radius=48, fill=(11, 20, 26, 255))
    # Fill bottom corners of header rectangle to keep only top rounded
    draw.rectangle([(20, 20 + header_h - 48), (W - 20, 20 + header_h)], fill=(11, 20, 26, 255))

    # Header WhatsApp Logo
    hwa_logo = get_whatsapp_logo(80)
    canvas.paste(hwa_logo, (60, 70), hwa_logo)

    # Header Texts
    font_htitle = bold_font(42)
    font_hsub = semibold_font(24)
    draw.text((160, 64), "AutoPrint WhatsApp Bot", fill=(255, 255, 255, 255), font=font_htitle)
    draw.text((160, 120), "Direct Document & Photo Printing • 24/7", fill=(37, 211, 102, 255), font=font_hsub)

    # Center QR Code
    qr_size = 820
    qr = create_clean_qr(qr_size)
    qr_x = (W - qr_size) // 2
    qr_y = 230
    canvas.paste(qr, (qr_x, qr_y), qr)

    # Call To Action Pill below QR
    pill_w = 760
    pill_h = 76
    pill_x = (W - pill_w) // 2
    pill_y = 1080
    draw.rounded_rectangle(
        [(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)],
        radius=38,
        fill=(37, 211, 102, 255)
    )
    cta_font = bold_font(34)
    cta_text = "SCAN WITH CAMERA OR WHATSAPP"
    bbox = draw.textbbox((0, 0), cta_text, font=cta_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((pill_x + (pill_w - tw) // 2, pill_y + (pill_h - th) // 2 - 2), cta_text, fill=(11, 20, 26, 255), font=cta_font)

    # Phone Number & Helpline info
    phone_font = bold_font(52)
    p_text = f"WhatsApp: {PHONE_DISPLAY}"
    p_bbox = draw.textbbox((0, 0), p_text, font=phone_font)
    p_tw = p_bbox[2] - p_bbox[0]
    draw.text(((W - p_tw) // 2, 1184), p_text, fill=(11, 20, 26, 255), font=phone_font)

    sub_font = regular_font(26)
    sub_text = "Hostel Block B  •  Hostel Block C  •  Romen Xerox"
    s_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    s_tw = s_bbox[2] - s_bbox[0]
    draw.text(((W - s_tw) // 2, 1260), sub_text, fill=(100, 116, 139, 255), font=sub_font)

    bot_brand = "Powered by PrintKurox Instant AutoPrint System"
    b_font = semibold_font(22)
    b_bbox = draw.textbbox((0, 0), bot_brand, font=b_font)
    b_tw = b_bbox[2] - b_bbox[0]
    draw.text(((W - b_tw) // 2, 1320), bot_brand, fill=(148, 163, 184, 255), font=b_font)

    return canvas

def create_professional_poster():
    """
    Creates a stunning, print-ready, high-resolution 1600 x 2400 px poster
    perfect for notice boards, printer kiosks, hostel common rooms, and shops.
    """
    W, H = 1600, 2400
    # Rich deep gradient background
    poster = Image.new('RGB', (W, H), (11, 20, 26))
    draw = ImageDraw.Draw(poster)

    # Background subtle ambient green glow
    glow_canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow_canvas)
    gdraw.ellipse([(W//2 - 600, 100), (W//2 + 600, 1300)], fill=(37, 211, 102, 28))
    gdraw.ellipse([(W//2 - 400, 200), (W//2 + 400, 1000)], fill=(18, 140, 126, 40))
    glow_canvas = glow_canvas.filter(ImageFilter.GaussianBlur(120))
    poster = Image.alpha_composite(poster.convert('RGBA'), glow_canvas).convert('RGB')
    draw = ImageDraw.Draw(poster)

    # 1. Top Brand Bar & Live Badge
    badge_w, badge_h = 420, 56
    badge_x = (W - badge_w) // 2
    badge_y = 70
    draw.rounded_rectangle([(badge_x, badge_y), (badge_x + badge_w, badge_y + badge_h)], radius=28, fill=(18, 30, 38), outline=(37, 211, 102), width=2)
    
    # Pulsing green dot
    dot_x, dot_y = badge_x + 36, badge_y + 28
    draw.ellipse([(dot_x - 8, dot_y - 8), (dot_x + 8, dot_y + 8)], fill=(37, 211, 102))
    
    b_font = bold_font(24)
    draw.text((badge_x + 60, badge_y + 13), "OFFICIAL WHATSAPP BOT • 24/7", fill=(255, 255, 255), font=b_font)

    # 2. Main Title & Subtitle
    t_font = bold_font(76)
    title = "PRINT ON WHATSAPP"
    t_bbox = draw.textbbox((0, 0), title, font=t_font)
    draw.text(((W - (t_bbox[2] - t_bbox[0])) // 2, 160), title, fill=(255, 255, 255), font=t_font)

    sub_font = semibold_font(34)
    subtitle = "Fast • Zero App Download • Instant Pickup"
    sub_bbox = draw.textbbox((0, 0), subtitle, font=sub_font)
    draw.text(((W - (sub_bbox[2] - sub_bbox[0])) // 2, 255), subtitle, fill=(37, 211, 102), font=sub_font)

    # 3. Main Center Card with Glowing Border & Clean White QR Code
    card_w, card_h = 1180, 1280
    card_x = (W - card_w) // 2
    card_y = 330

    card = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)

    # Card body - crisp white background with rounded corners
    cdraw.rounded_rectangle([(0, 0), (card_w - 1, card_h - 1)], radius=56, fill=(255, 255, 255, 255), outline=(37, 211, 102, 255), width=8)

    # Header inside card
    c_wa_logo = get_whatsapp_logo(76)
    card.paste(c_wa_logo, (64, 50), c_wa_logo)

    cdraw.text((156, 46), "Scan to Chat with Bot", fill=(11, 20, 26, 255), font=bold_font(42))
    cdraw.text((156, 96), "Opens directly on your WhatsApp", fill=(71, 85, 105, 255), font=semibold_font(24))

    # Real QR Code inside card
    qr_dim = 840
    qr_img = create_clean_qr(qr_dim)
    qr_offset_x = (card_w - qr_dim) // 2
    qr_offset_y = 160
    card.paste(qr_img, (qr_offset_x, qr_offset_y), qr_img)

    # Number Display Banner inside Card
    num_box_w = 1040
    num_box_h = 100
    num_box_x = (card_w - num_box_w) // 2
    num_box_y = 1030
    cdraw.rounded_rectangle(
        [(num_box_x, num_box_y), (num_box_x + num_box_w, num_box_y + num_box_h)],
        radius=26,
        fill=(240, 253, 244, 255),
        outline=(37, 211, 102, 255),
        width=2
    )

    # WhatsApp phone display banner inside Card
    num_box_w = 1040
    num_box_h = 104
    num_box_x = (card_w - num_box_w) // 2
    num_box_y = 1030
    cdraw.rounded_rectangle(
        [(num_box_x, num_box_y), (num_box_x + num_box_w, num_box_y + num_box_h)],
        radius=26,
        fill=(240, 253, 244, 255),
        outline=(37, 211, 102, 255),
        width=3
    )

    # Mini WhatsApp logo inside number pill
    mini_logo = get_whatsapp_logo(54)
    card.paste(mini_logo, (num_box_x + 160, num_box_y + 25), mini_logo)

    phone_title_font = bold_font(46)
    p_text = f"WhatsApp: {PHONE_DISPLAY}"
    cdraw.text((num_box_x + 230, num_box_y + 24), p_text, fill=(11, 20, 26, 255), font=phone_title_font)

    # Sub-text in card
    cdraw.text((num_box_x + 20, 1150), "• Or add +91 93629 80761 to your contacts and say 'Hi'", fill=(100, 116, 139, 255), font=semibold_font(24))
    cdraw.text((num_box_x + 20, 1188), "• Works with any smartphone • Automatic page counter & instant UPI", fill=(100, 116, 139, 255), font=regular_font(22))

    poster.paste(card, (card_x, card_y), card)

    # 4. 3-Step How It Works Guide Below
    step_y = 1660
    guide_title = "HOW TO PRINT IN 3 EASY STEPS"
    gt_bbox = draw.textbbox((0, 0), guide_title, font=bold_font(38))
    draw.text(((W - (gt_bbox[2] - gt_bbox[0])) // 2, step_y), guide_title, fill=(255, 255, 255), font=bold_font(38))

    steps = [
        {"num": "1", "title": "Scan QR Code", "desc": "Point phone camera\nor scan via WhatsApp"},
        {"num": "2", "title": "Send Document", "desc": "Send PDF, DOCX, or\nphotos to the bot"},
        {"num": "3", "title": "Instant Printout", "desc": "Pay via 1-Tap UPI &\ncollect at your station"}
    ]

    col_w = 440
    gap = 40
    start_x = (W - (col_w * 3 + gap * 2)) // 2

    for i, s in enumerate(steps):
        sx = start_x + i * (col_w + gap)
        sy = step_y + 70
        # Step card
        draw.rounded_rectangle([(sx, sy), (sx + col_w, sy + 210)], radius=28, fill=(18, 30, 38), outline=(37, 211, 102, 100), width=2)
        
        # Step number circle
        circle_r = 28
        cx, cy = sx + 48, sy + 48
        draw.ellipse([(cx - circle_r, cy - circle_r), (cx + circle_r, cy + circle_r)], fill=(37, 211, 102))
        num_font = bold_font(30)
        nb = draw.textbbox((0, 0), s["num"], font=num_font)
        draw.text((cx - (nb[2] - nb[0]) // 2, cy - (nb[3] - nb[1]) // 2 - 2), s["num"], fill=(11, 20, 26), font=num_font)

        # Step title
        draw.text((sx + 96, sy + 32), s["title"], fill=(255, 255, 255), font=bold_font(30))
        # Step desc
        draw.text((sx + 36, sy + 100), s["desc"], fill=(148, 163, 184), font=regular_font(25), spacing=6)

    # 5. Campus Station Locations Footer Card
    footer_y = 1990
    footer_w = 1400
    footer_h = 290
    footer_x = (W - footer_w) // 2

    draw.rounded_rectangle([(footer_x, footer_y), (footer_x + footer_w, footer_y + footer_h)], radius=36, fill=(15, 25, 33), outline=(37, 211, 102), width=2)

    # Footer Title
    st_title = "CAMPUS PRINT STATIONS"
    st_bbox = draw.textbbox((0, 0), st_title, font=bold_font(26))
    draw.text(((W - (st_bbox[2] - st_bbox[0])) // 2, footer_y + 24), st_title, fill=(37, 211, 102), font=bold_font(26))

    # Stations columns
    st_list = [
        {"name": "Hostel Block B (Pare)", "room": "Room 29, 1st Floor", "tag": "Active 24/7"},
        {"name": "Hostel Block C (Dibang)", "room": "Ground Floor Lobby", "tag": "Active 24/7"},
        {"name": "Romen Xerox", "room": "Main Gate / Off-Campus", "tag": "Cash & UPI"}
    ]

    st_col_w = 420
    st_gap = 20
    st_start_x = footer_x + 30

    for i, st in enumerate(st_list):
        cx = st_start_x + i * (st_col_w + st_gap)
        cy = footer_y + 70
        draw.rounded_rectangle([(cx, cy), (cx + st_col_w, cy + 120)], radius=20, fill=(22, 38, 50))
        draw.text((cx + 20, cy + 20), st["name"], fill=(255, 255, 255), font=bold_font(24))
        draw.text((cx + 20, cy + 54), st["room"], fill=(148, 163, 184), font=regular_font(20))
        draw.text((cx + 20, cy + 84), f"• {st['tag']}", fill=(37, 211, 102), font=semibold_font(18))

    # Bottom Copyright
    bottom_str = "PrintKurox AutoPrint System • Powered by High-Speed Wireless Kiosks"
    bs_bbox = draw.textbbox((0, 0), bottom_str, font=semibold_font(22))
    draw.text(((W - (bs_bbox[2] - bs_bbox[0])) // 2, footer_y + 225), bottom_str, fill=(100, 116, 139), font=semibold_font(22))

    return poster

def create_counter_card():
    """
    Creates a tabletop landscape tent card (1600 x 900 px)
    perfect for placing directly next to the printer or on shop counters.
    """
    W, H = 1600, 900
    card = Image.new('RGB', (W, H), (11, 20, 26))
    draw = ImageDraw.Draw(card)

    # Ambient green accent banner on top
    draw.rectangle([(0, 0), (W, 16)], fill=(37, 211, 102))

    # Left Section: Brand & Instructions
    left_x = 90
    
    # Top Logo Row
    wa_logo = get_whatsapp_logo(70)
    card.paste(wa_logo, (left_x, 60), wa_logo)
    draw.text((left_x + 90, 58), "PrintKurox AutoPrint", fill=(255, 255, 255), font=bold_font(36))
    draw.text((left_x + 90, 104), "Official WhatsApp Printing Bot", fill=(37, 211, 102), font=semibold_font(22))

    # Main Catchy Headline
    draw.text((left_x, 160), "PRINT DIRECTLY\nFROM WHATSAPP", fill=(255, 255, 255), font=bold_font(60), spacing=12)

    # Steps Box
    steps_y = 350
    step_items = [
        "1. Scan the QR code with phone camera or WhatsApp",
        "2. Send your PDF document, notes, or photo to chat",
        "3. Select B&W / Color and collect your printout!"
    ]
    for i, s in enumerate(step_items):
        draw.text((left_x, steps_y + i * 50), s, fill=(203, 213, 225), font=semibold_font(26))

    # Phone highlight box
    box_w = 640
    box_h = 100
    box_y = 540
    draw.rounded_rectangle([(left_x, box_y), (left_x + box_w, box_y + box_h)], radius=24, fill=(18, 30, 38), outline=(37, 211, 102), width=2)
    p_text = f"WhatsApp: {PHONE_DISPLAY}"
    draw.text((left_x + 30, box_y + 26), p_text, fill=(37, 211, 102), font=bold_font(38))

    # Support / stations line
    draw.text((left_x, 680), "• Instant 1-Tap UPI or Cash payment", fill=(148, 163, 184), font=regular_font(24))
    draw.text((left_x, 720), "• Available at Hostel Block B, Hostel Block C & Romen Xerox", fill=(148, 163, 184), font=regular_font(24))
    draw.text((left_x, 765), "• Website: https://printkurox.vercel.app", fill=(100, 116, 139), font=regular_font(22))

    # Right Section: Big White QR Card Container
    qr_card_w = 680
    qr_card_h = 760
    qr_card_x = 840
    qr_card_y = 60

    q_card = Image.new('RGBA', (qr_card_w, qr_card_h), (0, 0, 0, 0))
    qdraw = ImageDraw.Draw(q_card)
    qdraw.rounded_rectangle([(0, 0), (qr_card_w - 1, qr_card_h - 1)], radius=40, fill=(255, 255, 255, 255), outline=(37, 211, 102, 255), width=6)

    # QR Code inside
    qr_dim = 560
    qr_img = create_clean_qr(qr_dim)
    q_card.paste(qr_img, ((qr_card_w - qr_dim) // 2, 40), qr_img)

    # CTA pill inside right card
    pill_w = 580
    pill_h = 68
    pill_x = (qr_card_w - pill_w) // 2
    pill_y = 635
    qdraw.rounded_rectangle([(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)], radius=34, fill=(37, 211, 102, 255))
    cta_t = "SCAN TO PRINT NOW"
    ct_bbox = qdraw.textbbox((0, 0), cta_t, font=bold_font(30))
    qdraw.text((pill_x + (pill_w - (ct_bbox[2] - ct_bbox[0])) // 2, pill_y + 14), cta_t, fill=(11, 20, 26, 255), font=bold_font(30))

    card.paste(q_card, (qr_card_x, qr_card_y), q_card)

    return card

def main():
    print("Generating Professional WhatsApp QR Assets...")

    # 1. Standalone clean QR code (1200x1200px) with greeting prefill
    clean_qr = create_clean_qr(1200)
    clean_path = os.path.join(PUBLIC_DIR, "whatsapp_bot_qr_clean.png")
    clean_qr.save(clean_path, "PNG", optimize=True)
    clean_qr.save(os.path.join(ARTIFACT_DIR, "whatsapp_bot_qr_clean.png"), "PNG", optimize=True)
    print(f"Generated Clean QR: {clean_path}")

    # 1b. Standalone clean QR code direct (https://wa.me/919362980761)
    global WA_URL
    original_url = WA_URL
    WA_URL = f"https://wa.me/{PHONE_RAW}"
    direct_qr = create_clean_qr(1200)
    direct_path = os.path.join(PUBLIC_DIR, "whatsapp_bot_qr_direct.png")
    direct_qr.save(direct_path, "PNG", optimize=True)
    direct_qr.save(os.path.join(ARTIFACT_DIR, "whatsapp_bot_qr_direct.png"), "PNG", optimize=True)
    print(f"Generated Direct Clean QR: {direct_path}")
    WA_URL = original_url

    # 2. Framed Sticker / Social Badge (1200x1420px)
    badge_card = create_framed_badge_qr()
    badge_path = os.path.join(PUBLIC_DIR, "whatsapp_bot_qr_badge.png")
    badge_card.save(badge_path, "PNG", optimize=True)
    badge_card.save(os.path.join(ARTIFACT_DIR, "whatsapp_bot_qr_badge.png"), "PNG", optimize=True)
    print(f"Generated QR Badge: {badge_path}")

    # 3. High-Res Portrait Poster (1600x2400px)
    poster = create_professional_poster()
    poster_png = os.path.join(PUBLIC_DIR, "whatsapp_bot_poster.png")
    poster_jpg = os.path.join(PUBLIC_DIR, "whatsapp_bot_poster.jpg")
    poster.save(poster_png, "PNG", optimize=True)
    poster.save(poster_jpg, "JPEG", quality=96, optimize=True)
    poster.save(os.path.join(ARTIFACT_DIR, "whatsapp_bot_poster.png"), "PNG", optimize=True)
    poster.save(os.path.join(ARTIFACT_DIR, "whatsapp_bot_poster.jpg"), "JPEG", quality=96, optimize=True)
    print(f"Generated High-Res Poster: {poster_png} & {poster_jpg}")

    # 4. Tabletop Counter Tent Card (1600x900px)
    counter = create_counter_card()
    counter_png = os.path.join(PUBLIC_DIR, "whatsapp_bot_counter_card.png")
    counter.save(counter_png, "PNG", optimize=True)
    counter.save(os.path.join(ARTIFACT_DIR, "whatsapp_bot_counter_card.png"), "PNG", optimize=True)
    print(f"Generated Counter Card: {counter_png}")

    print("\nAll assets generated successfully!")

if __name__ == "__main__":
    main()
