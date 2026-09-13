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
    # Open: FileName, ConfirmConversions=$false, ReadOnly=$true, AddToRecentFiles=$false
    $doc = $word.Documents.Open('${cleanDocx.replace(/'/g, "''")}', $false, $true, $false)
    # 17 = wdFormatPDF
    $doc.SaveAs([ref]'${cleanPdf.replace(/'/g, "''")}', [ref]17)
    Write-Output "SUCCESS"
} catch {
    Write-Output ("FAIL: " + $_.Exception.Message)
} finally {
    if ($doc) {
        try { $doc.Close([ref]0) } catch {}
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

    const res = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { timeout: 25000 }).toString();
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
  for (const rawPara of paragraphs) {
    const para = safeEncode(rawPara, font);
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
