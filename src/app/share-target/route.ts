import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2, getDownloadUrl } from '@/lib/cloudflare-r2';
import { getPdfPageCount, mergeFilesToPdf } from '@/lib/pdf-utils';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // Retrieve files from form-data (name='documents' from manifest share_target)
    const fileEntries = formData.getAll('documents');
    const validFiles: File[] = [];

    for (const entry of fileEntries) {
      if (entry && typeof entry === 'object' && 'arrayBuffer' in entry && (entry as File).size > 0) {
        validFiles.push(entry as File);
      }
    }

    if (validFiles.length === 0) {
      // Fallback: Check if any other field in formData contains a File
      for (const [key, value] of formData.entries()) {
        if (value && typeof value === 'object' && 'arrayBuffer' in value && (value as File).size > 0) {
          validFiles.push(value as File);
        }
      }
    }

    if (validFiles.length === 0) {
      return NextResponse.redirect(new URL('/?error=No+file+received+from+share', req.url), 303);
    }

    // Process uploaded file(s)
    let finalKey = '';
    let primaryName = '';
    let totalPages = 1;
    let totalSize = 0;

    if (validFiles.length === 1 && (validFiles[0].name.toLowerCase().endsWith('.pdf') || validFiles[0].type.includes('pdf'))) {
      const file = validFiles[0];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      totalPages = await getPdfPageCount(buffer);
      totalSize = file.size;
      primaryName = file.name || 'whatsapp_document.pdf';

      const uniqueId = crypto.randomUUID();
      const cleanBase = primaryName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      finalKey = `uploads/${uniqueId}-${cleanBase}.pdf`;

      await uploadToR2(finalKey, buffer, 'application/pdf');
    } else {
      // Multiple files or image files: Convert/merge to single printable A4 PDF
      const filesToMerge = await Promise.all(
        validFiles.map(async (file) => {
          const arrayBuffer = await file.arrayBuffer();
          return {
            buffer: Buffer.from(arrayBuffer),
            fileName: file.name || 'document',
            mimeType: file.type || 'application/pdf',
          };
        })
      );

      const merged = await mergeFilesToPdf(filesToMerge);
      totalPages = merged.totalPages;
      totalSize = merged.mergedBuffer.length;

      const uniqueId = crypto.randomUUID();
      const firstClean = (validFiles[0].name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
      primaryName = validFiles.length === 1
        ? (validFiles[0].name || 'shared_document.pdf')
        : `${firstClean.split('.')[0]} + ${validFiles.length - 1} more`;

      finalKey = `uploads/${uniqueId}-${firstClean}.pdf`;
      await uploadToR2(finalKey, merged.mergedBuffer, 'application/pdf');
    }

    const downloadUrl = await getDownloadUrl(finalKey, 900);

    // Redirect directly into main page with preloaded batch session
    const targetUrl = new URL('/', req.url);
    targetUrl.searchParams.set('sharedKey', finalKey);
    targetUrl.searchParams.set('sharedName', primaryName);
    targetUrl.searchParams.set('sharedPages', totalPages.toString());
    targetUrl.searchParams.set('sharedSize', totalSize.toString());
    targetUrl.searchParams.set('sharedCount', validFiles.length.toString());
    targetUrl.searchParams.set('sharedUrl', downloadUrl);

    return NextResponse.redirect(targetUrl, 303);
  } catch (err: unknown) {
    console.error('Web Share Target processing error:', err);
    return NextResponse.redirect(new URL('/?error=Failed+to+process+shared+file', req.url), 303);
  }
}
