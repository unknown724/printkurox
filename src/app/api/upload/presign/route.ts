import { NextRequest, NextResponse } from 'next/server';
import { getUploadPresignedUrl } from '@/lib/cloudflare-r2';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PresignItem {
  name: string;
  size: number;
  type: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const files: PresignItem[] = body.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided for presigning' }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 files per print job' }, { status: 400 });
    }

    const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];
    let totalSize = 0;

    for (const f of files) {
      if (typeof f.size !== 'number' || f.size <= 0 || f.size > 35 * 1024 * 1024) {
        return NextResponse.json({ error: 'Invalid file size. Files must be between 1 byte and 35 MB.' }, { status: 400 });
      }
      totalSize += f.size;

      const ext = (f.name || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json({ error: `File type ${ext || 'unknown'} is not supported for printing.` }, { status: 400 });
      }
    }

    if (totalSize > 35 * 1024 * 1024) {
      return NextResponse.json({ error: 'Total upload size exceeds 35 MB' }, { status: 400 });
    }

    const uploads = await Promise.all(
      files.map(async (f) => {
        const uniqueId = crypto.randomUUID();
        const sanitized = (f.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `uploads/raw/${uniqueId}-${sanitized}`;
        const contentType = f.type || 'application/octet-stream';

        const uploadUrl = await getUploadPresignedUrl(key, contentType, 900);

        return {
          id: uniqueId,
          key,
          uploadUrl,
          name: f.name,
          size: f.size,
          type: contentType,
        };
      })
    );

    return NextResponse.json({
      success: true,
      uploads,
    });
  } catch (err: unknown) {
    console.error('Presign error:', err);
    const message = err instanceof Error ? err.message : 'Presign failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
