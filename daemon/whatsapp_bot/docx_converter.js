/**
 * High-Performance, Zero-Hang DOCX/DOC to PDF Conversion Module for PrintKurox
 * 
 * Supports:
 * 1. LibreOffice Headless (Fast, non-blocking, isolated process, 100% vector output)
 * 2. Microsoft Word COM (Native Windows fallback)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const crypto = require('crypto');

const POSSIBLE_SOFFICE_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/local/bin/soffice',
  'soffice.exe',
  'soffice',
  'libreoffice'
];

function findSoffice() {
  for (const p of POSSIBLE_SOFFICE_PATHS) {
    if (p === 'soffice' || p === 'soffice.exe' || p === 'libreoffice') continue;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findPsScript() {
  const candidates = [
    path.join(__dirname, 'convert_docx.ps1'),
    path.join(__dirname, 'daemon', 'convert_docx.ps1'),
    path.join(__dirname, '..', 'convert_docx.ps1'),
    'C:\\PrintKurox\\daemon\\convert_docx.ps1'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Converts a Word document buffer to PDF using LibreOffice (Fast, headless, isolated)
 */
async function convertViaLibreOffice(tempInputPath, tempDir, sofficePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--convert-to', 'pdf:writer_pdf_Export',
      '--outdir', tempDir,
      tempInputPath
    ];

    execFile(sofficePath, args, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`LibreOffice conversion failed: ${error.message} - ${stderr}`));
      }
      resolve(stdout);
    });
  });
}

/**
 * Converts a Word document buffer to PDF using Microsoft Word COM (Windows Fallback)
 */
async function convertViaWordCom(tempInputPath, expectedPdfPath, psScriptPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScriptPath,
      '-InputPath', tempInputPath,
      '-OutputPath', expectedPdfPath
    ];

    execFile('powershell.exe', args, { timeout: 35000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Word COM conversion failed: ${error.message} - ${stderr}`));
      }
      if (!fs.existsSync(expectedPdfPath)) {
        return reject(new Error('Word COM finished but output PDF file was not created'));
      }
      resolve(expectedPdfPath);
    });
  });
}

/**
 * Converts a DOCX/DOC Buffer to a PDF Buffer
 * @param {Buffer} inputBuffer
 * @param {string} originalFileName
 * @returns {Promise<Buffer|null>} Converted PDF buffer or null if unsupported/failed
 */
async function convertDocxToPdf(inputBuffer, originalFileName = 'document.docx') {
  const tempDir = path.join(__dirname, '..', 'temp_prints');
  if (!fs.existsSync(tempDir)) {
    try {
      fs.mkdirSync(tempDir, { recursive: true });
    } catch {}
  }
  const effectiveTempDir = fs.existsSync(tempDir) ? tempDir : os.tmpdir();

  const randomId = crypto.randomUUID().slice(0, 8);
  const ext = path.extname(originalFileName) || '.docx';
  const tempInputPath = path.join(effectiveTempDir, `conv_${randomId}${ext}`);
  const expectedPdfPath = path.join(effectiveTempDir, `conv_${randomId}.pdf`);

  try {
    fs.writeFileSync(tempInputPath, inputBuffer);

    let converted = false;

    // Strategy 1: LibreOffice Headless (Extremely fast ~1.5s, 100% isolated, no dialog popups)
    const sofficePath = findSoffice() || 'soffice';
    try {
      console.log(`[DOCX-Converter] Attempting LibreOffice conversion for ${originalFileName}...`);
      await convertViaLibreOffice(tempInputPath, effectiveTempDir, sofficePath);
      if (fs.existsSync(expectedPdfPath)) {
        converted = true;
        console.log(`[DOCX-Converter] ✅ LibreOffice successfully converted ${originalFileName} to PDF!`);
      }
    } catch (loErr) {
      console.warn(`[DOCX-Converter] LibreOffice notice: ${loErr.message}`);
    }

    // Strategy 2: Microsoft Word COM (Fallback)
    if (!converted && process.platform === 'win32') {
      const psScript = findPsScript();
      if (psScript) {
        try {
          console.log(`[DOCX-Converter] Attempting Word COM fallback for ${originalFileName}...`);
          await convertViaWordCom(tempInputPath, expectedPdfPath, psScript);
          if (fs.existsSync(expectedPdfPath)) {
            converted = true;
            console.log(`[DOCX-Converter] ✅ Word COM successfully converted ${originalFileName} to PDF!`);
          }
        } catch (comErr) {
          console.warn(`[DOCX-Converter] Word COM fallback notice: ${comErr.message}`);
        }
      }
    }

    if (converted && fs.existsSync(expectedPdfPath)) {
      const pdfBytes = fs.readFileSync(expectedPdfPath);
      // Clean up temp files safely
      try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
      try { if (fs.existsSync(expectedPdfPath)) fs.unlinkSync(expectedPdfPath); } catch {}
      return pdfBytes;
    }

    throw new Error('All DOCX conversion engines failed or are unavailable');
  } catch (err) {
    console.error('[DOCX-Converter] ❌ Conversion error:', err.message);
    try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
    try { if (fs.existsSync(expectedPdfPath)) fs.unlinkSync(expectedPdfPath); } catch {}
    return null;
  }
}

module.exports = {
  findSoffice,
  findPsScript,
  convertDocxToPdf,
};
