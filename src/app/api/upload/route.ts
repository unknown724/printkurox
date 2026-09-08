import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2, getDownloadUrl } from '@/lib/cloudflare-r2';
import { getPdfPageCount, mergeFilesToPdf } from '@/lib/pdf-utils';
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
    const fileItems: UploadedFileItem[] = [];
    const filesToMerge: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];

    for (const file of fileList) {
      totalSize += file.size;
      if (totalSize > 35 * 1024 * 1024) {
        return NextResponse.json({ error: 'Total upload size exceeds 35 MB' }, { status: 400 });
      }

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
      } else {
        pageCount = 1; // 1 sheet per image
      }

      fileItems.push({
        id: crypto.randomUUID(),
        name: fileName,
        size: file.size,
        pages: pageCount,
        type: mimeType,
      });

      filesToMerge.push({ buffer, fileName, mimeType });
    }

    let finalBuffer: Buffer;
    let finalTotalPages = 0;
    const primaryName = fileList.length === 1 
      ? fileList[0].name 
      : `${fileList[0].name.split('.')[0]} + ${fileList.length - 1} more`;

    if (fileList.length === 1 && fileList[0].name.toLowerCase().endsWith('.pdf')) {
      finalBuffer = filesToMerge[0].buffer;
      finalTotalPages = fileItems[0].pages;
    } else {
      // Merge all documents/images into a single unified A4 PDF
      const mergeResult = await mergeFilesToPdf(filesToMerge);
      finalBuffer = mergeResult.mergedBuffer;
      finalTotalPages = mergeResult.totalPages;
    }

    // Generate unique storage key
    const uniqueId = crypto.randomUUID();
    const sanitizedName = fileList[0].name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `uploads/${uniqueId}-${sanitizedName}.pdf`;

    // Upload merged master PDF to Cloudflare R2
    await uploadToR2(fileKey, finalBuffer, 'application/pdf');

    // Generate 15-min signed download URL
    const downloadUrl = await getDownloadUrl(fileKey, 900);

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
