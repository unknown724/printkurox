import { PDFDocument, PDFPage, PDFImage, degrees, rgb, StandardFonts } from 'pdf-lib';
import { convertDocxToPdf } from './docx-converter';
import { LayoutMode, TextOverlayConfig, getTextOverlayItems } from '@/components/studio/PhotoLayoutSelector';
import { PageConfig } from './pricing';

/**
 * Parses custom page range string like "1-3, 5, 8-10"
 * Returns list of 1-indexed page numbers, sorted and deduplicated within total document pages.
 */
export function parsePageRange(rangeStr: string, maxPages: number): number[] {
  if (!rangeStr || rangeStr.trim().toLowerCase() === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }

  const pagesSet = new Set<number>();
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const sides = trimmed.split('-');
      const start = parseInt(sides[0], 10);
      const end = parseInt(sides[1], 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(maxPages, Math.max(start, end));
        for (let i = min; i <= max; i++) pagesSet.add(i);
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        pagesSet.add(page);
      }
    }
  }

  return Array.from(pagesSet).sort((a, b) => a - b);
}

/**
 * Formats an array of page numbers into a condensed range string like "1-3, 5, 8-10"
 */
export function formatPageRange(pages: number[]): string {
  if (!pages || pages.length === 0) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

export const pagesToRangeString = formatPageRange;

/**
 * Validates and parses user-entered page range with clear error messages
 */
export function validatePageRangeInput(input: string, maxPages: number): {
  isValid: boolean;
  pages: number[];
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { isValid: false, pages: [], error: 'Please specify pages to print' };
  }
  if (trimmed.toLowerCase() === 'all') {
    return { isValid: true, pages: Array.from({ length: maxPages }, (_, i) => i + 1) };
  }

  const parts = trimmed.split(',');
  const pagesSet = new Set<number>();

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes('-')) {
      const sides = p.split('-');
      if (sides.length !== 2) {
        return { isValid: false, pages: [], error: `Invalid range format: "${p}"` };
      }
      const start = parseInt(sides[0].trim(), 10);
      const end = parseInt(sides[1].trim(), 10);
      if (isNaN(start) || isNaN(end)) {
        return { isValid: false, pages: [], error: `Range must contain numbers: "${p}"` };
      }
      if (start < 1 || end < 1) {
        return { isValid: false, pages: [], error: `Page numbers must be 1 or greater` };
      }
      if (start > maxPages || end > maxPages) {
        return { isValid: false, pages: [], error: `Page number exceeds maximum (${maxPages})` };
      }
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let i = min; i <= max; i++) pagesSet.add(i);
    } else {
      const page = parseInt(p, 10);
      if (isNaN(page)) {
        return { isValid: false, pages: [], error: `"${p}" is not a valid page number` };
      }
      if (page < 1) {
        return { isValid: false, pages: [], error: `Page numbers must be 1 or greater` };
      }
      if (page > maxPages) {
        return { isValid: false, pages: [], error: `Page ${page} exceeds maximum (${maxPages})` };
      }
      pagesSet.add(page);
    }
  }

  if (pagesSet.size === 0) {
    return { isValid: false, pages: [], error: 'No valid pages specified' };
  }

  return { isValid: true, pages: Array.from(pagesSet).sort((a, b) => a - b) };
}

/**
 * Checks whether a given page index (1-based) is included in user's page configuration
 */
export function isPageIncluded(pageNumber: number, configs?: PageConfig[]): boolean {
  if (!configs || configs.length === 0) return true;
  const cfg = configs.find((c) => c.pageNumber === pageNumber);
  return cfg !== undefined ? cfg.included : true;
}

export async function getPdfPageCount(buffer: ArrayBuffer | Uint8Array): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch (err: unknown) {
    console.error('Error counting PDF pages:', err);
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('encrypt') || msg.includes('password')) {
      throw new Error('This PDF is password-protected. Please unlock or remove the password before printing.');
    }
    throw new Error('Failed to parse PDF document. The file may be corrupt.');
  }
}

/**
 * Merges multiple PDF and image buffers into a single A4 PDF document
 */
export interface PrintLayoutOptions {
  layoutMode?: LayoutMode;
  customCols?: number;
  customRows?: number;
  fitMode?: 'fit' | 'fill' | 'actual' | 'custom'; // 'fill' = Fit picture to frame (Windows legacy style)
  customScale?: number;     // e.g. 100 = 100%
  pageConfigs?: PageConfig[]; // Optional per-page configurations (customScale, etc.)
  drawBorder?: boolean;     // Cutting guide / page border
  orientation?: 'portrait' | 'landscape' | 'auto';
  autoRotate?: boolean;
  pageOrder?: 'horizontal' | 'vertical';
  textOverlay?: TextOverlayConfig;
}

/**
 * Merges multiple PDF and image buffers into an A4 PDF document with layout options.
 */
export async function mergeFilesToPdf(
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>,
  options: PrintLayoutOptions = {}
): Promise<{ mergedBuffer: Buffer; totalPages: number }> {
  const {
    layoutMode = '1-up',
    customCols = 2,
    customRows = 2,
    fitMode = 'fit',
    customScale = 100,
    drawBorder = false,
    orientation = 'auto',
    autoRotate = true,
    pageOrder = 'horizontal',
  } = options;

  const mergedPdf = await PDFDocument.create();

  // Standard A4 dimensions in points (72 points/inch): 595.28 x 841.89
  const A4_PORTRAIT_W = 595.28;
  const A4_PORTRAIT_H = 841.89;

  // Collect all embeddable items (converted PDF pages or embedded images)
  type PrintableItem = 
    | { type: 'pdfPage'; page: PDFPage }
    | { type: 'image'; image: PDFImage; width: number; height: number; name: string };

  const printableItems: PrintableItem[] = [];

  for (const item of files) {
    const ext = item.fileName.toLowerCase().split('.').pop() || '';

    if (ext === 'pdf' || item.mimeType === 'application/pdf') {
      const srcPdf = await PDFDocument.load(item.buffer, { ignoreEncryption: true });
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach((page) => printableItems.push({ type: 'pdfPage', page }));
    } else if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext) || item.mimeType.startsWith('image/')) {
      try {
        const isPng =
          item.buffer.length >= 4 &&
          item.buffer[0] === 0x89 &&
          item.buffer[1] === 0x50 &&
          item.buffer[2] === 0x4e &&
          item.buffer[3] === 0x47;

        const image = isPng ? await mergedPdf.embedPng(item.buffer) : await mergedPdf.embedJpg(item.buffer);
        printableItems.push({
          type: 'image',
          image,
          width: image.width,
          height: image.height,
          name: item.fileName,
        });
      } catch (imgErr) {
        console.warn(`Failed to embed image ${item.fileName}:`, imgErr);
      }
    } else if (ext === 'docx' || ext === 'doc' || item.mimeType.includes('word') || item.mimeType.includes('officedocument')) {
      try {
        const { pdfBuffer } = await convertDocxToPdf(item.buffer);
        const docxPdf = await PDFDocument.load(pdfBuffer);
        const copiedPages = await mergedPdf.copyPages(docxPdf, docxPdf.getPageIndices());
        copiedPages.forEach((page) => printableItems.push({ type: 'pdfPage', page }));
      } catch (docxErr) {
        console.warn(`Failed to convert docx ${item.fileName}:`, docxErr);
      }
    }
  }

  if (printableItems.length === 0) {
    throw new Error('No valid printable pages or images could be extracted.');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LAYOUT COMPOSER
  // ───────────────────────────────────────────────────────────────────────────

  const customScaleMultiplier = (fitMode === 'custom' && customScale) ? (customScale / 100) : 1;

  // Helper to draw an image into a specific bounding box on a page
  const drawImageInBox = (
    page: PDFPage,
    img: PDFImage,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number,
    isFill: boolean,
    showBorder: boolean,
    rotationDeg: number = 0,
    pageScaleMultiplier?: number
  ) => {
    let w = img.width;
    let h = img.height;

    // Check if slot aspect ratio mismatches image aspect ratio and autoRotate is desired
    // NOTE: Auto-rotate 90 deg is only for multi-page layouts (N-up); in 1-up mode portrait images
    // on landscape sheets remain upright centered with margins, matching Adobe Acrobat.
    const isMultiple = layoutMode !== '1-up';
    const isSlotLandscape = boxW > boxH;
    const isImgLandscape = w > h;
    let rotate = rotationDeg;
    if (rotate === 0 && autoRotate && isMultiple && isSlotLandscape !== isImgLandscape) {
      rotate = 90;
    }

    if (rotate % 180 === 90) {
      const temp = w;
      w = h;
      h = temp;
    }

    const effectiveScale = pageScaleMultiplier !== undefined ? pageScaleMultiplier : customScaleMultiplier;

    let scale = 1;
    if (fitMode === 'actual') {
      scale = 1;
    } else if (fitMode === 'custom' || effectiveScale !== 1) {
      scale = Math.min(boxW / w, boxH / h) * effectiveScale;
    } else if (isFill) {
      // Covers the box completely while preserving natural aspect ratio
      scale = Math.max(boxW / w, boxH / h);
    } else {
      // Preserves entire photo within box with margins
      scale = Math.min(boxW / w, boxH / h);
    }

    const drawW = w * scale;
    const drawH = h * scale;
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    if (rotate === 90) {
      page.drawImage(img, {
        x: drawX + drawW,
        y: drawY,
        width: img.width * scale,
        height: img.height * scale,
        rotate: degrees(90),
      });
    } else if (rotate === 180) {
      page.drawImage(img, {
        x: drawX + drawW,
        y: drawY + drawH,
        width: img.width * scale,
        height: img.height * scale,
        rotate: degrees(180),
      });
    } else if (rotate === 270) {
      page.drawImage(img, {
        x: drawX,
        y: drawY + drawH,
        width: img.width * scale,
        height: img.height * scale,
        rotate: degrees(270),
      });
    } else {
      page.drawImage(img, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });
    }

    if (showBorder) {
      // Faint dotted cutting guide for scissors (Adobe style)
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        borderWidth: 0.75,
        borderColor: rgb(0.7, 0.7, 0.7),
      });
    }
  };

  // Case 1: ID Card 2-in-1 Mode (Front & Back merged on 1 A4 sheet)
  if (layoutMode === 'id-card') {
    // Standard cyber cafe ID card print dimension: ~320pt x 205pt (clear, readable, wallet fit)
    const CARD_W = 320;
    const CARD_H = 205;

    for (let i = 0; i < printableItems.length; i += 2) {
      const page = mergedPdf.addPage([A4_PORTRAIT_W, A4_PORTRAIT_H]);
      const item1 = printableItems[i];
      const item2 = i + 1 < printableItems.length ? printableItems[i + 1] : null;

      // Card 1 (Front Side) - Top half of A4
      const card1X = (A4_PORTRAIT_W - CARD_W) / 2;
      const card1Y = A4_PORTRAIT_H * 0.54;

      if (item1.type === 'image') {
        drawImageInBox(page, item1.image, card1X, card1Y, CARD_W, CARD_H, fitMode === 'fill', drawBorder);
      }

      // Card 2 (Back Side) - Bottom half of A4
      if (item2) {
        const card2X = (A4_PORTRAIT_W - CARD_W) / 2;
        const card2Y = A4_PORTRAIT_H * 0.18;

        if (item2.type === 'image') {
          drawImageInBox(page, item2.image, card2X, card2Y, CARD_W, CARD_H, fitMode === 'fill', drawBorder);
        }
      }
    }
  } 
  // Case 2: 2 Pages Per Sheet (2-Up / Booklet Folded Spread / 2-in-1 Full Sheet)
  else if (layoutMode === '2-up' || layoutMode === 'booklet') {
    // For booklet mode, sheet is strictly landscape (2 portrait pages side-by-side)
    // For 2-up with autoRotate:
    // If orientation === 'portrait', 2 upright portrait photos sit side-by-side on a Landscape sheet
    // If orientation === 'landscape', 2 landscape photos sit stacked on a Portrait sheet
    const isLandscapeSheet = layoutMode === 'booklet' ? true : autoRotate ? orientation === 'portrait' : orientation === 'landscape';
    const sheetW = isLandscapeSheet ? A4_PORTRAIT_H : A4_PORTRAIT_W;
    const sheetH = isLandscapeSheet ? A4_PORTRAIT_W : A4_PORTRAIT_H;
    const margin = 20;

    for (let i = 0; i < printableItems.length; i += 2) {
      const page = mergedPdf.addPage([sheetW, sheetH]);
      const item1 = printableItems[i];
      const item2 = i + 1 < printableItems.length ? printableItems[i + 1] : null;

      const pageCfg1 = options.pageConfigs?.find((p) => p.pageNumber === i + 1);
      const pageCfg2 = options.pageConfigs?.find((p) => p.pageNumber === i + 2);
      const scale1 = pageCfg1?.customScale !== undefined ? pageCfg1.customScale / 100 : customScaleMultiplier;
      const scale2 = pageCfg2?.customScale !== undefined ? pageCfg2.customScale / 100 : customScaleMultiplier;
      const rot1 = (pageCfg1?.rotation || (pageCfg1?.orientation === 'landscape' ? 90 : 0)) % 360;
      const rot2 = (pageCfg2?.rotation || (pageCfg2?.orientation === 'landscape' ? 90 : 0)) % 360;

      if (!isLandscapeSheet) {
        // Portrait sheet: Top and Bottom halves
        const slotW = sheetW - margin * 2;
        const slotH = (sheetH - margin * 3) / 2;

        // Slot 1 (Top half: in PDF coordinates Y=0 is bottom, so top is sheetH/2 + margin/2)
        const slot1X = margin;
        const slot1Y = sheetH / 2 + margin / 2;
        if (item1.type === 'image') {
          drawImageInBox(page, item1.image, slot1X, slot1Y, slotW, slotH, fitMode === 'fill', drawBorder, rot1, scale1);
        }

        // Slot 2 (Bottom half)
        if (item2 && item2.type === 'image') {
          const slot2X = margin;
          const slot2Y = margin;
          drawImageInBox(page, item2.image, slot2X, slot2Y, slotW, slotH, fitMode === 'fill', drawBorder, rot2, scale2);
        }
      } else {
        // Landscape sheet: Left and Right halves (Booklet Fold Spread)
        const halfW = (sheetW - margin * 3) / 2;
        const halfH = sheetH - margin * 2;

        // Slot 1 (Left)
        const slot1X = margin;
        const slot1Y = margin;
        if (item1.type === 'image') {
          drawImageInBox(page, item1.image, slot1X, slot1Y, halfW, halfH, fitMode === 'fill', drawBorder, rot1, scale1);
        }

        // Slot 2 (Right)
        if (item2 && item2.type === 'image') {
          const slot2X = margin * 2 + halfW;
          const slot2Y = margin;
          drawImageInBox(page, item2.image, slot2X, slot2Y, halfW, halfH, fitMode === 'fill', drawBorder, rot2, scale2);
        }
      }
    }
  }
  // Case 3: Multi-up Grids (4-up, 6-up, 8-up, 9-up, 16-up, custom)
  else if (
    layoutMode === '4-up' ||
    layoutMode === '6-up' ||
    layoutMode === '8-up' ||
    layoutMode === '9-up' ||
    layoutMode === '16-up' ||
    layoutMode === 'custom'
  ) {
    let cols = 2;
    let rows = 2;
    if (layoutMode === 'custom') {
      cols = Math.max(1, customCols || 2);
      rows = Math.max(1, customRows || 2);
    } else if (layoutMode === '6-up') {
      cols = 2;
      rows = 3;
    } else if (layoutMode === '8-up') {
      cols = 2;
      rows = 4;
    } else if (layoutMode === '9-up') {
      cols = 3;
      rows = 3;
    } else if (layoutMode === '16-up') {
      cols = 4;
      rows = 4;
    }

    const isLandscapeSheet =
      orientation === 'landscape'
        ? true
        : orientation === 'portrait'
        ? false
        : cols > rows;

    const sheetW = isLandscapeSheet ? A4_PORTRAIT_H : A4_PORTRAIT_W;
    const sheetH = isLandscapeSheet ? A4_PORTRAIT_W : A4_PORTRAIT_H;
    const margin = 14;

    const colW = (sheetW - margin * (cols + 1)) / cols;
    const rowH = (sheetH - margin * (rows + 1)) / rows;
    const slotsPerPage = cols * rows;

    for (let i = 0; i < printableItems.length; i += slotsPerPage) {
      const page = mergedPdf.addPage([sheetW, sheetH]);

      for (let slot = 0; slot < slotsPerPage; slot++) {
        const idx = i + slot;
        if (idx >= printableItems.length) break;
        const item = printableItems[idx];
        if (item.type !== 'image') continue;

        let colIdx: number;
        let rowIdx: number;

        if (pageOrder === 'vertical') {
          // Column-first: col * rows + row
          colIdx = Math.floor(slot / rows);
          rowIdx = slot % rows;
        } else {
          // Row-first: row * cols + col
          rowIdx = Math.floor(slot / cols);
          colIdx = slot % cols;
        }

        const slotX = margin + colIdx * (colW + margin);
        // PDF coordinates: Y=0 is bottom, row 0 is top
        const slotY = sheetH - margin - (rowIdx + 1) * rowH - rowIdx * margin;

        const pageCfg = options.pageConfigs?.find((p) => p.pageNumber === idx + 1);
        const pageScaleMultiplier =
          pageCfg?.customScale !== undefined ? pageCfg.customScale / 100 : customScaleMultiplier;
        const pageRotation = (pageCfg?.rotation || (pageCfg?.orientation === 'landscape' ? 90 : 0)) % 360;

        drawImageInBox(
          page,
          item.image,
          slotX,
          slotY,
          colW,
          rowH,
          fitMode === 'fill',
          drawBorder,
          pageRotation,
          pageScaleMultiplier
        );
      }
    }
  }
  // Case 4: Poster Mode (2x2 Tiled Grid across 4 physical A4 sheets)
  else if (layoutMode === 'poster') {
    const sheetW = A4_PORTRAIT_W;
    const sheetH = A4_PORTRAIT_H;
    const margin = 14;

    const tileLabels = [
      'Sheet 1/4 (Top-Left)',
      'Sheet 2/4 (Top-Right)',
      'Sheet 3/4 (Btm-Left)',
      'Sheet 4/4 (Btm-Right)',
    ];

    for (let itemIdx = 0; itemIdx < printableItems.length; itemIdx++) {
      const item = printableItems[itemIdx];
      const pageCfg = options.pageConfigs?.find((p) => p.pageNumber === itemIdx + 1);
      const pageScaleMultiplier =
        pageCfg?.customScale !== undefined ? pageCfg.customScale / 100 : customScaleMultiplier;

      // 4 Quadrants: [col, row] in 2x2 grid (row 0 = top, row 1 = bottom)
      const tiles = [
        { col: 0, row: 0, label: tileLabels[0] },
        { col: 1, row: 0, label: tileLabels[1] },
        { col: 0, row: 1, label: tileLabels[2] },
        { col: 1, row: 1, label: tileLabels[3] },
      ];

      for (const tile of tiles) {
        const page = mergedPdf.addPage([sheetW, sheetH]);

        if (item.type === 'image') {
          // The combined poster size spanning 2x2 sheets with safe margins
          const posterW = (sheetW - margin * 2) * 2 * pageScaleMultiplier;
          const posterH = (sheetH - margin * 2) * 2 * pageScaleMultiplier;

          // Offset based on tile quadrant
          // In PDF coordinates, Y=0 is bottom:
          // row 0 is top quadrant, so offset image down by (posterH / 2)
          // row 1 is bottom quadrant, so offset image Y starts at bottom margin
          const drawX = tile.col === 0 ? margin : margin - (posterW / 2);
          const drawY = tile.row === 0 ? margin - (posterH / 2) : margin;

          page.drawImage(item.image, {
            x: drawX,
            y: drawY,
            width: posterW,
            height: posterH,
          });

          // Draw subtle tile corner label in printer margin
          page.drawText(tile.label, {
            x: margin,
            y: sheetH - margin + 2,
            size: 7,
            color: rgb(0.4, 0.4, 0.4),
          });
        } else {
          // If PDF page, copy page
          mergedPdf.addPage(item.page);
        }
      }
    }
  }
  // Case 5: 1-Up (Standard / Full Page Photo with Fit-to-Frame)
  else {
    for (let itemIdx = 0; itemIdx < printableItems.length; itemIdx++) {
      const item = printableItems[itemIdx];
      const pageCfg = options.pageConfigs?.find((p) => p.pageNumber === itemIdx + 1);
      const pageScaleMultiplier =
        pageCfg?.customScale !== undefined ? pageCfg.customScale / 100 : customScaleMultiplier;

      if (item.type === 'pdfPage') {
        if (pageScaleMultiplier !== 1) {
          item.page.scale(pageScaleMultiplier, pageScaleMultiplier);
        }
        mergedPdf.addPage(item.page);
      } else {
        const img = item.image;
        let isLandscape = false;
        if (orientation === 'landscape') {
          isLandscape = true;
        } else if (orientation === 'portrait') {
          isLandscape = false;
        } else {
          // Auto-orientation: match photo aspect ratio
          isLandscape = img.width > img.height;
        }

        const pageW = isLandscape ? A4_PORTRAIT_H : A4_PORTRAIT_W;
        const pageH = isLandscape ? A4_PORTRAIT_W : A4_PORTRAIT_H;
        const page = mergedPdf.addPage([pageW, pageH]);

        if (fitMode === 'fill') {
          // Windows "Fit picture to frame" mode:
          // Minimizes borders so the photo doesn't look tiny on A4!
          const margin = 14; // Light 0.2 inch margin so printer doesn't clip
          drawImageInBox(
            page,
            img,
            margin,
            margin,
            pageW - margin * 2,
            pageH - margin * 2,
            true,
            drawBorder,
            pageCfg?.rotation || 0,
            pageScaleMultiplier
          );
        } else {
          // Standard fit mode (20pt margin)
          const margin = 20;
          drawImageInBox(
            page,
            img,
            margin,
            margin,
            pageW - margin * 2,
            pageH - margin * 2,
            false,
            drawBorder,
            pageCfg?.rotation || 0,
            pageScaleMultiplier
          );
        }
      }
    }
  }

  // Canva-Style Multi-Text Overlay Mode
  if (options.textOverlay?.enabled) {
    const overlayItems = getTextOverlayItems(options.textOverlay);
    const pdfPageCount = mergedPdf.getPageCount();

    const hexToRgb = (hex: string) => {
      const cleaned = hex.replace('#', '');
      const num = parseInt(cleaned, 16);
      if (isNaN(num)) return rgb(0, 0, 0);
      return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
    };

    for (const item of overlayItems) {
      if (!item.text || !item.text.trim()) continue;

      let fontName = StandardFonts.HelveticaBold;

      if (item.fontFamily === 'serif') {
        fontName = StandardFonts.TimesRomanBold;
      } else if (item.fontFamily === 'mono') {
        fontName = StandardFonts.CourierBold;
      } else if (item.fontFamily === 'display') {
        fontName = StandardFonts.HelveticaBold;
      } else if (item.fontFamily === 'handwriting') {
        fontName = StandardFonts.TimesRomanBoldItalic;
      } else if (item.fontFamily === 'geometric') {
        fontName = StandardFonts.CourierBold;
      }

      const font = await mergedPdf.embedFont(fontName);
      const textColor = hexToRgb(item.color || '#111827');
      const textLines = item.text.split('\n');

      for (let p = 0; p < pdfPageCount; p++) {
        const isFirst = p === 0;
        const isLast = p === pdfPageCount - 1;
        const shouldApply =
          item.applyTo === 'all_pages' ||
          (item.applyTo === 'first_page' && isFirst) ||
          (item.applyTo === 'last_page' && isLast);

        if (!shouldApply) continue;

        const page = mergedPdf.getPage(p);
        const { width: pWidth, height: pHeight } = page.getSize();

        if (item.position === 'watermark') {
          const wmFontSize =
            item.customFontSize ||
            (item.fontSize === 'xl' ? 52 : item.fontSize === 'lg' ? 42 : item.fontSize === 'md' ? 32 : 24);
          const lineHeight = wmFontSize * 1.25;
          textLines.forEach((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const textWidth = font.widthOfTextAtSize(trimmed, wmFontSize);
            const yOffset = (lIdx - (textLines.length - 1) / 2) * lineHeight;
            page.drawText(trimmed, {
              x: pWidth / 2 - (textWidth / 2) * Math.cos((45 * Math.PI) / 180) + yOffset * Math.sin((45 * Math.PI) / 180),
              y: pHeight / 2 - (textWidth / 2) * Math.sin((45 * Math.PI) / 180) - yOffset * Math.cos((45 * Math.PI) / 180),
              size: wmFontSize,
              font,
              color: textColor,
              opacity: item.opacity ?? 0.18,
              rotate: degrees(45),
            });
          });
        } else if (item.position === 'header') {
          const headerSize =
            item.customFontSize ||
            (item.fontSize === 'xl' ? 16 : item.fontSize === 'lg' ? 13 : item.fontSize === 'md' ? 11 : 9);
          const lineHeight = headerSize * 1.25;
          textLines.forEach((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const textWidth = font.widthOfTextAtSize(trimmed, headerSize);
            page.drawText(trimmed, {
              x: (pWidth - textWidth) / 2,
              y: pHeight - 28 - lIdx * lineHeight,
              size: headerSize,
              font,
              color: textColor,
            });
          });
        } else if (item.position === 'middle') {
          const middleSize =
            item.customFontSize ||
            (item.fontSize === 'xl' ? 32 : item.fontSize === 'lg' ? 24 : item.fontSize === 'md' ? 18 : 14);
          const lineHeight = middleSize * 1.25;
          const totalBlockHeight = textLines.length * lineHeight;
          textLines.forEach((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const textWidth = font.widthOfTextAtSize(trimmed, middleSize);
            page.drawText(trimmed, {
              x: (pWidth - textWidth) / 2,
              y: (pHeight + totalBlockHeight) / 2 - (lIdx + 1) * lineHeight,
              size: middleSize,
              font,
              color: textColor,
            });
          });
        } else if (item.position === 'footer') {
          const footerSize =
            item.customFontSize ||
            (item.fontSize === 'xl' ? 14 : item.fontSize === 'lg' ? 11 : item.fontSize === 'md' ? 10 : 8);
          const lineHeight = footerSize * 1.25;
          textLines.forEach((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const textWidth = font.widthOfTextAtSize(trimmed, footerSize);
            page.drawText(trimmed, {
              x: (pWidth - textWidth) / 2,
              y: 20 + (textLines.length - 1 - lIdx) * lineHeight,
              size: footerSize,
              font,
              color: textColor,
            });
          });
        } else if (item.position === 'custom') {
          const customSize =
            item.customFontSize ||
            (item.fontSize === 'xl' ? 32 : item.fontSize === 'lg' ? 24 : item.fontSize === 'md' ? 18 : 14);
          const lineHeight = customSize * 1.25;
          const totalBlockHeight = textLines.length * lineHeight;
          const centerX = ((item.customX ?? 50) / 100) * pWidth;
          const centerY = pHeight - ((item.customY ?? 50) / 100) * pHeight;
          textLines.forEach((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const textWidth = font.widthOfTextAtSize(trimmed, customSize);
            const posX = Math.max(10, Math.min(pWidth - textWidth - 10, centerX - textWidth / 2));
            const posY = Math.max(10, Math.min(pHeight - customSize - 10, centerY + totalBlockHeight / 2 - (lIdx + 1) * lineHeight));
            page.drawText(trimmed, {
              x: posX,
              y: posY,
              size: customSize,
              font,
              color: textColor,
            });
          });
        } else if (item.position === 'cover_title') {
          const titleSize =
            item.customFontSize ||
            (item.fontSize === 'xl' ? 26 : item.fontSize === 'lg' ? 22 : item.fontSize === 'md' ? 18 : 14);
          const lineHeight = titleSize * 1.25;
          const boxY = pHeight - 75;
          textLines.forEach((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const textWidth = font.widthOfTextAtSize(trimmed, titleSize);
            page.drawText(trimmed, {
              x: (pWidth - textWidth) / 2,
              y: boxY - lIdx * lineHeight,
              size: titleSize,
              font,
              color: textColor,
            });
          });
        }
      }
    }
  }

  const totalPages = mergedPdf.getPageCount();
  if (totalPages === 0) {
    throw new Error('No valid printable pages could be extracted from the uploaded file(s).');
  }

  const mergedBytes = await mergedPdf.save({ useObjectStreams: false });
  return {
    mergedBuffer: Buffer.from(mergedBytes),
    totalPages,
  };
}

