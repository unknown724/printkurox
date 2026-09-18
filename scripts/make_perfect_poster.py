import os
import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

def make_poster():
    raw_poster_path = os.path.abspath(r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\6b404d6d-03c1-47db-9405-8e6dd4468fcc\printkurox_ad_poster_1789693864350.jpg")
    output_public = os.path.abspath(r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public\printkurox_ad_poster.jpg")
    output_public_legacy = os.path.abspath(r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public\printnerist_ad_poster.jpg")
    artifact_output = os.path.abspath(r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\6b404d6d-03c1-47db-9405-8e6dd4468fcc\printkurox_ad_poster.jpg")
    
    # Load base image
    base = Image.open(raw_poster_path).convert('RGBA')
    bw, bh = base.size
    
    # 1. Generate 100% Real, Scannable QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H, # High 30% error correction
        box_size=8,
        border=1, # Minimal quiet zone handled by card
    )
    qr.add_data("https://printkurox.vercel.app/")
    qr.make(fit=True)
    # Crisp deep navy/black modules on pure white background
    qr_img = qr.make_image(fill_color="#060913", back_color="white").convert('RGBA')
    
    # 2. Design high-end QR card container
    # Dimensions: 156 x 156 px
    card_w, card_h = 156, 156
    card = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    
    # Glowing outer border
    glow_color = (0, 240, 255, 220) # Vibrant cyan glow
    bg_color = (255, 255, 255, 255)
    
    # Draw rounded card with crisp cyan border
    draw.rounded_rectangle(
        [(0, 0), (card_w - 1, card_h - 1)],
        radius=16,
        fill=bg_color,
        outline=glow_color,
        width=3
    )
    
    # Resize QR code to fit with comfortable quiet margin
    # QR size 134 x 134 inside 156 x 156 gives 11px padding on all sides
    qr_size = 134
    qr_resized = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)
    
    # Paste QR in center
    offset_x = (card_w - qr_size) // 2
    offset_y = (card_h - qr_size) // 2
    card.paste(qr_resized, (offset_x, offset_y), qr_resized)
    
    # 3. Position on the footer banner (replaces the fake AI QR code)
    # The center of the fake QR area is at x=757, y=1077
    paste_x = 757 - (card_w // 2)
    paste_y = 1077 - (card_h // 2)
    
    # Paste the real QR card with alpha blending
    base.paste(card, (paste_x, paste_y), card)
    
    # 4. Add "SCAN TO PRINT" micro-badge right above the QR card
    badge_w, badge_h = 110, 20
    badge = Image.new('RGBA', (badge_w, badge_h), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(badge)
    bdraw.rounded_rectangle([(0, 0), (badge_w - 1, badge_h - 1)], radius=6, fill=(10, 22, 40, 255), outline=(0, 240, 255, 200), width=1)
    
    # Use system font for badge
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 10)
    except:
        font = ImageFont.load_default()
        
    text = "SCAN TO PRINT"
    bbox = bdraw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    bdraw.text(((badge_w - tw) // 2, (badge_h - th) // 2 - 1), text, fill=(0, 240, 255, 255), font=font)
    
    badge_x = paste_x + (card_w - badge_w) // 2
    badge_y = paste_y - 24
    base.paste(badge, (badge_x, badge_y), badge)
    
    # 5. Subtle enhancement for crisp WhatsApp presentation
    enhancer = ImageEnhance.Sharpness(base.convert('RGB'))
    enhanced = enhancer.enhance(1.12) # 12% subtle sharpness boost
    
    # Save to public and artifact directories
    enhanced.save(output_public, "JPEG", quality=96, optimize=True)
    enhanced.save(output_public_legacy, "JPEG", quality=96, optimize=True)
    enhanced.save(artifact_output, "JPEG", quality=96, optimize=True)
    
    print(f"Poster successfully generated!\nSaved to:\n- {output_public}\n- {output_public_legacy}\n- {artifact_output}")

if __name__ == "__main__":
    make_poster()
