import { NextRequest, NextResponse } from 'next/server';
import { getFileFromR2 } from '@/lib/cloudflare-r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get('key');

  if (!fileKey || fileKey === 'ARCHIVED_LOCALLY' || !fileKey.startsWith('uploads/') || fileKey.includes('..')) {
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>PrintKurox - Stored in Local PC Archive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background:#09090b; color:#f4f4f5; font-family:system-ui,-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:20px; box-sizing:border-box; }
    .card { background:#18181b; border:1px solid #27272a; border-radius:20px; padding:36px; max-width:480px; text-align:center; box-shadow:0 12px 30px rgba(0,0,0,0.6); }
    .icon { font-size:42px; margin-bottom:14px; }
    h2 { font-size:20px; font-weight:700; margin:0 0 10px 0; color:#fafafa; }
    p { font-size:14px; color:#a1a1aa; line-height:1.6; margin:0 0 16px 0; }
    .badge { display:inline-block; background:rgba(99,102,241,0.15); color:#818cf8; border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:6px 14px; font-size:12px; font-family:monospace; margin-bottom:18px; }
    .tip { font-size:12px; color:#71717a; border-top:1px solid #27272a; padding-top:16px; line-height:1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">💻📁</div>
    <h2>Saved in Local PC Archive</h2>
    <p>This document has completed printing. To eliminate cloud storage costs and protect customer privacy, the cloud copy was purged.</p>
    <div class="badge">Stored locally on Shop PC &bull; printed_archive/</div>
    <p style="font-size:13px; color:#d4d4d8;">
      <b>On the Shop Laptop:</b> The PDF file is safely stored on disk in <code>daemon/printed_archive/</code>. You can click <b>Reprint</b> in the Admin Panel to print it again directly!
    </p>
    <div class="tip">
      📱 <b>Viewing on Phone?</b> The physical document is saved locally on your shop computer hard drive.
    </div>
  </div>
</body>
</html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
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
    headers.set('Content-Disposition', 'inline; filename="document.pdf"');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=900');

    return new Response(Buffer.from(byteArray), { headers });
  } catch (err: unknown) {
    const errorName = (err as { name?: string })?.name;
    const errorCode = (err as { Code?: string })?.Code;
    if (errorName === 'NoSuchKey' || errorCode === 'NoSuchKey') {
      return new Response(
        `<!DOCTYPE html>
<html>
<head><title>PrintKurox - File Purged</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;">
  <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;max-width:440px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
    <div style="font-size:36px;margin-bottom:12px;">🔒</div>
    <h2 style="font-size:18px;font-weight:700;margin:0 0 8px 0;color:#fafafa;">Document Purged</h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.5;margin:0 0 20px 0;">This document has already finished printing and was permanently deleted from cloud storage to protect customer privacy (Zero-Retention Policy).</p>
    <div style="font-size:12px;color:#71717a;border-top:1px solid #27272a;padding-top:16px;">PrintKurox Privacy Protection &bull; Instant Cloud Wipe</div>
  </div>
</body>
</html>`,
        {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }
    console.error('View file error:', err);
    return NextResponse.json({ error: 'Failed to retrieve file stream' }, { status: 500 });
  }
}
