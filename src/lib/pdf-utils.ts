import { PDFDocument } from 'pdf-lib';

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
 * Counts the pages in an ArrayBuffer or Uint8Array of a PDF file using pdf-lib
 */
export async function getPdfPageCount(buffer: ArrayBuffer | Uint8Array): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch (err) {
    console.error('Error counting PDF pages:', err);
    throw new Error('Failed to parse PDF document.');
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
    } else if (['jpg', 'jpeg', 'png'].includes(ext) || item.mimeType.startsWith('image/')) {
      let image;
      if (ext === 'png' || item.mimeType.includes('png')) {
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
    }
  }

  const mergedBytes = await mergedPdf.save();
  return {
    mergedBuffer: Buffer.from(mergedBytes),
    totalPages: mergedPdf.getPageCount(),
  };
}

