'use client';

import { PDFDocument } from 'pdf-lib';

/**
 * Client-Side High-Fidelity DOCX Converter
 * Runs in the user's browser (Chrome/Safari/Firefox/Edge on Mobile & Desktop).
 * Renders DOCX XML, typography, tables, styles, and embedded images (logos, diagrams)
 * into a high-resolution A4 PDF using docx-preview + html2canvas + pdf-lib.
 */
export async function convertDocxToPdfClient(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<File | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  // Off-screen rendering container (visible to html2canvas behind main viewport)
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.minHeight = '1123px';
  container.style.opacity = '1';
  container.style.visibility = 'visible';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-9999';
  container.style.backgroundColor = '#ffffff';
  container.style.overflow = 'hidden';

  document.body.appendChild(container);

  try {
    // Dynamic import to avoid SSR issues
    const { renderAsync } = await import('docx-preview');
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default || html2canvasModule;

    // Render DOCX into DOM using docx-preview with embedded style support
    await renderAsync(file, container, container, {
      className: 'docx',
      inWrapper: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      trimXmlDeclaration: true,
    });

    // Wait for all embedded images to load
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalWidth > 0) {
                resolve();
              } else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 1500); // 1.5s safety timeout per image
              }
            })
        )
      );
    }

    // Wait for document fonts if available
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {
      // Ignore font wait failures
    }

    // Small delay to let CSS flow settle
    await new Promise((r) => setTimeout(r, 150));

    // Extract all <style> tags injected by docx-preview
    const styleTags = Array.from(container.querySelectorAll('style'));

    // Find all page sections created by docx-preview
    let pageSections = Array.from(container.querySelectorAll('section'));
    if (pageSections.length === 0) {
      const wrapper = container.querySelector('.kurox-docx-wrapper') || container;
      pageSections = [wrapper as HTMLElement];
    }

    // Ensure every section has the docx CSS stylesheets attached directly inside it
    pageSections.forEach((sec) => {
      styleTags.forEach((st) => {
        sec.prepend(st.cloneNode(true));
      });
    });

    const totalPages = pageSections.length;
    const pdfDoc = await PDFDocument.create();

    // Standard A4 dimensions in points (72 DPI): 595.28 x 841.89
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;

    for (let i = 0; i < pageSections.length; i++) {
      const section = pageSections[i];
      if (onProgress) {
        onProgress(i + 1, totalPages);
      }

      // Rasterize page section to high-res canvas with full style support
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = await (html2canvas as any)(section as HTMLElement, {
        scale: 2.0,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: 820,
      });

      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const jpgImage = await pdfDoc.embedJpg(imgDataUrl);

      // Preserve aspect ratio cleanly on A4
      const canvasAspect = canvas.width / canvas.height;
      const a4Aspect = A4_WIDTH / A4_HEIGHT;

      let drawWidth = A4_WIDTH;
      let drawHeight = A4_HEIGHT;
      let drawX = 0;
      let drawY = 0;

      if (canvasAspect > a4Aspect) {
        drawHeight = A4_WIDTH / canvasAspect;
        drawY = (A4_HEIGHT - drawHeight) / 2;
      } else {
        drawWidth = A4_HEIGHT * canvasAspect;
        drawX = (A4_WIDTH - drawWidth) / 2;
      }

      page.drawImage(jpgImage, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const cleanBaseName = file.name.replace(/\.(docx|doc)$/i, '');
    const convertedFileName = `${cleanBaseName}.pdf`;

    return new File([new Uint8Array(pdfBytes).buffer as ArrayBuffer], convertedFileName, {
      type: 'application/pdf',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[ClientDocxConverter] High-fidelity rendering failed, falling back:', err);
    return null;
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
