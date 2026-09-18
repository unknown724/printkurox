import { NextRequest, NextResponse } from 'next/server';
import { getFileFromR2 } from '@/lib/cloudflare-r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getLocalPdfBuffer(pickup?: string | null, name?: string | null): { buffer: Buffer; fileName: string } | null {
  // Only evaluate when running locally on Node.js, bypass completely on Vercel
  if (process.env.VERCEL) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeFs = eval('require("fs")');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePath = eval('require("path")');

    const searchDirs = [
      nodePath.join(process.cwd(), 'daemon', 'printed_archive'),
      nodePath.join(process.cwd(), 'daemon', 'temp_prints'),
    ];
    const cleanPickup = (pickup || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const cleanName = (name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().replace('.pdf', '');

    for (const dir of searchDirs) {
      if (!nodeFs.existsSync(dir)) continue;

      // Recursive scan for matching PDF
      const stack = [dir];
      while (stack.length > 0) {
        const current = stack.pop()!;
        const entries = nodeFs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = nodePath.join(current, entry.name);
          if (entry.isDirectory()) {
            stack.push(fullPath);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
            const fnameUpper = entry.name.toUpperCase();
            if (cleanPickup && (fnameUpper.startsWith(`${cleanPickup}_`) || fnameUpper.includes(`_${cleanPickup}_`))) {
              return { buffer: nodeFs.readFileSync(fullPath), fileName: entry.name };
            }
            if (cleanName && cleanName.length >= 6 && entry.name.toLowerCase().includes(cleanName)) {
              return { buffer: nodeFs.readFileSync(fullPath), fileName: entry.name };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Notice: Local PC archive scan skipped:', err);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get('key');
  const pickup = searchParams.get('pickup') || '';
  const fileName = searchParams.get('name') || '';

  // 1. If running on local server (e.g. localhost:3000), check local hard drive first!
  const localPdf = getLocalPdfBuffer(pickup, fileName);
  if (localPdf) {
    try {
      const headers = new Headers();
      headers.set('Content-Type', 'application/pdf');
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(localPdf.fileName)}"`);
      headers.set('Cache-Control', 'no-cache');
      return new Response(new Uint8Array(localPdf.buffer), { headers });
    } catch (e) {
      console.warn('Failed to stream local PDF file directly:', e);
    }
  }

  // 2. If archived locally or purged from cloud
  if (!fileKey || fileKey === 'ARCHIVED_LOCALLY' || !fileKey.startsWith('uploads/') || fileKey.includes('..')) {
    const encodedPickup = encodeURIComponent(pickup);
    const encodedName = encodeURIComponent(fileName);

    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>PrintKurox - Stored in Local PC Archive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background:#09090b; color:#f4f4f5; font-family:system-ui,-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:20px; box-sizing:border-box; }
    .card { background:#18181b; border:1px solid #27272a; border-radius:20px; padding:36px; max-width:500px; text-align:center; box-shadow:0 16px 40px rgba(0,0,0,0.7); }
    .icon { font-size:44px; margin-bottom:12px; }
    h2 { font-size:20px; font-weight:700; margin:0 0 10px 0; color:#fafafa; }
    p { font-size:14px; color:#a1a1aa; line-height:1.6; margin:0 0 16px 0; }
    .badge { display:inline-block; background:rgba(99,102,241,0.15); color:#818cf8; border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:6px 14px; font-size:12px; font-family:monospace; margin-bottom:18px; }
    .btn-group { display:flex; flex-direction:column; gap:10px; margin:20px 0 10px 0; }
    .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:12px 18px; border-radius:12px; font-size:13px; font-weight:600; text-decoration:none; cursor:pointer; transition:all 0.15s ease; }
    .btn-primary { background:#6366f1; color:#fff; border:none; }
    .btn-primary:hover { background:#4f46e5; }
    .btn-secondary { background:#27272a; color:#e4e4e7; border:1px solid #3f3f46; }
    .btn-secondary:hover { background:#3f3f46; }
    .tip { font-size:12px; color:#71717a; border-top:1px solid #27272a; padding-top:16px; margin-top:16px; line-height:1.5; }
    #pc-detected { display:none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">💻📁</div>
    <h2>Saved in Local PC Archive</h2>
    <p>Document <b>${pickup ? '#' + pickup : ''}</b> completed printing. To eliminate cloud fees and protect privacy, the file is archived on your shop computer.</p>
    
    <div class="badge">daemon/printed_archive/ &bull; Shop PC Disk</div>

    <!-- Actions automatically revealed if viewing from the Shop Laptop -->
    <div id="pc-detected">
      <div style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:12px; margin-bottom:14px; font-size:13px; color:#34d399;">
        ⚡ <b>Shop Laptop Detected!</b> Opening document from your hard drive...
      </div>
      <div class="btn-group">
        <a id="btn-view" href="http://127.0.0.1:7250/archive?pickup=${encodedPickup}&name=${encodedName}" class="btn btn-primary" target="_blank">
          📄 Open PDF in Browser
        </a>
        <a id="btn-folder" href="http://127.0.0.1:7250/open-folder?pickup=${encodedPickup}" class="btn btn-secondary" target="_blank">
          📁 Show in Windows Explorer Folder
        </a>
      </div>
    </div>

    <!-- Mobile view notice -->
    <div id="mobile-notice">
      <p style="font-size:13px; color:#d4d4d8; margin-top:10px;">
        <b>Viewing on Mobile Phone?</b> The physical PDF file is stored on your shop computer hard drive.
      </p>
      <div class="tip">
        🖨️ <b>Need to reprint?</b> You can click <b>Reprint</b> in the Admin Queue right from your phone, and the shop laptop will automatically print it from its local archive!
      </div>
    </div>
  </div>

  <script>
    // Probe local shop daemon at port 7250
    const localUrl = 'http://127.0.0.1:7250/archive?pickup=${encodedPickup}&name=${encodedName}';
    fetch('http://127.0.0.1:7250/check', { mode: 'cors' })
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'online') {
          // Admin is viewing from the shop PC!
          document.getElementById('pc-detected').style.display = 'block';
          document.getElementById('mobile-notice').style.display = 'none';
          // Auto navigate to local PDF stream
          setTimeout(() => {
            window.location.replace(localUrl);
          }, 800);
        }
      })
      .catch(() => {
        // Not on shop PC or daemon server starting up
      });
  </script>
</body>
</html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  // 3. Active cloud document stream from R2
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
    <p style="font-size:14px;color:#a1a1aa;line-height:1.5;margin:0 0 20px 0;">This document has already finished printing and was deleted from cloud storage to protect customer privacy.</p>
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
