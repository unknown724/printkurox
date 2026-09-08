import { NextRequest, NextResponse } from 'next/server';
import { getFileFromR2 } from '@/lib/cloudflare-r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get('key');

  if (!fileKey) {
    return NextResponse.json({ error: 'Missing file key' }, { status: 400 });
  }

  try {
    const fileStream = await getFileStreamFromR2(fileKey);
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=900');

    return new Response(fileStream as any, { headers });
  } catch (err) {
    console.error('View file error:', err);
    return NextResponse.json({ error: 'Failed to retrieve file stream' }, { status: 500 });
  }
}
