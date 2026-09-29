import { NextRequest, NextResponse } from 'next/server';
import { convertDocxToPdf } from '@/lib/docx-converter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name;
    const ext = fileName.split('.').pop()?.toLowerCase() || 'docx';

    if (ext !== 'docx' && ext !== 'doc') {
      return NextResponse.json({ error: 'Only .docx and .doc files are supported' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Check if DOCX_CONVERTER_URL is configured via environment variable
    let converterUrl = process.env.DOCX_CONVERTER_URL?.trim();

    // 2. If not in env, dynamically query the live converter URL registered by the hostel station daemon
    if (!converterUrl) {
      try {
        const { queryD1 } = await import('@/lib/cloudflare-d1');
        const rows = await queryD1<{ value: string }>(
          `SELECT value FROM app_settings WHERE key = 'docx_converter_url' LIMIT 1`
        );
        if (rows?.[0]?.value) {
          converterUrl = rows[0].value.trim();
        }
      } catch (d1Err) {
        console.warn('[API /api/convert-docx] Could not query docx_converter_url from D1:', d1Err);
      }
    }

    // Forward to the station laptop's LibreOffice daemon for 100% authentic vector output.
    if (converterUrl) {
      try {
        const cleanBase = converterUrl.replace(/\/+$/, '');
        const tunnelEndpoint = `${cleanBase}/convert-docx?ext=${encodeURIComponent(ext)}`;
        const remoteRes = await fetch(tunnelEndpoint, {
          method: 'POST',
          body: buffer,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Extension': ext,
            'X-Original-Filename': fileName,
          },
          signal: AbortSignal.timeout(5000),
        });

        if (remoteRes.ok) {
          const remotePdf = Buffer.from(await remoteRes.arrayBuffer());
          if (remotePdf.length > 500) {
            let pageCount = 1;
            try {
              const { PDFDocument } = await import('pdf-lib');
              const pdfDoc = await PDFDocument.load(remotePdf, { ignoreEncryption: true });
              pageCount = pdfDoc.getPageCount() || 1;
            } catch {
              pageCount = 1;
            }

            const outName = fileName.replace(/\.(docx|doc)$/i, '.pdf');
            return new NextResponse(new Uint8Array(remotePdf), {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(outName)}"`,
                'X-Page-Count': String(pageCount),
                'X-Converted-By': 'PrintKurox-Cloudflare-LibreOffice',
              },
            });
          }
        } else {
          console.warn(`[API /api/convert-docx] Remote tunnel converter returned HTTP ${remoteRes.status}`);
        }
      } catch (tunnelErr) {
        console.warn('[API /api/convert-docx] Remote tunnel conversion attempt failed, falling back:', tunnelErr);
      }
    }

    // Try native LibreOffice or Microsoft Word. If not available on serverless (Vercel),
    // do NOT return degraded 2-page mammoth plain-text output. Return 503 so client-side
    // docx-preview converter renders all authentic pages, styling, tables, and images in browser.
    const { pdfBuffer, pageCount } = await convertDocxToPdf(buffer, ext, false);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return NextResponse.json(
        { error: 'No native conversion engine available on server', fallbackToClient: true },
        { status: 503 }
      );
    }

    const outName = fileName.replace(/\.(docx|doc)$/i, '.pdf');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(outName)}"`,
        'X-Page-Count': String(pageCount || 1),
        'X-Converted-By': 'PrintKurox-Server-Converter',
      },
    });
  } catch (err: unknown) {
    console.warn('[API /api/convert-docx] Server-side DOCX conversion notice (falling back to client):', err);
    const message = err instanceof Error ? err.message : 'Server native engine not available';
    return NextResponse.json(
      { error: message, fallbackToClient: true },
      { status: 503 }
    );
  }
}
