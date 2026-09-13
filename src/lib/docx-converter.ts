import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
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

    if (pageCount === 0 && wordCount > 0) {
      pageCount = Math.max(1, Math.ceil(wordCount / 380));
    }

    return { pageCount, wordCount };
  } catch (err) {
    console.warn('Could not extract docProps metadata from docx:', err);
    return { pageCount: 0, wordCount: 0 };
  }
}

/**
 * Sanitizes characters so pdf-lib StandardFonts.Helvetica (WinAnsi) never crashes
 */
function safeEncode(text: string, font: PDFFont): string {
  const normalized = text
    .replace(/[\u20B9]/g, 'Rs.') // Indian Rupee
    .replace(/[•·]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[→⇒]/g, '->')
    .replace(/[←⇐]/g, '<-')
    .replace(/[≥]/g, '>=')
    .replace(/[≤]/g, '<=')
    .replace(/[≠]/g, '!=')
    .replace(/\t/g, '    ');

  let result = '';
  for (const char of normalized) {
    try {
      font.encodeText(char);
      result += char;
    } catch {
      result += ' ';
    }
  }
  return result;
}

/**
 * High-fidelity native conversion using Microsoft Word on Windows
 * Preserves 100% of formatting, tables, font styles, colors, diagrams, images, and true page breaks.
 */
async function convertWithNativeWord(buffer: Buffer, fileExt: string = 'docx'): Promise<DocxConversionResult | null> {
  // Guard against browser execution or non-Windows environments
  if (typeof window !== 'undefined' || process.platform !== 'win32') return null;

  let fs: typeof import('fs');
  let path: typeof import('path');
  let os: typeof import('os');
  let execSync: typeof import('child_process').execSync;
  let crypto: typeof import('crypto');

  try {
    const req = eval('require');
    fs = req('fs');
    path = req('path');
    os = req('os');
    execSync = req('child_process').execSync;
    crypto = req('crypto');
  } catch {
    return null;
  }

  const id = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  const ext = fileExt.startsWith('.') ? fileExt.substring(1) : fileExt;
  const docxPath = path.join(tmpDir, `kurox_${id}.${ext}`);
  const pdfPath = path.join(tmpDir, `kurox_${id}.pdf`);
  const psPath = path.join(tmpDir, `kurox_${id}.ps1`);

  try {
    fs.writeFileSync(docxPath, buffer);

    const cleanDocx = path.resolve(docxPath);
    const cleanPdf = path.resolve(pdfPath);

    const psScript = `
$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    # Open document read-only
    $doc = $word.Documents.Open([string]'${cleanDocx.replace(/'/g, "''")}')
    # 17 = wdExportFormatPDF
    $doc.ExportAsFixedFormat([string]'${cleanPdf.replace(/'/g, "''")}', 17)
    Write-Output "SUCCESS"
} catch {
    Write-Output ("FAIL: " + $_.Exception.Message)
} finally {
    if ($doc) {
        try { $doc.Close(0) } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    }
    if ($word) {
        try { $word.Quit() } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
`;
    fs.writeFileSync(psPath, psScript, 'utf8');

    const res = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { timeout: 30000 }).toString();
    if (res.includes('SUCCESS') && fs.existsSync(pdfPath)) {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();
      return { pdfBuffer, pageCount };
    }
  } catch (err) {
    console.warn('Native Word COM conversion bypassed or failed:', err);
  } finally {
    try { if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath); } catch {}
    try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch {}
    try { if (fs.existsSync(psPath)) fs.unlinkSync(psPath); } catch {}
  }
  return null;
}

/**
 * Converts a DOCX buffer into a standard printable A4 PDF document
 */
export async function convertDocxToPdf(buffer: Buffer, fileExt: string = 'docx'): Promise<DocxConversionResult> {
  // Step 1: Try native Microsoft Word conversion on Windows (100% authentic layout)
  try {
    const nativeResult = await convertWithNativeWord(buffer, fileExt);
    if (nativeResult && nativeResult.pdfBuffer.length > 0) {
      return nativeResult;
    }
  } catch (nativeErr) {
    console.warn('Native Word conversion error; falling back to JS converter:', nativeErr);
  }

  // Step 2: Fallback in-process JS converter (mammoth + pdf-lib)
  await getDocxMetadata(buffer);

  let html = '';
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    html = htmlResult.value || '';
  } catch {}

  const rawTextResult = await mammoth.extractRawText({ buffer });
  const rawText = rawTextResult.value || '';

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Standard A4 dimensions in points: 595.28 x 841.89
  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN_X = 50;
  const MARGIN_TOP = 50;
  const MARGIN_BOTTOM = 50;
  const USABLE_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let currentY = PAGE_HEIGHT - MARGIN_TOP;

  function addNewPage() {
    currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    currentY = PAGE_HEIGHT - MARGIN_TOP;
  }

  function ensureSpace(neededHeight: number) {
    if (currentY - neededHeight < MARGIN_BOTTOM) {
      addNewPage();
    }
  }

  function drawWrappedText(
    text: string,
    activeFont: PDFFont,
    fontSize: number,
    lineHeight: number,
    indentX: number = 0,
    textColor = rgb(0.1, 0.1, 0.1)
  ) {
    const safeText = safeEncode(text, activeFont).trim();
    if (!safeText) return;

    const words = safeText.split(/\s+/);
    let currentLine = '';
    const availableWidth = USABLE_WIDTH - indentX;

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = activeFont.widthOfTextAtSize(testLine, fontSize);

      if (testWidth <= availableWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          ensureSpace(lineHeight);
          currentPage.drawText(currentLine, {
            x: MARGIN_X + indentX,
            y: currentY - fontSize,
            size: fontSize,
            font: activeFont,
            color: textColor,
          });
          currentY -= lineHeight;
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      ensureSpace(lineHeight);
      currentPage.drawText(currentLine, {
        x: MARGIN_X + indentX,
        y: currentY - fontSize,
        size: fontSize,
        font: activeFont,
        color: textColor,
      });
      currentY -= lineHeight;
    }
  }

  // If mammoth extracted HTML, parse blocks with authentic typography
  if (html && html.includes('<')) {
    const blockRegex = /<(h[1-6]|p|li|tr)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    let hasDrawn = false;

    while ((match = blockRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const innerHtml = match[2];
      const cleanText = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanText) continue;

      hasDrawn = true;
      const isBold = /<(strong|b)[^>]*>/i.test(innerHtml);
      const isItalic = /<(em|i)[^>]*>/i.test(innerHtml);
      const chosenFont = isBold ? boldFont : isItalic ? italicFont : font;

      if (tag === 'h1') {
        currentY -= 8;
        drawWrappedText(cleanText, boldFont, 18, 24, 0, rgb(0.05, 0.05, 0.05));
        currentY -= 6;
      } else if (tag === 'h2') {
        currentY -= 6;
        drawWrappedText(cleanText, boldFont, 15, 20, 0, rgb(0.1, 0.1, 0.1));
        currentY -= 4;
      } else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        currentY -= 4;
        drawWrappedText(cleanText, boldFont, 13, 18, 0, rgb(0.15, 0.15, 0.15));
        currentY -= 3;
      } else if (tag === 'li') {
        drawWrappedText(`•  ${cleanText}`, chosenFont, 11, 16, 14);
        currentY -= 2;
      } else if (tag === 'tr') {
        const cellMatches = innerHtml.match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
        if (cellMatches.length > 0) {
          const cells = cellMatches.map((c) => c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
          const cellWidth = USABLE_WIDTH / Math.max(1, cells.length);
          ensureSpace(20);
          cells.forEach((cellText, cIdx) => {
            const safeCell = safeEncode(cellText, chosenFont);
            const truncated = safeCell.length > 32 ? safeCell.slice(0, 29) + '...' : safeCell;
            currentPage.drawText(truncated, {
              x: MARGIN_X + cIdx * cellWidth + 4,
              y: currentY - 12,
              size: 10,
              font: chosenFont,
              color: rgb(0.1, 0.1, 0.1),
            });
          });
          currentY -= 18;
        }
      } else {
        drawWrappedText(cleanText, chosenFont, 11, 16, 0);
        currentY -= 4;
      }
    }

    if (!hasDrawn) {
      const paragraphs = rawText.split(/\r?\n/);
      for (const p of paragraphs) {
        if (!p.trim()) {
          currentY -= 6;
          continue;
        }
        drawWrappedText(p, font, 11, 16);
        currentY -= 3;
      }
    }
  } else {
    const paragraphs = rawText.split(/\r?\n/);
    for (const p of paragraphs) {
      if (!p.trim()) {
        currentY -= 6;
        continue;
      }
      drawWrappedText(p, font, 11, 16);
      currentY -= 3;
    }
  }

  let finalPageCount = pdfDoc.getPageCount();
  if (finalPageCount === 0) {
    pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    finalPageCount = 1;
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  return {
    pdfBuffer: Buffer.from(pdfBytes),
    pageCount: finalPageCount,
  };
}
