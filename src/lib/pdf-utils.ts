import { PDFDocument } from 'pdf-lib';
import { convertDocxToPdf } from './docx-converter';

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
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);
      if (!isNaN(start) && !isNaN(end)) {
        const from = Math.max(1, Math.min(start, end));
        const to = Math.min(maxPages, Math.max(start, end));
        for (let i = from; i <= to; i++) {
          pagesSet.add(i);
        }
      }
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        pagesSet.add(pageNum);
      }
    }
  }

  const result = Array.from(pagesSet).sort((a, b) => a - b);
  return result.length > 0 ? result : Array.from({ length: maxPages }, (_, i) => i + 1);
}

/**
 * Converts an array of page numbers e.g. [1, 2, 3, 5] to "1-3, 5"
 */
export function pagesToRangeString(pages: number[]): string {
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
        return { isValid: false, pages: [], error: `Invalid numbers in range "${p}"` };
      }
      if (start > maxPages || end > maxPages) {
        return { isValid: false, pages: [], error: `Page number exceeds total pages (${maxPages})` };
      }
      if (start < 1 || end < 1) {
        return { isValid: false, pages: [], error: `Page numbers must be 1 or higher` };
      }
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      for (let i = from; i <= to; i++) pagesSet.add(i);
    } else {
      const pageNum = parseInt(p, 10);
      if (isNaN(pageNum)) {
        return { isValid: false, pages: [], error: `"${p}" is not a valid number` };
      }
      if (pageNum > maxPages) {
        return { isValid: false, pages: [], error: `Page ${pageNum} exceeds total pages (${maxPages})` };
      }
      if (pageNum < 1) {
        return { isValid: false, pages: [], error: `Page numbers must be 1 or higher` };
      }
      pagesSet.add(pageNum);
    }
  }

  const pages = Array.from(pagesSet).sort((a, b) => a - b);
  if (pages.length === 0) {
    return { isValid: false, pages: [], error: 'No valid pages selected' };
  }
  return { isValid: true, pages };
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
export async function mergeFilesToPdf(
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>
): Promise<{ mergedBuffer: Buffer; totalPages: number }> {
  const mergedPdf = await PDFDocument.create();

  // Standard A4 dimensions in points (72 points/inch): 595.28 x 841.89
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  for (const item of files) {
    const ext = item.fileName.toLowerCase().split('.').pop() || '';

    if (ext === 'pdf' || item.mimeType === 'application/pdf') {
      const srcPdf = await PDFDocument.load(item.buffer, { ignoreEncryption: true });
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || item.mimeType.startsWith('image/')) {
      try {
        let image;
        // Check magic bytes: PNG starts with 0x89 0x50 0x4E 0x47 (\x89PNG)
        const isPng =
          item.buffer.length >= 4 &&
          item.buffer[0] === 0x89 &&
          item.buffer[1] === 0x50 &&
          item.buffer[2] === 0x4e &&
          item.buffer[3] === 0x47;

        if (isPng) {
          image = await mergedPdf.embedPng(item.buffer);
        } else {
          image = await mergedPdf.embedJpg(item.buffer);
        }

        // Add page with A4 dimensions
        const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
        const imgDims = image.scaleToFit(A4_WIDTH - 40, A4_HEIGHT - 40); // 20pt margin

        // Center image on page
        const x = (A4_WIDTH - imgDims.width) / 2;
        const y = (A4_HEIGHT - imgDims.height) / 2;

        page.drawImage(image, {
          x,
          y,
          width: imgDims.width,
          height: imgDims.height,
        });
      } catch (imgErr) {
        console.warn(`Failed to embed image ${item.fileName}:`, imgErr);
      }
    } else if (ext === 'docx' || ext === 'doc' || item.mimeType.includes('word') || item.mimeType.includes('officedocument')) {
      try {
        const { pdfBuffer } = await convertDocxToPdf(item.buffer);
        const docxPdf = await PDFDocument.load(pdfBuffer);
        const copiedPages = await mergedPdf.copyPages(docxPdf, docxPdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } catch (docxErr) {
        console.warn(`Failed to convert docx ${item.fileName}:`, docxErr);
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

