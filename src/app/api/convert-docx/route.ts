import { NextRequest, NextResponse } from 'next/server';
import { convertDocxToPdf } from '@/lib/docx-converter';
import { PDFDocument } from 'pdf-lib';

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

    // 1. Try external LibreOffice converter if configured (e.g. friend's laptop via Cloudflare Tunnel or Oracle VM)
    const externalConverterUrl = process.env.DOCX_CONVERTER_URL?.trim();
    if (externalConverterUrl) {
      try {
        const remoteRes = await fetch(`${externalConverterUrl.replace(/\/+$/, '')}/convert-docx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: buffer,
          signal: AbortSignal.timeout(25000),
        });

        if (remoteRes.ok) {
          const remotePdf = await remoteRes.arrayBuffer();
          if (remotePdf && remotePdf.byteLength > 500) {
            const pdfDoc = await PDFDocument.load(remotePdf, { ignoreEncryption: true });
            const pageCount = pdfDoc.getPageCount();
            const outName = fileName.replace(/\.(docx|doc)$/i, '.pdf');
            return new NextResponse(new Uint8Array(remotePdf), {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(outName)}"`,
                'X-Page-Count': String(pageCount || 1),
                'X-Converted-By': 'PrintKurox-Remote-LibreOffice',
              },
            });
          }
        }
      } catch (remoteErr) {
        console.warn('[API /api/convert-docx] Remote LibreOffice converter notice:', remoteErr);
      }
    }

    // 2. Try server-side local LibreOffice/Word (active on localhost or self-hosted Windows/Linux server)
    const { pdfBuffer, pageCount } = await convertDocxToPdf(buffer, ext, false);

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
        'X-Converted-By': 'PrintKurox-Local-LibreOffice',
      },
    });
  } catch (err: unknown) {
    console.warn('[API /api/convert-docx] Server-side LibreOffice engine unavailable on cloud container:', err);
    const message = err instanceof Error ? err.message : 'DOCX conversion failed';
    return NextResponse.json(
      { error: message, fallbackToClient: true },
      { status: 501 }
    );
  }
}
