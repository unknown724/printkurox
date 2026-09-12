import { NextRequest, NextResponse } from 'next/server';
import { getFileFromR2 } from '@/lib/cloudflare-r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get('key');

  if (!fileKey || !fileKey.startsWith('uploads/')) {
    return NextResponse.json({ error: 'Invalid or missing file key' }, { status: 400 });
  }

  try {
    const fileBody = await getFileFromR2(fileKey);
    if (!fileBody) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const lowerKey = fileKey.toLowerCase();
    const contentType =
      lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg')
        ? 'image/jpeg'
        : lowerKey.endsWith('.png')
        ? 'image/png'
        : lowerKey.endsWith('.webp')
        ? 'image/webp'
        : lowerKey.endsWith('.gif')
        ? 'image/gif'
        : 'application/pdf';

    const byteArray = await (fileBody as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=900');

    return new Response(Buffer.from(byteArray), { headers });
  } catch (err) {
    console.error('View file error:', err);
    return NextResponse.json({ error: 'Failed to retrieve file stream' }, { status: 500 });
  }
}
