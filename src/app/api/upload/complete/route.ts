import { NextRequest, NextResponse } from 'next/server';
import {
  getFileBufferFromR2,
  uploadToR2,
  getDownloadUrl,
  deleteFromR2,
} from '@/lib/cloudflare-r2';
import { getPdfPageCount, mergeFilesToPdf } from '@/lib/pdf-utils';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CompleteUploadFile {
  id?: string;
  key: string;
  name: string;
  size: number;
  type: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const files: CompleteUploadFile[] = body.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No uploaded files to finalize' }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 files per print job' }, { status: 400 });
    }

    // Single PDF optimization: No re-encoding or re-merging needed
    if (files.length === 1 && (files[0].name.toLowerCase().endsWith('.pdf') || files[0].type.includes('pdf'))) {
      const file = files[0];
      const buffer = await getFileBufferFromR2(file.key);
      const pages = await getPdfPageCount(buffer);

      const downloadUrl = await getDownloadUrl(file.key, 900);

      const fileItem = {
        id: file.id || crypto.randomUUID(),
        name: file.name,
        size: file.size,
        pages,
        type: file.type || 'application/pdf',
      };

      return NextResponse.json({
        success: true,
        fileKey: file.key,
        fileName: file.name,
        totalPages: pages,
        fileSize: file.size,
        fileCount: 1,
        fileItems: [fileItem],
        downloadUrl,
      });
    }

    // Multiple files or image files: Download buffers from R2 concurrently and merge to A4 PDF
    const downloadedFiles = await Promise.all(
      files.map(async (file) => {
        const buffer = await getFileBufferFromR2(file.key);
        const fileName = file.name;
        const mimeType = file.type || '';

        let pageCount = 1;
        if (fileName.toLowerCase().endsWith('.pdf') || mimeType.includes('pdf')) {
          try {
            pageCount = await getPdfPageCount(buffer);
          } catch {
            pageCount = 1;
          }
        }

        const item = {
          id: file.id || crypto.randomUUID(),
          name: fileName,
          size: file.size,
          pages: pageCount,
          type: mimeType,
        };

        const toMerge = { buffer, fileName, mimeType };
        return { item, toMerge, rawKey: file.key };
      })
    );

    const fileItems = downloadedFiles.map((d) => d.item);
    const toMerge = downloadedFiles.map((d) => d.toMerge);

    // Merge into single A4 PDF
    const { mergedBuffer, totalPages } = await mergeFilesToPdf(toMerge);

    const uniqueId = crypto.randomUUID();
    const sanitizedName = files[0].name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalKey = `uploads/${uniqueId}-${sanitizedName}.pdf`;

    const primaryName =
      files.length === 1
        ? files[0].name
        : `${files[0].name.split('.')[0]} + ${files.length - 1} more`;

    // Concurrently upload merged PDF and generate download URL
    const [downloadUrl] = await Promise.all([
      getDownloadUrl(finalKey, 900),
      uploadToR2(finalKey, mergedBuffer, 'application/pdf'),
    ]);

    // Clean up temporary raw staging files in R2 (fire-and-forget)
    Promise.allSettled(downloadedFiles.map((d) => deleteFromR2(d.rawKey))).catch(() => {});

    return NextResponse.json({
      success: true,
      fileKey: finalKey,
      fileName: primaryName,
      totalPages,
      fileSize: mergedBuffer.length,
      fileCount: files.length,
      fileItems,
      downloadUrl,
    });
  } catch (err: unknown) {
    console.error('Complete upload error:', err);
    const message = err instanceof Error ? err.message : 'Failed to finalize uploaded documents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
