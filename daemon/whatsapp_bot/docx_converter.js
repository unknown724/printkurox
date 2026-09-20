/**
 * Local Headless DOCX to PDF Conversion Module for PrintKurox
 * Uses local LibreOffice (soffice) with 100% genuine vector PDF output.
 * Runs completely offline, zero cloud API fees, ~1.5s per conversion.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto');

const POSSIBLE_SOFFICE_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'soffice.com',
  'soffice',
];

function findSoffice() {
  for (const p of POSSIBLE_SOFFICE_PATHS) {
    if (p === 'soffice') continue;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Converts a DOCX/DOC Buffer to a PDF Buffer
 * @param {Buffer} inputBuffer
 * @param {string} originalFileName
 * @returns {Promise<Buffer|null>} Converted PDF buffer or null if unsupported/failed
 */
async function convertDocxToPdf(inputBuffer, originalFileName = 'document.docx') {
  const sofficePath = findSoffice() || 'soffice';

  const tempDir = path.join(__dirname, '..', 'temp_prints');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const randomId = crypto.randomUUID().slice(0, 8);
  const ext = path.extname(originalFileName) || '.docx';
  const tempInputPath = path.join(tempDir, `conv_${randomId}${ext}`);
  const expectedPdfName = `conv_${randomId}.pdf`;
  const expectedPdfPath = path.join(tempDir, expectedPdfName);

  try {
    fs.writeFileSync(tempInputPath, inputBuffer);

    await new Promise((resolve, reject) => {
      const args = ['--headless', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', tempDir, tempInputPath];
      execFile(sofficePath, args, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        resolve(stdout);
      });
    });

    if (fs.existsSync(expectedPdfPath)) {
      const pdfBytes = fs.readFileSync(expectedPdfPath);
      // Clean up temp files
      try { fs.unlinkSync(tempInputPath); } catch {}
      try { fs.unlinkSync(expectedPdfPath); } catch {}
      return pdfBytes;
    }
    throw new Error('Converted PDF file not found');
  } catch (err) {
    console.warn('[DOCX-Converter] Notice: Local conversion attempt:', err.message);
    try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
    try { if (fs.existsSync(expectedPdfPath)) fs.unlinkSync(expectedPdfPath); } catch {}
    return null;
  }
}

module.exports = {
  findSoffice,
  convertDocxToPdf,
};
