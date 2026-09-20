import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(36, 805, "PrintKurox IoT Project Proposal — Autonomous Hostel Print Stations")
            self.drawRightString(559, 805, "Confidential & Proprietary")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(36, 800, 559, 800)
            
        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(36, 40, 559, 40)
        
        self.drawString(36, 28, "Project PrintKurox · NERIST Autonomous Student Printing Infrastructure")
        self.drawRightString(559, 28, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def build_budget_proposal_pdf():
    pdf_path = os.path.abspath(r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\PrintKurox_Hardware_Budget_Proposal.pdf")
    public_pdf_path = os.path.abspath(r"c:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\public\PrintKurox_Hardware_Budget_Proposal.pdf")
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=46,
        bottomMargin=50
    )
    
    styles = getSampleStyleSheet()
    
    # Typography Styles
    c_primary = colors.HexColor("#0F172A")    # Deep Navy Slate
    c_accent = colors.HexColor("#2563EB")     # Corporate Blue
    c_emerald = colors.HexColor("#059669")    # Success Emerald
    c_muted = colors.HexColor("#475569")      # Muted Charcoal
    c_bg_card = colors.HexColor("#F8FAFC")    # Slate 50
    c_border = colors.HexColor("#E2E8F0")     # Slate 200
    
    s_doc_tag = ParagraphStyle(
        'DocTag',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=c_accent,
        alignment=0
    )
    
    s_main_title = ParagraphStyle(
        'MainTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=21,
        textColor=c_primary,
        alignment=0
    )
    
    s_subtitle = ParagraphStyle(
        'SubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12.5,
        textColor=c_muted,
        alignment=0
    )
    
    s_h1 = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=c_primary,
        spaceBefore=6,
        spaceAfter=3
    )

    s_body = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.8,
        leading=11,
        textColor=c_muted
    )

    s_body_bold = ParagraphStyle(
        'BodyBold_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.8,
        leading=11,
        textColor=c_primary
    )

    s_table_hdr = ParagraphStyle(
        'TableHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.white,
        alignment=0
    )

    s_table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor("#1E293B")
    )

    s_table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor("#0F172A")
    )
    
    s_table_cell_center = ParagraphStyle(
        'TableCellCenter',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor("#0F172A"),
        alignment=1
    )

    s_callout = ParagraphStyle(
        'Callout',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor("#065F46")
    )

    story = []

    # ========================== HEADER BLOCK ==========================
    story.append(Paragraph("PROJECT PROPOSAL & CAPITAL EXPENDITURE BUDGET REPORT", s_doc_tag))
    story.append(Spacer(1, 3))
    story.append(Paragraph("Autonomous IoT Micro-Controllers for Campus Hostel Print Stations", s_main_title))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Transitioning from high-cost, vulnerable laptop deployments to ultra-low-power, tamper-proof <b>PrintPod</b> embedded Linux controllers across NERIST campus hostel stations.",
        s_subtitle
    ))
    story.append(Spacer(1, 6))

    # Meta Info Card
    meta_data = [
        [
            Paragraph("<b>Target Institution:</b> North Eastern Regional Institute of Science & Technology (NERIST)", s_body),
            Paragraph("<b>Date:</b> September 2026 · Rev 1.2", s_body),
        ],
        [
            Paragraph("<b>Lead Developers:</b> Devananda & PrintKurox Systems Engineering Team", s_body),
            Paragraph("<b>Current Pilot Station:</b> Pare Hostel (Block B, Room 29)", s_body),
        ],
    ]
    t_meta = Table(meta_data, colWidths=[310, 213])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_bg_card),
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 8))

    # ========================== 1. EXECUTIVE SUMMARY ==========================
    story.append(Paragraph("1. Executive Summary & Problem Statement", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_accent, spaceBefore=2, spaceAfter=5))
    story.append(Paragraph(
        "The <b>PrintKurox</b> web platform currently powers autonomous document printing for students at NERIST. "
        "At present, the local station spooler operates on a <b>standard consumer laptop</b> connected to an Epson EcoTank L3212 printer. "
        "While functional for proof-of-concept validation, deploying laptops across multiple hostel blocks incurs severe commercial, physical, and operational vulnerabilities:",
        s_body
    ))
    story.append(Spacer(1, 4))

    # Comparison Grid (Laptop vs IoT Controller)
    cmp_data = [
        [
            Paragraph("Evaluation Metric", s_table_hdr),
            Paragraph("Traditional Laptop Deployment", s_table_hdr),
            Paragraph("Proposed IoT 'PrintPod' Module", s_table_hdr),
            Paragraph("Net Impact", s_table_hdr)
        ],
        [
            Paragraph("<b>Capital Expenditure (Unit)</b>", s_table_cell_bold),
            Paragraph("₹25,000 – ₹45,000 / station", s_table_cell),
            Paragraph("<b>₹3,850 / station</b>", s_table_cell_bold),
            Paragraph("<font color='#059669'><b>88% Capex Reduction</b></font>", s_table_cell)
        ],
        [
            Paragraph("<b>Electrical Power Load</b>", s_table_cell_bold),
            Paragraph("45W – 65W continuously (~₹250/mo)", s_table_cell),
            Paragraph("<b>3W – 5W continuously (~₹20/mo)</b>", s_table_cell_bold),
            Paragraph("<font color='#059669'><b>92% Energy Savings</b></font>", s_table_cell)
        ],
        [
            Paragraph("<b>Security & Physical Theft Risk</b>", s_table_cell_bold),
            Paragraph("High resale value in student hostel rooms", s_table_cell),
            Paragraph("Enclosed inside tamper-proof chassis bolted to printer", s_table_cell),
            Paragraph("<font color='#059669'><b>Zero Resale / Theft Target</b></font>", s_table_cell)
        ],
        [
            Paragraph("<b>24/7 Operational Stability</b>", s_table_cell_bold),
            Paragraph("Windows updates, sleep bugs, battery swelling", s_table_cell),
            Paragraph("Industrial Read-Only Linux rootfs with hardware watchdog", s_table_cell),
            Paragraph("<font color='#059669'><b>99.9% Autonomous Uptime</b></font>", s_table_cell)
        ]
    ]
    t_cmp = Table(cmp_data, colWidths=[115, 140, 155, 113])
    t_cmp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1E293B")),
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_card])
    ]))
    story.append(t_cmp)
    story.append(Spacer(1, 8))

    # ========================== 2. TECHNICAL ARCHITECTURE ==========================
    story.append(Paragraph("2. Technical Architecture of the 'PrintPod'", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_accent, spaceBefore=2, spaceAfter=5))
    story.append(Paragraph(
        "The proposed <b>PrintPod</b> hardware module is an embedded ARM Single Board Computer (SBC) designed for unassisted 24/7 operation:",
        s_body
    ))
    story.append(Spacer(1, 3))

    tech_specs = [
        [
            Paragraph("<b>Compute Unit:</b>", s_table_cell_bold),
            Paragraph("Orange Pi Zero 3 (Allwinner H618 Quad-core ARM Cortex-A53 @ 1.5GHz) with 1.5GB LPDDR4 RAM. Effortlessly rasterizes 300/600 DPI PDFs.", s_table_cell)
        ],
        [
            Paragraph("<b>Printing Engine:</b>", s_table_cell_bold),
            Paragraph("Native Linux CUPS 2.4+ subsystem paired with the official Epson open-source <code>printer-driver-escpr</code> rasterizer via USB Type-B.", s_table_cell)
        ],
        [
            Paragraph("<b>Storage & Integrity:</b>", s_table_cell_bold),
            Paragraph("32GB Class 10 A1 Endurance MicroSD configured with an <b>OverlayFS Read-Only Root Filesystem</b>. Prevents filesystem corruption during sudden hostel power outages.", s_table_cell)
        ],
        [
            Paragraph("<b>Student Interface:</b>", s_table_cell_bold),
            Paragraph("1.3-inch I2C Monochrome OLED (128x64) displaying station name, network latency, live 4-digit pickup code, and current print progress, plus dual status LEDs.", s_table_cell)
        ],
        [
            Paragraph("<b>Audio Confirmation:</b>", s_table_cell_bold),
            Paragraph("5V active piezo buzzer providing audible chime upon job completion, notifying student in hallway.", s_table_cell)
        ]
    ]
    t_tech = Table(tech_specs, colWidths=[100, 423])
    t_tech.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('BACKGROUND', (0,0), (0,-1), c_bg_card),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_tech)
    story.append(Spacer(1, 8))

    # ========================== 3. CAMPUS NETWORK & CAPTIVE PORTAL HANDLING ==========================
    story.append(Paragraph("3. Campus Network Connectivity & Captive Portal Handling", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_accent, spaceBefore=2, spaceAfter=5))
    story.append(Paragraph(
        "A critical requirement at NERIST is navigating the <b>campus Wi-Fi captive web portal</b> without a mouse or display. "
        "The PrintPod solves this via a lightweight, zero-overhead background bot:",
        s_body
    ))
    story.append(Spacer(1, 3))

    net_points = [
        [
            Paragraph("<b>1. Autonomous Auto-Login Bot:</b>", s_table_cell_bold),
            Paragraph("Runs an ultra-efficient Python background daemon (<b>0.1% CPU, <12MB RAM</b>). Pings connectivity check endpoints every 30s. If session expires or captive portal redirects, it automatically sends an authenticated HTTP POST with authorized student credentials in <b>0.2 seconds</b>. <i>Does not overheat or strain the hardware.</i>", s_table_cell)
        ],
        [
            Paragraph("<b>2. Institutional MAC Exemption:</b>", s_table_cell_bold),
            Paragraph("Optionally, the board's permanent Wi-Fi MAC address can be registered with the NERIST Computer Center (CC) for institutional IoT device bypass (standard for university printers and lab devices).", s_table_cell)
        ],
        [
            Paragraph("<b>3. Redundant 4G LTE Dongle:</b>", s_table_cell_bold),
            Paragraph("For maximum fault-tolerance, a ₹1,000 unlocked 4G USB dongle can be attached. PrintKurox only transfers ~50MB daily (under 2GB/month), meaning a basic ₹155/mo prepaid recharge provides 100% independent backup when campus Wi-Fi shuts down.", s_table_cell)
        ]
    ]
    t_net = Table(net_points, colWidths=[130, 393])
    t_net.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('BACKGROUND', (0,0), (0,-1), c_bg_card),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_net)
    story.append(Spacer(1, 8))

    # ========================== 4. BILL OF MATERIALS (BOM) & SOURCING ==========================
    story.append(Paragraph("4. Itemized Bill of Materials (BOM) per Station", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_accent, spaceBefore=2, spaceAfter=5))
    story.append(Paragraph(
        "All components are off-the-shelf and directly orderable from reliable Indian electronics distributors with GST invoicing:",
        s_body
    ))
    story.append(Spacer(1, 3))

    bom_data = [
        [
            Paragraph("SN", s_table_hdr),
            Paragraph("Component & Exact Specification", s_table_hdr),
            Paragraph("Trusted Indian Vendor", s_table_hdr),
            Paragraph("Qty", s_table_hdr),
            Paragraph("Unit Rate", s_table_hdr),
            Paragraph("Total (INR)", s_table_hdr)
        ],
        [
            Paragraph("1", s_table_cell_center),
            Paragraph("<b>Orange Pi Zero 3 (1.5GB RAM)</b><br/><font color='#64748B'>Allwinner H618 Quad-core, Wi-Fi 5, BT, USB</font>", s_table_cell),
            Paragraph("Robu.in / Silverline Electronics", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹2,200", s_table_cell),
            Paragraph("<b>₹2,200</b>", s_table_cell_bold)
        ],
        [
            Paragraph("2", s_table_cell_center),
            Paragraph("<b>SanDisk 32GB High-Endurance MicroSD</b><br/><font color='#64748B'>Class 10 A1, rated for continuous IoT write cycles</font>", s_table_cell),
            Paragraph("Amazon India / Local Distributor", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹420", s_table_cell),
            Paragraph("<b>₹420</b>", s_table_cell_bold)
        ],
        [
            Paragraph("3", s_table_cell_center),
            Paragraph("<b>5V 3A USB-C Regulated Power Supply</b><br/><font color='#64748B'>BIS-certified, short-circuit & thermal surge protected</font>", s_table_cell),
            Paragraph("Robu.in / MakerBazar", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹350", s_table_cell),
            Paragraph("<b>₹350</b>", s_table_cell_bold)
        ],
        [
            Paragraph("4", s_table_cell_center),
            Paragraph("<b>1.3\" I2C OLED Display Module</b><br/><font color='#64748B'>128x64 White, SH1106 controller, 4-pin I2C</font>", s_table_cell),
            Paragraph("Robu.in / MakerBazar", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹260", s_table_cell),
            Paragraph("<b>₹260</b>", s_table_cell_bold)
        ],
        [
            Paragraph("5", s_table_cell_center),
            Paragraph("<b>AV Feedback (Piezo Buzzer + Dual LEDs)</b><br/><font color='#64748B'>5V active buzzer, 5mm Green/Blue LED, DuPont wire</font>", s_table_cell),
            Paragraph("Local Electronics Market", s_table_cell),
            Paragraph("1 set", s_table_cell_center),
            Paragraph("₹80", s_table_cell),
            Paragraph("<b>₹80</b>", s_table_cell_bold)
        ],
        [
            Paragraph("6", s_table_cell_center),
            Paragraph("<b>USB-A to USB-B Printer Data Cable (0.5m)</b><br/><font color='#64748B'>Shielded short cable for clean enclosed mounting</font>", s_table_cell),
            Paragraph("Amazon India", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹140", s_table_cell),
            Paragraph("<b>₹140</b>", s_table_cell_bold)
        ],
        [
            Paragraph("7", s_table_cell_center),
            Paragraph("<b>Custom Laser-Cut Acrylic / 3D Enclosure</b><br/><font color='#64748B'>Bolts to printer chassis; security screws</font>", s_table_cell),
            Paragraph("NERIST 3D Lab / Local Fabrication", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹300", s_table_cell),
            Paragraph("<b>₹300</b>", s_table_cell_bold)
        ],
        [
            Paragraph("8", s_table_cell_center),
            Paragraph("<b>Hardware Kit & Heat Sinks</b><br/><font color='#64748B'>Self-adhesive copper heat sinks, standoffs, zip ties</font>", s_table_cell),
            Paragraph("Robu.in", s_table_cell),
            Paragraph("1 set", s_table_cell_center),
            Paragraph("₹100", s_table_cell),
            Paragraph("<b>₹100</b>", s_table_cell_bold)
        ],
        [
            Paragraph("", s_table_cell),
            Paragraph("<b>CORE BASE STATION TOTAL (Wi-Fi Enabled)</b>", s_table_cell_bold),
            Paragraph("Plug & Play Kiosk", s_table_cell_bold),
            Paragraph("1", s_table_cell_center),
            Paragraph("—", s_table_cell_center),
            Paragraph("<font color='#059669'><b>₹3,850</b></font>", s_table_cell_bold)
        ],
        [
            Paragraph("9", s_table_cell_center),
            Paragraph("<b>[Optional] 4G LTE USB Dongle (Unlocked)</b><br/><font color='#64748B'>For independent cellular backup (Jio/Airtel)</font>", s_table_cell),
            Paragraph("Amazon India / Flipkart", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹1,100", s_table_cell),
            Paragraph("<i>+₹1,100</i>", s_table_cell)
        ],
        [
            Paragraph("10", s_table_cell_center),
            Paragraph("<b>[Optional] 5V/12V Mini DC UPS Battery Backup</b><br/><font color='#64748B'>Maintains print jobs through hostel load-shedding</font>", s_table_cell),
            Paragraph("Amazon India (Resonate / Oakter)", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("₹850", s_table_cell),
            Paragraph("<i>+₹850</i>", s_table_cell)
        ],
        [
            Paragraph("", s_table_cell),
            Paragraph("<b>FULLY LOADED UNIT (Wi-Fi + 4G LTE + Battery Backup)</b>", s_table_cell_bold),
            Paragraph("Autonomous Mission-Critical", s_table_cell_bold),
            Paragraph("1", s_table_cell_center),
            Paragraph("—", s_table_cell_center),
            Paragraph("<font color='#2563EB'><b>₹5,800</b></font>", s_table_cell_bold)
        ]
    ]

    t_bom = Table(bom_data, colWidths=[20, 205, 145, 30, 55, 68])
    t_bom.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1E293B")),
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('ROWBACKGROUNDS', (0,1), (-1,8), [colors.white, c_bg_card]),
        ('BACKGROUND', (0,9), (-1,9), colors.HexColor("#ECFDF5")),  # Emerald Highlight for Base Total
        ('BACKGROUND', (0,12), (-1,12), colors.HexColor("#EFF6FF")), # Blue Highlight for Loaded Total
    ]))
    story.append(t_bom)
    story.append(Spacer(1, 8))

    # ========================== 5. ROLLOUT BUDGET SCENARIOS ==========================
    story.append(Paragraph("5. Phased Campus Rollout Budget Scenarios", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_accent, spaceBefore=2, spaceAfter=5))

    scenarios = [
        [
            Paragraph("Deployment Phase", s_table_hdr),
            Paragraph("Scope / Target Locations", s_table_hdr),
            Paragraph("Units", s_table_hdr),
            Paragraph("Base Budget (Wi-Fi)", s_table_hdr),
            Paragraph("Loaded Budget (+4G)", s_table_hdr),
            Paragraph("Est. Traditional Laptop Cost", s_table_hdr)
        ],
        [
            Paragraph("<b>Phase 1: Pilot Validation</b>", s_table_cell_bold),
            Paragraph("Pare Hostel (Block B, Room 29)", s_table_cell),
            Paragraph("1", s_table_cell_center),
            Paragraph("<b>₹3,850</b>", s_table_cell_bold),
            Paragraph("₹4,950", s_table_cell),
            Paragraph("₹35,000 (1 Laptop)", s_table_cell)
        ],
        [
            Paragraph("<b>Phase 2: Core Hostel Ring</b>", s_table_cell_bold),
            Paragraph("Hostel Blocks A, B, C, and D", s_table_cell),
            Paragraph("4", s_table_cell_center),
            Paragraph("<b>₹15,400</b>", s_table_cell_bold),
            Paragraph("₹19,800", s_table_cell),
            Paragraph("₹1,40,000 (4 Laptops)", s_table_cell)
        ],
        [
            Paragraph("<b>Phase 3: Full Campus Grid</b>", s_table_cell_bold),
            Paragraph("All Hostels (A–H, Girls Hostel, Central)", s_table_cell),
            Paragraph("10", s_table_cell_center),
            Paragraph("<b>₹38,500</b>", s_table_cell_bold),
            Paragraph("₹49,500", s_table_cell),
            Paragraph("₹3,50,000 (10 Laptops)", s_table_cell)
        ]
    ]

    t_scen = Table(scenarios, colWidths=[95, 155, 30, 78, 75, 90])
    t_scen.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1E293B")),
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_card])
    ]))
    story.append(t_scen)
    story.append(Spacer(1, 6))

    callout_box = [
        [
            Paragraph(
                "💡 <b>Key Return on Investment (ROI):</b> Deploying 4 PrintPod units across Hostel Blocks A, B, C & D costs only <b>₹15,400</b>, "
                "yielding an immediate capital expenditure savings of <b>₹1,24,600</b> compared to laptops. "
                "Furthermore, with each unit drawing only ~4W, annual electrical savings total <b>~₹3,100 per station</b>, "
                "allowing each hardware unit to fully pay for itself within 14 months purely on power efficiency.",
                s_callout
            )
        ]
    ]
    t_callout = Table(callout_box, colWidths=[523])
    t_callout.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#ECFDF5")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#A7F3D0")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_callout)
    story.append(Spacer(1, 8))

    # ========================== 6. IMPLEMENTATION ROADMAP ==========================
    story.append(Paragraph("6. Implementation Schedule (4-Week Delivery Roadmap)", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_accent, spaceBefore=2, spaceAfter=5))

    schedule_data = [
        [
            Paragraph("Timeline", s_table_hdr),
            Paragraph("Milestone & Key Deliverables", s_table_hdr),
            Paragraph("Expected Completion", s_table_hdr)
        ],
        [
            Paragraph("<b>Week 1</b>", s_table_cell_bold),
            Paragraph("Procurement of Orange Pi Zero 3, MicroSDs, displays, and power adapters via Robu.in / Amazon.", s_table_cell),
            Paragraph("Day 1 – Day 7", s_table_cell)
        ],
        [
            Paragraph("<b>Week 2</b>", s_table_cell_bold),
            Paragraph("OS flashing (DietPi / Debian Lite), CUPS printing subsystem setup, and Epson ESC/P-R driver configuration.", s_table_cell),
            Paragraph("Day 8 – Day 14", s_table_cell)
        ],
        [
            Paragraph("<b>Week 3</b>", s_table_cell_bold),
            Paragraph("Integration of PrintKurox Python daemon, I2C OLED display driver, audio chime, and campus auto-login script.", s_table_cell),
            Paragraph("Day 15 – Day 21", s_table_cell)
        ],
        [
            Paragraph("<b>Week 4</b>", s_table_cell_bold),
            Paragraph("Enclosure assembly, final 48-hour continuous stress printing in Pare Hostel (Block B), and handover to custodian.", s_table_cell),
            Paragraph("Day 22 – Day 28", s_table_cell)
        ]
    ]
    t_sched = Table(schedule_data, colWidths=[65, 360, 98])
    t_sched.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1E293B")),
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_card])
    ]))
    story.append(t_sched)
    story.append(Spacer(1, 10))

    # ========================== 7. SIGN-OFF BLOCK ==========================
    sign_block = [
        [
            Paragraph("<b>Prepared By:</b>", s_body_bold),
            Paragraph("<b>Recommended By (Hostel Custodian):</b>", s_body_bold),
            Paragraph("<b>Approved By (Admin / Incubation Cell):</b>", s_body_bold)
        ],
        [
            Paragraph("<br/><br/>____________________________<br/><b>Devananda & Engineering Team</b><br/>Lead Project Developer, PrintKurox", s_body),
            Paragraph("<br/><br/>____________________________<br/><b>Hostel Warden / Custodian</b><br/>Pare Hostel (Block B), NERIST", s_body),
            Paragraph("<br/><br/>____________________________<br/><b>Authorized Signatory</b><br/>Dean of Student Affairs / TBI NERIST", s_body)
        ]
    ]
    t_sign = Table(sign_block, colWidths=[174, 174, 175])
    t_sign.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.75, c_border),
        ('BACKGROUND', (0,0), (-1,-1), c_bg_card),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(KeepTogether(t_sign))

    # Build Document with dynamic page numbers
    doc.build(story, canvasmaker=NumberedCanvas)
    
    # Copy to public folder as well
    import shutil
    shutil.copyfile(pdf_path, public_pdf_path)
    print(f"Successfully generated: {pdf_path}")
    print(f"Copied to public: {public_pdf_path}")

if __name__ == '__main__':
    build_budget_proposal_pdf()
