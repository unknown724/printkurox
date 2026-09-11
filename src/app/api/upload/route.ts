import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2, getDownloadUrl } from '@/lib/cloudflare-r2';
import { getPdfPageCount, mergeFilesToPdf, PrintLayoutOptions } from '@/lib/pdf-utils';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface UploadedFileItem {
  id: string;
  name: string;
  size: number;
  pages: number;
  type: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;

    const fileList: File[] = files.length > 0 ? files : (singleFile ? [singleFile] : []);

    if (fileList.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Max 10 files per job
    if (fileList.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 files per print job' }, { status: 400 });
    }

    let totalSize = 0;
    for (const f of fileList) {
      totalSize += f.size;
    }
    if (totalSize > 35 * 1024 * 1024) {
      return NextResponse.json({ error: 'Total upload size exceeds 35 MB' }, { status: 400 });
    }

    // Process all incoming file buffers and page counts in parallel
    const processedFiles = await Promise.all(
      fileList.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = file.name;
        const mimeType = file.type || '';

        let pageCount = 1;
        if (fileName.toLowerCase().endsWith('.pdf') || mimeType.includes('pdf')) {
          try {
            pageCount = await getPdfPageCount(arrayBuffer);
          } catch {
            pageCount = 1;
          }
        }

        const item: UploadedFileItem = {
          id: crypto.randomUUID(),
          name: fileName,
          size: file.size,
          pages: pageCount,
          type: mimeType,
        };

        const toMerge = { buffer, fileName, mimeType };

        return { item, toMerge };
      })
    );

    const fileItems = processedFiles.map((p) => p.item);
    const filesToMerge = processedFiles.map((p) => p.toMerge);

    const layoutMode = (formData.get('layoutMode') as PrintLayoutOptions['layoutMode']) || '1-up';
    const customCols = parseInt(formData.get('customCols') as string, 10) || 2;
    const customRows = parseInt(formData.get('customRows') as string, 10) || 2;
    const fitMode = (formData.get('fitMode') as PrintLayoutOptions['fitMode']) || 'fill';
    const drawBorder = formData.get('drawBorder') === 'true';
    const orientation = (formData.get('orientation') as PrintLayoutOptions['orientation']) || 'auto';
    const autoRotate = formData.get('autoRotate') !== 'false';
    const pageOrder = (formData.get('pageOrder') as PrintLayoutOptions['pageOrder']) || 'horizontal';

    let finalBuffer: Buffer;
    let finalTotalPages = 0;
    const primaryName = fileList.length === 1 
      ? fileList[0].name 
      : `${fileList[0].name.split('.')[0]} + ${fileList.length - 1} more`;

    if (fileList.length === 1 && fileList[0].name.toLowerCase().endsWith('.pdf') && layoutMode === '1-up') {
      finalBuffer = filesToMerge[0].buffer;
      finalTotalPages = fileItems[0].pages;
    } else {
      // Merge all documents/images into a single unified A4 PDF with layout options
      const mergeResult = await mergeFilesToPdf(filesToMerge, {
        layoutMode,
        customCols,
        customRows,
        fitMode,
        drawBorder,
        orientation,
        autoRotate,
        pageOrder,
      });
      finalBuffer = mergeResult.mergedBuffer;
      finalTotalPages = mergeResult.totalPages;
      if (fileItems.length === 1) {
        fileItems[0].pages = finalTotalPages;
      }
    }

    // Generate unique storage key
    const uniqueId = crypto.randomUUID();
    const sanitizedName = fileList[0].name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `uploads/${uniqueId}-${sanitizedName}.pdf`;

    // Concurrently upload to Cloudflare R2 and generate presigned download URL
    const [downloadUrl] = await Promise.all([
      getDownloadUrl(fileKey, 900),
      uploadToR2(fileKey, finalBuffer, 'application/pdf'),
    ]);

    return NextResponse.json({
      success: true,
      fileKey,
      fileName: primaryName,
      totalPages: finalTotalPages,
      fileSize: finalBuffer.length,
      fileCount: fileList.length,
      fileItems,
      downloadUrl,
    });
  } catch (err: unknown) {
    console.error('Upload error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
