import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import mammoth from 'mammoth';

export interface DocxConversionResult {
  pdfBuffer: Buffer;
  pageCount: number;
}

/**
 * Extracts true page count metadata from a DOCX file's docProps/app.xml
 */
export async function getDocxMetadata(buffer: Buffer): Promise<{ pageCount: number; wordCount: number }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const appXml = await zip.file('docProps/app.xml')?.async('text');

    let pageCount = 0;
    let wordCount = 0;

    if (appXml) {
      const pageMatch = appXml.match(/<Pages>(\d+)<\/Pages>/i);
      if (pageMatch && pageMatch[1]) {
        pageCount = parseInt(pageMatch[1], 10);
      }
      const wordMatch = appXml.match(/<Words>(\d+)<\/Words>/i);
      if (wordMatch && wordMatch[1]) {
        wordCount = parseInt(wordMatch[1], 10);
      }
    }

    return { pageCount, wordCount };
  } catch (err) {
    console.warn('Could not extract docProps metadata from docx:', err);
    return { pageCount: 0, wordCount: 0 };
  }
}

/**
 * Converts a DOCX buffer into a standard printable A4 PDF document
 */
export async function convertDocxToPdf(buffer: Buffer): Promise<DocxConversionResult> {
  const _metadata = await getDocxMetadata(buffer);
  const rawTextResult = await mammoth.extractRawText({ buffer });
  const rawText = rawTextResult.value || '';

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Standard A4 dimensions in points: 595.28 x 841.89
  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN_X = 50;
  const MARGIN_TOP = 50;
  const MARGIN_BOTTOM = 50;
  const USABLE_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

  const FONT_SIZE = 11;
  const LINE_HEIGHT = 16;
  const PARAGRAPH_SPACING = 8;

  // Split lines and handle paragraph wrapping
  const paragraphs = rawText.split(/\r?\n/);
  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let currentY = PAGE_HEIGHT - MARGIN_TOP;

  function addNewPage() {
    currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    currentY = PAGE_HEIGHT - MARGIN_TOP;
  }

  // Wrap text into lines that fit USABLE_WIDTH
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      currentY -= PARAGRAPH_SPACING;
      if (currentY < MARGIN_BOTTOM + LINE_HEIGHT) {
        addNewPage();
      }
      continue;
    }

    // Heuristic: Short lines in ALL CAPS or starting with numbers might be headers
    const isHeading = trimmed.length < 60 && (trimmed === trimmed.toUpperCase() || /^(chapter|section|\d+\.)/i.test(trimmed));
    const activeFont = isHeading ? boldFont : font;
    const activeFontSize = isHeading ? 13 : FONT_SIZE;
    const activeLineHeight = isHeading ? 20 : LINE_HEIGHT;

    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = activeFont.widthOfTextAtSize(testLine, activeFontSize);

      if (testWidth <= USABLE_WIDTH) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          if (currentY - activeLineHeight < MARGIN_BOTTOM) {
            addNewPage();
          }
          currentPage.drawText(currentLine, {
            x: MARGIN_X,
            y: currentY - activeFontSize,
            size: activeFontSize,
            font: activeFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          currentY -= activeLineHeight;
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      if (currentY - activeLineHeight < MARGIN_BOTTOM) {
        addNewPage();
      }
      currentPage.drawText(currentLine, {
        x: MARGIN_X,
        y: currentY - activeFontSize,
        size: activeFontSize,
        font: activeFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      currentY -= activeLineHeight;
    }

    currentY -= 4; // small spacing between paragraphs
  }

  let finalPageCount = pdfDoc.getPageCount();
  if (finalPageCount === 0) {
    // Empty document fallback
    pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    finalPageCount = 1;
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  return {
    pdfBuffer: Buffer.from(pdfBytes),
    pageCount: finalPageCount,
  };
}
