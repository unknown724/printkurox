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

    const { pdfBuffer, pageCount } = await convertDocxToPdf(buffer, ext);

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
    console.error('[API /api/convert-docx] Conversion error:', err);
    const message = err instanceof Error ? err.message : 'DOCX conversion failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
