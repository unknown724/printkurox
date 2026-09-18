import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_pdf():
    pdf_path = os.path.abspath(r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public\PrintKurox_Campus_Pricing_Offer.pdf")
    pdf_path_legacy = os.path.abspath(r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public\PrintNERIST_Campus_Pricing_Offer.pdf")
    artifact_path = os.path.abspath(r"C:\Users\Richard Konsam\.gemini\antigravity-ide\brain\6b404d6d-03c1-47db-9405-8e6dd4468fcc\PrintKurox_Campus_Pricing_Offer.pdf")
    img_path = os.path.abspath(r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public\printkurox_ad_poster.jpg")
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    header_title = ParagraphStyle(
        'HeaderTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#0F172A'),
        alignment=1 # Center
    )
    
    header_sub = ParagraphStyle(
        'HeaderSub',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#2563EB'),
        alignment=1
    )
    
    offer_banner = ParagraphStyle(
        'OfferBanner',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#0369A1'),
        alignment=1
    )
    
    tagline = ParagraphStyle(
        'Tagline',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748B'),
        alignment=1
    )
    
    card_title = ParagraphStyle(
        'CardTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#0F172A'),
        alignment=1
    )
    
    card_price_bw = ParagraphStyle(
        'CardPriceBW',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=30,
        leading=34,
        textColor=colors.HexColor('#0284C7'),
        alignment=1
    )
    
    card_price_color = ParagraphStyle(
        'CardPriceColor',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=30,
        leading=34,
        textColor=colors.HexColor('#059669'),
        alignment=1
    )
    
    card_desc = ParagraphStyle(
        'CardDesc',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#475569'),
        alignment=1
    )
    
    section_head = ParagraphStyle(
        'SectionHead',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#0F172A')
    )
    
    body_text = ParagraphStyle(
        'BodyText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#334155')
    )

    badge_style = ParagraphStyle(
        'Badge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1E293B'),
        alignment=1
    )

    elements = []
    
    # 1. Header
    elements.append(Paragraph("PrintKurox", header_title))
    elements.append(Spacer(1, 3))
    elements.append(Paragraph("NERIST CAMPUS AUTONOMOUS PRINT NETWORK · NIRJULI", header_sub))
    elements.append(Spacer(1, 4))
    
    # Offer Pill
    offer_pill = Table(
        [[Paragraph("⚡ <b>SPECIAL OFFER: ₹3 B&amp;W · ₹5 COLOR — OFFER PRICE ONLY FOR WEBSITE PRINT</b>", offer_banner)]],
        colWidths=[7.2*inch]
    )
    offer_pill.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#E0F2FE')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#38BDF8')),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(offer_pill)
    elements.append(Spacer(1, 6))
    elements.append(Paragraph("Self-Service Smart Printing · Instant Pickup at Hostel Block B (Pare, Room 29)", tagline))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceAfter=12))
    
    # 2. Side-by-side: Flyer Poster & Key Pricing Table
    poster_img = RLImage(img_path, width=2.7*inch, height=3.6*inch)
    
    # Pricing Cards Table for right column
    bw_content = [
        Paragraph("<b>BLACK &amp; WHITE</b>", card_title),
        Paragraph("₹3", card_price_bw),
        Paragraph("<b>Per Page / Sheet · Website Exclusive</b>", card_desc),
        Paragraph("Assignments · Notes · Lab Reports<br/>Crisp Laser-grade Monochrome", card_desc)
    ]
    color_content = [
        Paragraph("<b>FULL COLOR</b>", card_title),
        Paragraph("₹5", card_price_color),
        Paragraph("<b>Per Page / Sheet · Website Exclusive</b>", card_desc),
        Paragraph("Presentations · Charts · Project Fronts<br/>Vibrant High-Resolution Color", card_desc)
    ]
    
    pricing_box = Table(
        [
            [Table([[p] for p in bw_content], style=[
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F0F9FF')),
                ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#38BDF8')),
                ('ROUNDEDCORNERS', [8, 8, 8, 8]),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ])],
            [Spacer(1, 8)],
            [Table([[p] for p in color_content], style=[
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#ECFDF5')),
                ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#34D399')),
                ('ROUNDEDCORNERS', [8, 8, 8, 8]),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ])],
        ],
        colWidths=[3.7*inch]
    )
    pricing_box.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    
    hero_table = Table([[poster_img, pricing_box]], colWidths=[2.8*inch, 3.8*inch])
    hero_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (0,0), 'CENTER'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(hero_table)
    elements.append(Spacer(1, 14))
    
    # 3. How to Print (3 Simple Steps)
    elements.append(Paragraph("<b>HOW TO PRINT IN 3 EASY STEPS</b>", section_head))
    elements.append(Spacer(1, 6))
    
    steps_data = [
        [
            Paragraph("<b>STEP 1: VISIT WEBSITE</b><br/>Go to <b>printkurox.vercel.app</b> on your phone or laptop. No app download required.", body_text),
            Paragraph("<b>STEP 2: UPLOAD &amp; CONFIGURE</b><br/>Upload PDF or docs. Choose B&amp;W (₹3) or Color (₹5), double-sided, or copies.", body_text),
            Paragraph("<b>STEP 3: INSTANT PICKUP</b><br/>Pay securely with UPI. Your job prints autonomously in Room 29, Block B (Pare Hostel)!", body_text)
        ]
    ]
    steps_table = Table(steps_data, colWidths=[2.2*inch, 2.2*inch, 2.2*inch])
    steps_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#E2E8F0')),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    elements.append(steps_table)
    elements.append(Spacer(1, 12))
    
    # 4. Features & Benefits Badges
    badges_data = [
        [
            Paragraph("⚡ <b>Zero Waiting Time</b><br/>Direct printer spooling", badge_style),
            Paragraph("🔒 <b>Zero-Trust Secure</b><br/>Encrypted document handling", badge_style),
            Paragraph("📱 <b>No Pendrive / Viruses</b><br/>Direct phone browser upload", badge_style),
            Paragraph("📍 <b>Hostel Convenience</b><br/>Pare Hostel Block B Room 29", badge_style),
        ]
    ]
    badges_table = Table(badges_data, colWidths=[1.65*inch, 1.65*inch, 1.65*inch, 1.65*inch])
    badges_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#EEF2FF')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#C7D2FE')),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(badges_table)
    elements.append(Spacer(1, 12))
    
    # 5. Footer & Contact
    footer_text = Paragraph(
        "<b>Website:</b> https://printkurox.vercel.app &nbsp;&nbsp;·&nbsp;&nbsp; "
        "<b>WhatsApp Support:</b> +91 98630 13886 &nbsp;&nbsp;·&nbsp;&nbsp; "
        "<b>Station Hub:</b> Room 29, 1st Floor, Block B (Pare Hostel), NERIST",
        tagline
    )
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceAfter=8))
    elements.append(footer_text)
    
    # Build Document
    doc.build(elements)
    
    # Copy to legacy & artifact path
    import shutil
    shutil.copy(pdf_path, pdf_path_legacy)
    shutil.copy(pdf_path, artifact_path)
    print(f"PDF successfully generated at:\n1. {pdf_path}\n2. {pdf_path_legacy}\n3. {artifact_path}")

if __name__ == "__main__":
    generate_pdf()
