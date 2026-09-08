import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

# A4 at 300 DPI: 2480 x 3508 pixels
WIDTH, HEIGHT = 2480, 3508

def create_poster():
    # 1. Create Base White Canvas
    img = Image.new("RGB", (WIDTH, HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # 2. Outer Border (clean poster margin 60px)
    margin = 80
    draw.rounded_rectangle(
        [(margin, margin), (WIDTH - margin, HEIGHT - margin)],
        radius=40,
        outline=(220, 225, 235),
        width=6
    )

    # 3. Top Color Bar (Google Pay style 4-color stripe: Blue, Red, Yellow, Green)
    stripe_height = 50
    stripe_w = (WIDTH - 2 * margin) // 4
    colors = [
        (66, 133, 244),   # Google Blue
        (234, 67, 53),    # Google Red
        (251, 188, 5),    # Google Yellow
        (52, 168, 83)     # Google Green
    ]
    for i, color in enumerate(colors):
        x0 = margin + i * stripe_w
        x1 = margin + (i + 1) * stripe_w if i < 3 else (WIDTH - margin)
        draw.rectangle([x0, margin, x1, margin + stripe_height], fill=color)

    # Helper font loader with fallback
    def get_font(size, bold=False):
        font_names = [
            "arialbd.ttf" if bold else "arial.ttf",
            "seguisb.ttf" if bold else "segoeui.ttf",
            "calibrib.ttf" if bold else "calibri.ttf",
            "tahoma.ttf",
        ]
        for name in font_names:
            try:
                return ImageFont.truetype(name, size)
            except Exception:
                pass
        return ImageFont.load_default()

    font_brand = get_font(130, bold=True)
    font_sub = get_font(70, bold=True)
    font_instruction = get_font(85, bold=True)
    font_url = get_font(55, bold=True)
    font_price_title = get_font(60, bold=True)
    font_price_num = get_font(85, bold=True)
    font_footer = get_font(50, bold=True)

    # 4. Brand Header
    y_cursor = margin + stripe_height + 100
    brand_text = "PrintKurox"
    sub_text = "Kuro Services • Self-Service Kiosk"
    
    # Draw Brand
    bbox = draw.textbbox((0, 0), brand_text, font=font_brand)
    w_text = bbox[2] - bbox[0]
    draw.text(((WIDTH - w_text) // 2, y_cursor), brand_text, fill=(17, 24, 39), font=font_brand)
    
    y_cursor += 150
    bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
    w_text = bbox[2] - bbox[0]
    draw.text(((WIDTH - w_text) // 2, y_cursor), sub_text, fill=(100, 116, 139), font=font_sub)

    # 5. Main Call to Action Banner
    y_cursor += 130
    banner_w, banner_h = 1900, 150
    banner_x0 = (WIDTH - banner_w) // 2
    draw.rounded_rectangle(
        [(banner_x0, y_cursor), (banner_x0 + banner_w, y_cursor + banner_h)],
        radius=30,
        fill=(79, 70, 229) # Indigo 600
    )
    cta_text = "SCAN WITH CAMERA TO PRINT"
    bbox = draw.textbbox((0, 0), cta_text, font=font_instruction)
    w_text = bbox[2] - bbox[0]
    h_text = bbox[3] - bbox[1]
    draw.text((banner_x0 + (banner_w - w_text) // 2, y_cursor + (banner_h - h_text) // 2 - 10), cta_text, fill=(255, 255, 255), font=font_instruction)

    # 6. Generate Big QR Code
    y_cursor += 220
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=34,
        border=3,
    )
    qr.add_data("https://printkurox.vercel.app")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#0f172a", back_color="#ffffff").convert("RGB")
    
    # Place QR Code centered with subtle frame
    qr_w, qr_h = qr_img.size
    qr_x = (WIDTH - qr_w) // 2
    
    # White background frame around QR
    frame_pad = 40
    draw.rounded_rectangle(
        [(qr_x - frame_pad, y_cursor - frame_pad), (qr_x + qr_w + frame_pad, y_cursor + qr_h + frame_pad)],
        radius=40,
        outline=(203, 213, 225),
        width=5
    )
    img.paste(qr_img, (qr_x, y_cursor))

    # 7. Website URL below QR
    y_cursor += qr_h + 80
    url_text = "WEBSITE:  https://printkurox.vercel.app"
    bbox = draw.textbbox((0, 0), url_text, font=font_url)
    w_text = bbox[2] - bbox[0]
    draw.text(((WIDTH - w_text) // 2, y_cursor), url_text, fill=(30, 41, 59), font=font_url)

    # 8. Pricing Cards Section
    y_cursor += 130
    card_w = 950
    card_h = 320
    gap = 80
    start_x = (WIDTH - (2 * card_w + gap)) // 2

    # Card 1: B&W Pricing
    card1_x0 = start_x
    draw.rounded_rectangle(
        [(card1_x0, y_cursor), (card1_x0 + card_w, y_cursor + card_h)],
        radius=30,
        fill=(248, 250, 252),
        outline=(203, 213, 225),
        width=4
    )
    draw.text((card1_x0 + 60, y_cursor + 45), "BLACK & WHITE (B&W)", fill=(15, 23, 42), font=font_price_title)
    draw.text((card1_x0 + 60, y_cursor + 135), "₹4", fill=(15, 23, 42), font=font_price_num)
    draw.text((card1_x0 + 220, y_cursor + 165), "/ sheet (₹6 duplex)", fill=(100, 116, 139), font=get_font(48, bold=True))
    draw.text((card1_x0 + 60, y_cursor + 245), "• Laser-sharp academic print", fill=(71, 85, 105), font=get_font(42))

    # Card 2: Color Pricing
    card2_x0 = start_x + card_w + gap
    draw.rounded_rectangle(
        [(card2_x0, y_cursor), (card2_x0 + card_w, y_cursor + card_h)],
        radius=30,
        fill=(253, 242, 248),
        outline=(244, 114, 182),
        width=4
    )
    draw.text((card2_x0 + 60, y_cursor + 45), "FULL VIBRANT COLOR", fill=(190, 24, 93), font=font_price_title)
    draw.text((card2_x0 + 60, y_cursor + 135), "₹7", fill=(190, 24, 93), font=font_price_num)
    draw.text((card2_x0 + 220, y_cursor + 165), "/ sheet (₹10 duplex)", fill=(100, 116, 139), font=get_font(48, bold=True))
    draw.text((card2_x0 + 60, y_cursor + 245), "• Vivid photo & chart output", fill=(71, 85, 105), font=get_font(42))

    # 9. Pickup Location Banner
    y_cursor += card_h + 70
    loc_w = 2000
    loc_h = 160
    loc_x0 = (WIDTH - loc_w) // 2
    draw.rounded_rectangle(
        [(loc_x0, y_cursor), (loc_x0 + loc_w, y_cursor + loc_h)],
        radius=25,
        fill=(241, 245, 249),
        outline=(203, 213, 225),
        width=3
    )
    loc_title = "COLLECT PRINTS AT:"
    loc_addr = "Block B, Room 29"
    draw.text((loc_x0 + 60, y_cursor + 45), loc_title, fill=(71, 85, 105), font=get_font(48, bold=True))
    draw.text((loc_x0 + 650, y_cursor + 38), loc_addr, fill=(15, 23, 42), font=get_font(65, bold=True))

    # 10. How It Works Steps
    y_cursor += loc_h + 80
    steps_text = "1. Scan QR Code   -->   2. Upload PDF/Image   -->   3. Pay Online   -->   4. Collect at Room 29"
    bbox = draw.textbbox((0, 0), steps_text, font=get_font(42, bold=True))
    w_text = bbox[2] - bbox[0]
    draw.text(((WIDTH - w_text) // 2, y_cursor), steps_text, fill=(79, 70, 229), font=get_font(42, bold=True))

    # 11. Footer UPI Icons row
    y_cursor += 100
    draw.line([(margin + 100, y_cursor), (WIDTH - margin - 100, y_cursor)], fill=(226, 232, 240), width=3)
    y_cursor += 40
    pay_text = "Google Pay • PhonePe • Paytm • BHIM UPI • Cards Accepted"
    bbox = draw.textbbox((0, 0), pay_text, font=font_footer)
    w_text = bbox[2] - bbox[0]
    draw.text(((WIDTH - w_text) // 2, y_cursor), pay_text, fill=(148, 163, 184), font=font_footer)

    # Save PNG and PDF
    os.makedirs("public", exist_ok=True)
    png_path = "public/printkurox_qr_poster.png"
    pdf_path = "public/printkurox_qr_poster.pdf"

    img.save(png_path, "PNG")
    print(f"Saved PNG to {png_path}")

    # Convert to PDF
    img.save(pdf_path, "PDF", resolution=300.0)
    print(f"Saved PDF to {pdf_path}")

if __name__ == "__main__":
    create_poster()
