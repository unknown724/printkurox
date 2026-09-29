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

    // If DOCX_CONVERTER_URL is configured (e.g. Cloudflare tunnel to hostel station laptop),
    // forward to the remote LibreOffice daemon first for 100% authentic vector output.
    const converterUrl = process.env.DOCX_CONVERTER_URL?.trim();
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
          signal: AbortSignal.timeout(8000),
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

    const { pdfBuffer, pageCount } = await convertDocxToPdf(buffer, ext, true);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return NextResponse.json({ error: 'Conversion produced empty output' }, { status: 500 });
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
    console.warn('[API /api/convert-docx] Server-side DOCX conversion error:', err);
    const message = err instanceof Error ? err.message : 'DOCX conversion failed';
    return NextResponse.json(
      { error: message, fallbackToClient: true },
      { status: 500 }
    );
  }
}
