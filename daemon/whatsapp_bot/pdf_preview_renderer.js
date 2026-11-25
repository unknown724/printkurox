/**
 * High-Performance Document & Photo Layout Preview Generator for PrintKurox WhatsApp Bot
 * Uses PyMuPDF + Pillow in Python for instant (<200ms) vector PDF & Image layout rendering.
 * Provides real visual previews directly inside WhatsApp chats instead of web links.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto');

// In-Memory Preview Cache to eliminate redundant rendering (key -> Buffer)
const previewCache = new Map();
const MAX_CACHE_ITEMS = 50;

let _cachedPythonCmd = null;

function findPython() {
  if (_cachedPythonCmd) return _cachedPythonCmd;

  if (process.platform !== 'win32') {
    const linuxCandidates = ['/usr/bin/python3', '/usr/local/bin/python3'];
    for (const c of linuxCandidates) {
      if (fs.existsSync(c)) {
        _cachedPythonCmd = c;
        return c;
      }
    }
    try {
      const { execSync } = require('child_process');
      const out = execSync('command -v python3 || command -v python', { encoding: 'utf8', shell: '/bin/sh' }).trim().split(/\r?\n/);
      if (out[0] && fs.existsSync(out[0])) {
        _cachedPythonCmd = out[0];
        return out[0];
      }
    } catch (e) {}
    _cachedPythonCmd = 'python3';
    return 'python3';
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    localAppData ? path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe') : '',
    localAppData ? path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe') : '',
    localAppData ? path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe') : '',
    'C:\\Program Files\\Python312\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Users\\Devananda Wahengbam\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      _cachedPythonCmd = c;
      return c;
    }
  }

  // Try finding via `where python` (Windows only)
  try {
    const { execSync } = require('child_process');
    const out = execSync('where python', { encoding: 'utf8' }).trim().split(/\r?\n/);
    for (const p of out) {
      if (p && !p.toLowerCase().includes('windowsapps') && fs.existsSync(p)) {
        _cachedPythonCmd = p;
        return p;
      }
    }
  } catch (e) {}

  _cachedPythonCmd = 'python';
  return 'python';
}

/**
 * Generate preview image buffer for WhatsApp chat
 * @param {Object} options
 * @param {Buffer} options.inputBuffer - Raw PDF or image file buffer
 * @param {string} [options.inputPath] - Existing file path on disk if available
 * @param {string} [options.fileName] - Original file name
 * @param {string} [options.colorMode] - 'bw' or 'color'
 * @param {Array<number>|string} [options.selectedPages] - Selected 1-indexed pages (e.g. [1, 2])
 * @returns {Promise<{ buffer: Buffer, metadata: Object } | null>}
 */
async function generatePreviewImage({ inputBuffer, inputPath, fileName = 'document.pdf', colorMode = 'bw', selectedPages = null }) {
  if (!inputBuffer && (!inputPath || !fs.existsSync(inputPath))) {
    return null;
  }

  const mode = (colorMode || 'bw').toLowerCase().includes('color') ? 'color' : 'bw';
  const pagesStr = Array.isArray(selectedPages) && selectedPages.length > 0
    ? selectedPages.slice(0, 4).join(',')
    : '';

  // Check in-memory cache
  let cacheKey = '';
  if (inputBuffer) {
    const hash = crypto.createHash('md5').update(inputBuffer.slice(0, 4096)).digest('hex');
    cacheKey = `${hash}_${inputBuffer.length}_${mode}_${pagesStr}`;
    if (previewCache.has(cacheKey)) {
      return { buffer: previewCache.get(cacheKey), metadata: { cached: true } };
    }
  }

  const pythonExe = findPython();
  const scriptPath = path.join(__dirname, 'render_preview.py');
  if (!fs.existsSync(scriptPath)) {
    console.warn('[Preview-Renderer] render_preview.py not found at:', scriptPath);
    return null;
  }

  const tempDir = path.join(__dirname, '..', 'temp_prints');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const randomId = crypto.randomUUID().slice(0, 8);
  const ext = path.extname(fileName) || (inputBuffer && inputBuffer.slice(0, 4).toString() === '%PDF' ? '.pdf' : '.jpg');
  const tempInputPath = inputPath || path.join(tempDir, `prev_in_${randomId}${ext}`);
  const tempOutputPath = path.join(tempDir, `prev_out_${randomId}.jpg`);
  const needCleanupInput = !inputPath;

  try {
    if (needCleanupInput) {
      fs.writeFileSync(tempInputPath, inputBuffer);
    }

    const args = [
      scriptPath,
      '--input', tempInputPath,
      '--output', tempOutputPath,
      '--color', mode,
      '--dpi', '140',
      '--max-pages', '4'
    ];

    if (pagesStr) {
      args.push('--pages', pagesStr);
    }

    const result = await new Promise((resolve, reject) => {
      execFile(pythonExe, args, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          console.warn('[Preview-Renderer] Python exec error:', error.message, stderr);
          return reject(error);
        }
        try {
          const meta = stdout.trim() ? JSON.parse(stdout.trim().split('\n').pop()) : {};
          resolve(meta);
        } catch (e) {
          resolve({});
        }
      });
    });

    if (fs.existsSync(tempOutputPath)) {
      const imgBuffer = fs.readFileSync(tempOutputPath);

      // Save to in-memory cache
      if (cacheKey && imgBuffer && imgBuffer.length > 0) {
        if (previewCache.size >= MAX_CACHE_ITEMS) {
          const firstKey = previewCache.keys().next().value;
          previewCache.delete(firstKey);
        }
        previewCache.set(cacheKey, imgBuffer);
      }

      // Cleanup temp files
      try { if (needCleanupInput && fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
      try { if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath); } catch {}

      return { buffer: imgBuffer, metadata: result };
    }

    throw new Error('Preview image output was not created');
  } catch (err) {
    console.warn('[Preview-Renderer] Failed to generate preview:', err.message);
    try { if (needCleanupInput && fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
    try { if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath); } catch {}
    return null;
  }
}

module.exports = {
  generatePreviewImage,
};
