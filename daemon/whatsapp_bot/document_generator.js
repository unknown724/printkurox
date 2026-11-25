const path = require('path');
const fs = require('fs');

/**
 * Document & Creative Generation Module for PrintKurox WhatsApp Bot
 * 
 * Capabilities:
 * 1. formatForWhatsApp: Universal WhatsApp markdown & bolding sanitizer.
 * 2. generateApplicationPdf: Vector A4 official NERIST application PDF generator using pdf-lib.
 * 3. generateHtmlGame: Single-file offline playable HTML5 games & interactive tools.
 */

let PDFDocument, StandardFonts, rgb;
try {
  ({ PDFDocument, StandardFonts, rgb } = require('pdf-lib'));
} catch (e) {
  try {
    ({ PDFDocument, StandardFonts, rgb } = require('C:\\PrintKurox\\daemon\\whatsapp_bot\\node_modules\\pdf-lib'));
  } catch (e2) {
    console.warn('[Document Generator] pdf-lib loading fallback:', e2.message);
  }
}

let docxPkg;
try {
  docxPkg = require('docx');
} catch (e) {
  try {
    docxPkg = require('C:\\PrintKurox\\daemon\\whatsapp_bot\\node_modules\\docx');
  } catch (e2) {
    console.warn('[Document Generator] docx loading fallback:', e2.message);
  }
}

const SUBSCRIPT_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ',
  'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ',
  's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
};

const SUPERSCRIPT_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ'
};

function toSubscript(str) {
  return str.split('').map(c => SUBSCRIPT_MAP[c] || c).join('');
}

function toSuperscript(str) {
  return str.split('').map(c => SUPERSCRIPT_MAP[c] || c).join('');
}

/**
 * Converts mathematical and chemical notation (LaTeX, raw formulas) into clean Unicode for WhatsApp
 */
function formatMathAndChemistry(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text;

  // 1. Remove LaTeX math wrapper delimiters: $$, $, \[, \], \(, \)
  s = s.replace(/\$\$(.+?)\$\$/gs, '$1');
  s = s.replace(/\$(.+?)\$/g, '$1');
  s = s.replace(/\\\[(.+?)\\\]/gs, '$1');
  s = s.replace(/\\\((.+?)\\\)/g, '$1');

  // 2. Integral, Summation, Functions BEFORE subscript matching
  s = s.replace(/\\iint(?![a-zA-Z])/g, '∬');
  s = s.replace(/\\iiint(?![a-zA-Z])/g, '∭');
  s = s.replace(/\\oint(?![a-zA-Z])/g, '∮');
  s = s.replace(/\\int(?![a-zA-Z])/g, '∫');
  s = s.replace(/\\sum(?![a-zA-Z])/g, '∑');
  s = s.replace(/\\prod(?![a-zA-Z])/g, '∏');
  s = s.replace(/\\partial(?![a-zA-Z])/g, '∂');
  s = s.replace(/\\nabla(?![a-zA-Z])/g, '∇');
  s = s.replace(/\\lim(?![a-zA-Z])/g, 'lim');
  s = s.replace(/\\sin(?![a-zA-Z])/g, 'sin');
  s = s.replace(/\\cos(?![a-zA-Z])/g, 'cos');
  s = s.replace(/\\tan(?![a-zA-Z])/g, 'tan');
  s = s.replace(/\\log(?![a-zA-Z])/g, 'log');
  s = s.replace(/\\ln(?![a-zA-Z])/g, 'ln');
  s = s.replace(/\\exp(?![a-zA-Z])/g, 'exp');

  // 3. Common LaTeX math symbols & operators
  s = s.replace(/\\times\b|\\cdot\b/g, '×');
  s = s.replace(/\\div\b/g, '÷');
  s = s.replace(/\\pm\b/g, '±');
  s = s.replace(/\\mp\b/g, '∓');
  s = s.replace(/\\neq\b/g, '≠');
  s = s.replace(/\\leq\b/g, '≤');
  s = s.replace(/\\geq\b/g, '≥');
  s = s.replace(/\\approx\b/g, '≈');
  s = s.replace(/\\equiv\b/g, '≡');
  s = s.replace(/\\infty\b/g, '∞');
  s = s.replace(/\\forall\b/g, '∀');
  s = s.replace(/\\exists\b/g, '∃');
  s = s.replace(/\\in\b/g, '∈');
  s = s.replace(/\\notin\b/g, '∉');
  s = s.replace(/\\subset\b/g, '⊂');
  s = s.replace(/\\subseteq\b/g, '⊆');
  s = s.replace(/\\cup\b/g, '∪');
  s = s.replace(/\\cap\b/g, '∩');

  // 4. Greek Letters
  s = s.replace(/\\alpha\b/g, 'α');
  s = s.replace(/\\beta\b/g, 'β');
  s = s.replace(/\\gamma\b/g, 'γ');
  s = s.replace(/\\delta\b/g, 'δ');
  s = s.replace(/\\epsilon\b/g, 'ε');
  s = s.replace(/\\theta\b/g, 'θ');
  s = s.replace(/\\lambda\b/g, 'λ');
  s = s.replace(/\\mu\b/g, 'μ');
  s = s.replace(/\\pi\b/g, 'π');
  s = s.replace(/\\rho\b/g, 'ρ');
  s = s.replace(/\\sigma\b/g, 'σ');
  s = s.replace(/\\tau\b/g, 'τ');
  s = s.replace(/\\phi\b/g, 'φ');
  s = s.replace(/\\omega\b/g, 'ω');
  s = s.replace(/\\Delta\b/g, 'Δ');
  s = s.replace(/\\Omega\b/g, 'Ω');
  s = s.replace(/\\Sigma\b/g, 'Σ');

  // 5. Square Roots & Fractions
  s = s.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)');

  // 6. LaTeX text wrappers: \text{...}, \mathrm{...}
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]+)\}/g, '$1');

  // 7. Reaction arrows
  s = s.replace(/\\(?:rightleftharpoons|iff)\b/g, '⇌');
  s = s.replace(/(?:\\rightarrow\b|\\to\b|(?<=\w|\))\s*->\s*(?=\w|\())/g, ' → ');
  s = s.replace(/\\leftarrow\b|<-/g, ' ← ');

  // 8. Explicit LaTeX Superscript: ^{...} or ^\d
  s = s.replace(/\^\{\s*(?:\\?infty|∞)\s*\}/g, '^∞');
  s = s.replace(/\^\{\s*(?:\\?circ|°)\s*\}/g, '°');
  s = s.replace(/\^\{([0-9+\-nixy=()]+)\}/g, (_, p) => toSuperscript(p) || ('^' + p));
  s = s.replace(/\^([0-9+\-nixy])/g, (_, p) => toSuperscript(p));

  // 9. Explicit LaTeX Subscript: _{...} or _\d
  s = s.replace(/_\{\s*(?:\\?infty|∞)\s*\}/g, '_∞');
  s = s.replace(/_\{([0-9+\-aehijklmnoprstuvx=()]+)\}/g, (_, p) => toSubscript(p) || ('_' + p));
  s = s.replace(/_([0-9+\-aehijklmnoprstuvx])/g, (_, p) => toSubscript(p));

  // 10. Chemical Formula Subscripting:
  // Converts e.g. H2O, CO2, H2SO4, Ca(OH)2, Fe2O3, KMnO4, C6H12O6
  s = s.replace(/([A-Z][a-z]?|\))(\d+)(?=[A-Z\s,.:;)\]+\-→⇌]|$)/g, (match, elem, digits, offset, fullStr) => {
    // Avoid changing standard terms like A4 paper
    if (elem === 'A' && digits === '4' && /\bA4\b/i.test(fullStr.slice(Math.max(0, offset - 1), offset + 3))) return match;
    // Don't convert if inside a normal lowercase word like "step2"
    if (offset > 0 && /[a-z]/i.test(fullStr[offset - 1]) && !/[A-Z]/.test(fullStr[offset - 1])) return match;
    return `${elem}${toSubscript(digits)}`;
  });

  return s;
}

/**
 * Universal WhatsApp Markdown & Bolding Sanitizer
 * Solves the *word * inner whitespace bug, converts **bold** to *bold*,
 * normalizes headers, formats math/chem formulas to Unicode, and fixes bullet conflicts.
 */
function formatForWhatsApp(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text;

  // 0. Format mathematical and chemical formulas into clean Unicode
  s = formatMathAndChemistry(s);

  // 1. Convert markdown headings (### Heading) to clean bold (*Heading*)
  s = s.replace(/^#{1,6}\s*(.+)$/gm, '*$1*');

  // 2. Convert markdown list bullets (* item or + item) to clean round bullet (• item)
  // Must run BEFORE bold parsing so bullet asterisks never get matched as bold delimiters!
  s = s.replace(/^(\s*)[\*\+]\s+/gm, '$1• ');

  // 3. Convert markdown bold+italic (***text***) to WhatsApp bold+italic (*_text_*)
  s = s.replace(/\*\*\*([^\*\n]+?)\*\*\*/g, '*_$1_*');

  // 4. Convert standard markdown bold (**text**) to WhatsApp bold (*text*)
  s = s.replace(/\*\*(.+?)\*\*/gs, '*$1*');

  // 5. WhatsApp bolding rule: opening * has boundary before it, closing * has boundary after it
  // Trims inner whitespace: "*word *" -> "*word*", "* word *" -> "*word*"
  s = s.replace(/(^|[\s([{<])\*([^\*\n]+?)\*([\s)\]}>.,:;!?]|$)/g, (match, prefix, inner, suffix) => {
    const trimmed = inner.trim();
    if (!trimmed) return match;
    return `${prefix}*${trimmed}*${suffix}`;
  });

  // 6. WhatsApp italics rule: opening _ has boundary before it, closing _ has boundary after it
  s = s.replace(/(^|[\s([{<])_([^_\n]+?)_([\s)\]}>.,:;!?]|$)/g, (match, prefix, inner, suffix) => {
    const trimmed = inner.trim();
    if (!trimmed) return match;
    return `${prefix}_${trimmed}_${suffix}`;
  });

  // 7. Normalize bold colon placement (*Note :* -> *Note:*)
  s = s.replace(/\*([^\*\n]+?)\s*:\s*\*/g, '*$1:*');

  // 8. Meta AI White-Line Spacing & Cluster Separation
  // Ensure horizontal divider bars are preceded and followed by clean white-line spacing
  s = s.replace(/([^\n])\n(━{8,}|─{8,})/g, '$1\n$2');
  s = s.replace(/(━{8,}|─{8,})\n([^\n])/g, '$1\n\n$2');

  // Normalize excessive blank lines (3+ consecutive newlines) into standard double newlines
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

/**
 * Wraps long text into lines matching a maximum character width
 */
function wrapText(text, maxCharsPerLine = 75) {
  const paragraphs = text.split('\n');
  const wrappedLines = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      wrappedLines.push('');
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) wrappedLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) wrappedLines.push(currentLine);
  }

  return wrappedLines;
}

/**
 * Strips conversational filler (intros/outros) and extracts pure formal application text.
 * Strictly starts at "To," and ends at the signature block.
 */
function extractPureApplicationText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();

  // Find the start of the formal letter: look for "To," or "*To*" or "To\n"
  const toMatch = text.match(/(?:^|\n)\s*(?:[*#_]{1,3}\s*)?To\s*[,:]?\s*(?:[*#_]{1,3})?\s*(?:\n|$)/i);
  if (toMatch && toMatch.index !== undefined) {
    text = text.slice(toMatch.index).trim();
  } else {
    // Fallback: look for "Subject:" or "Respected"
    const subMatch = text.match(/(?:^|\n)\s*(?:[*#_]{1,3}\s*)?(?:Subject|Respected|Dear)\b/i);
    if (subMatch && subMatch.index !== undefined) {
      text = text.slice(subMatch.index).trim();
      text = `To,\nThe Head of Department,\nNERIST, Nirjuli.\n\n` + text;
    }
  }

  // Ensure it starts cleanly with "To,\n"
  text = text.replace(/^(?:[*#_]{1,3}\s*)?To\s*[,:]?\s*(?:[*#_]{1,3})?\s*\n?/i, 'To,\n');

  // Strip trailing notes, tips, dividers, and conversational filler
  text = text.split(/\n+\s*(?:---|💡|\*Tips|Note:|I hope this helps|Let me know|Need me to draft)/i)[0].trim();
  text = text.replace(/\n+\*+\s*$/g, '').trim();

  return text.trim();
}

/**
 * Cleanly transliterates mathematical symbols, Greek letters, sub/superscripts, and arrows
 * into standard legible WinAnsi notation to prevent pdf-lib encoding crashes and prevent blank spaces.
 */
function sanitizeForPdf(text) {
  if (!text) return '';
  let s = String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022\u25CF\u25CB]/g, '-')
    .replace(/[\u2026]/g, '...')
    // Greek letters
    .replace(/α/g, 'alpha').replace(/β/g, 'beta').replace(/γ/g, 'gamma').replace(/δ/g, 'delta')
    .replace(/ε/g, 'epsilon').replace(/θ/g, 'theta').replace(/λ/g, 'lambda').replace(/μ/g, 'mu')
    .replace(/π/g, 'pi').replace(/ρ/g, 'rho').replace(/σ/g, 'sigma').replace(/τ/g, 'tau')
    .replace(/φ/g, 'phi').replace(/ω/g, 'omega').replace(/Δ/g, 'Delta').replace(/Ω/g, 'Omega')
    .replace(/Σ/g, 'Sigma')
    // Math operators & symbols
    .replace(/∫/g, 'integral').replace(/∑/g, 'sum').replace(/∏/g, 'prod').replace(/√/g, 'sqrt')
    .replace(/∂/g, 'd').replace(/∇/g, 'grad').replace(/∞/g, 'inf').replace(/≈/g, '~=')
    .replace(/≠/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≡/g, '==')
    .replace(/±/g, '+/-').replace(/∓/g, '-/+').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/∈/g, 'in').replace(/∉/g, 'not in').replace(/⊂/g, 'subset').replace(/∪/g, 'cup').replace(/∩/g, 'cap')
    // Superscripts
    .replace(/⁰/g, '^0').replace(/¹/g, '^1').replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/⁴/g, '^4').replace(/⁵/g, '^5').replace(/⁶/g, '^6').replace(/⁷/g, '^7')
    .replace(/⁸/g, '^8').replace(/⁹/g, '^9').replace(/⁺/g, '^+').replace(/⁻/g, '^-')
    .replace(/ⁿ/g, '^n').replace(/ⁱ/g, '^i').replace(/ˣ/g, '^x').replace(/ʸ/g, '^y')
    // Subscripts
    .replace(/₀/g, '_0').replace(/₁/g, '_1').replace(/₂/g, '_2').replace(/₃/g, '_3')
    .replace(/₄/g, '_4').replace(/₅/g, '_5').replace(/₆/g, '_6').replace(/₇/g, '_7')
    .replace(/₈/g, '_8').replace(/₉/g, '_9').replace(/₊/g, '_+').replace(/₋/g, '_-')
    .replace(/ₐ/g, '_a').replace(/ₑ/g, '_e').replace(/ₕ/g, '_h').replace(/ᵢ/g, '_i')
    .replace(/ⱼ/g, '_j').replace(/ₖ/g, '_k').replace(/ₗ/g, '_l').replace(/ₘ/g, '_m')
    .replace(/ₙ/g, '_n').replace(/ₒ/g, '_o').replace(/ₚ/g, '_p').replace(/ᵣ/g, '_r')
    .replace(/ₛ/g, '_s').replace(/ₜ/g, '_t').replace(/ᵤ/g, '_u').replace(/ᵥ/g, '_v').replace(/ₓ/g, '_x')
    // Chemical & Math Arrows
    .replace(/→/g, ' -> ').replace(/←/g, ' <- ').replace(/⇌/g, ' <=> ')
    .replace(/↑/g, ' (g)').replace(/↓/g, ' (s)')
    // Emojis strip
    .replace(/[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{200D}\u{FE0F}]/gu, '')
    // Fallback: strip any remaining non-WinAnsi
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');

  return s;
}

/**
 * Resolves the path to the official NERIST red transparent logo
 */
function getNeristLogoPath() {
  const candidates = [
    path.join(__dirname, 'nerist_logo_red_transparent.png'),
    path.join('C:\\PrintKurox\\daemon\\whatsapp_bot', 'nerist_logo_red_transparent.png'),
    path.join(__dirname, 'nerist_logo_red.png'),
    path.join('C:\\PrintKurox\\daemon\\whatsapp_bot', 'nerist_logo_red.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Compiles a formal academic application into an official vector A4 PDF using pdf-lib
 * @returns {Promise<Buffer>}
 */
async function generateApplicationPdf({
  draftText,
  title = 'Application',
  studentName = 'Student',
  rollNo = '',
  dateStr = '',
  stationName = 'Hostel Block B (Pare)',
}) {
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // A4 dimensions: 595.28 x 841.89 points
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const marginX = 54; // 0.75 in
  let currentY = height - 54;

  // 1. DATE & LOCATION (Clean Academic Header)
  const effectiveDate = sanitizeForPdf(dateStr || new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }));

  page.drawText(`Date: ${effectiveDate}`, {
    x: width - marginX - 130,
    y: currentY,
    size: 10,
    font: timesRoman,
    color: rgb(0.15, 0.15, 0.15),
  });
  page.drawText('Place: Nirjuli', {
    x: marginX,
    y: currentY,
    size: 10,
    font: timesRoman,
    color: rgb(0.15, 0.15, 0.15),
  });
  currentY -= 26;
  page.drawText('Place: Nirjuli (NERIST)', {
    x: marginX,
    y: currentY,
    size: 9.5,
    font: timesRoman,
    color: rgb(0.15, 0.15, 0.15),
  });
  currentY -= 26;

  // 3. APPLICATION BODY
  // Extract pure application text without conversational filler & sanitize emojis
  const pureText = extractPureApplicationText(draftText);
  const cleanBody = sanitizeForPdf(pureText
    .replace(/^["']|["']$/g, '')
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,3}/g, '')
    .replace(/^#+\s*/gm, ''));

  const lines = wrapText(cleanBody, 78);
  const lineHeight = 14;

  for (const line of lines) {
    if (currentY < 70) break; // Keep within single A4 page

    if (!line) {
      currentY -= 8;
      continue;
    }

    const safeLine = sanitizeForPdf(line);
    if (!safeLine) continue;

    const isSubjectLine = /^Subject\s*:/i.test(safeLine);
    const isHeaderLine = /^(To,|Respected|Dear|Sir|Madam|Yours|From,)/i.test(safeLine);

    if (isSubjectLine) {
      currentY -= 4;
      page.drawText(safeLine, {
        x: marginX,
        y: currentY,
        size: 10,
        font: timesBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      currentY -= (lineHeight + 4);
    } else if (isHeaderLine) {
      page.drawText(safeLine, {
        x: marginX,
        y: currentY,
        size: 10,
        font: timesBold,
        color: rgb(0.15, 0.15, 0.15),
      });
      currentY -= lineHeight;
    } else {
      page.drawText(safeLine, {
        x: marginX,
        y: currentY,
        size: 9.5,
        font: timesRoman,
        color: rgb(0.15, 0.15, 0.15),
      });
      currentY -= lineHeight;
    }
  }

  // 4. SIGNATURE BLOCK AT BOTTOM
  const sigY = Math.max(75, Math.min(currentY - 15, 140));

  page.drawLine({
    start: { x: width - marginX - 160, y: sigY + 28 },
    end: { x: width - marginX, y: sigY + 28 },
    thickness: 0.75,
    color: rgb(0.6, 0.6, 0.6),
  });

  page.drawText('(Signature of Student)', {
    x: width - marginX - 145,
    y: sigY + 16,
    size: 8.5,
    font: timesRoman,
    color: rgb(0.4, 0.4, 0.4),
  });

  const studentDisplay = sanitizeForPdf((studentName && studentName !== 'Student') ? studentName : '');
  if (studentDisplay) {
    page.drawText(studentDisplay, {
      x: width - marginX - 160,
      y: sigY + 2,
      size: 9.5,
      font: timesBold,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  if (rollNo) {
    page.drawText(sanitizeForPdf(`Roll No: ${rollNo}`), {
      x: width - marginX - 160,
      y: sigY - 12,
      size: 8.5,
      font: timesRoman,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Compiles an official NERIST Assignment Front Cover into a vector A4 PDF matching the reference format.
 * Exactly calibrated to official NERIST template (TRB_COVER_PAGE.pdf).
 */
async function generateAssignmentCoverPdf({
  subjectName = 'SUBJECT NAME',
  subjectCode = '',
  assignmentTitle = 'ASSIGNMENT',
  studentName = 'NERIST Student',
  rollNo = '',
  registrationNumber = '',
  regNo = '',
  yearSemester = '',
  isCinderacVerified = false,
  teacherName = 'FACULTY MEMBER',
  teacherDesignation = 'Professor',
  department = '',
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // 1. Official Border (matching TRB_COVER_PAGE sample: 25pt margins)
  page.drawRectangle({
    x: 25,
    y: 25,
    width: width - 50,
    height: height - 50,
    borderWidth: 1.25,
    borderColor: rgb(0, 0, 0),
    color: undefined,
  });

  const drawCentered = (rawStr, yFromBottom, font, size, color = rgb(0, 0, 0)) => {
    const text = sanitizeForPdf(rawStr);
    if (!text) return;
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: yFromBottom,
      size,
      font,
      color,
    });
  };

  // Top Section: Title & Subject
  // Calibrated: ASSIGNMENT at ~75pt from top, Subject at ~108pt from top
  const cleanTitle = (assignmentTitle || 'ASSIGNMENT').toUpperCase();
  drawCentered(cleanTitle, height - 75, timesBold, 15);

  const cleanCode = (subjectCode || '').trim().toUpperCase();
  const cleanSubj = (subjectName || '').trim().toUpperCase();
  const fullSubjText = cleanCode ? `${cleanCode}  ${cleanSubj}` : cleanSubj;
  const subjFontSize = fullSubjText.length > 42 ? 11 : 12.5;
  drawCentered(fullSubjText, height - 108, timesBold, subjFontSize);

  // Section 1: Submitted By (Name, Roll No, Registration No, Department — Semester strictly omitted)
  drawCentered('Submitted', height - 155, timesItalic, 12);
  drawCentered('By', height - 177, timesItalic, 12);

  const cleanStudent = (studentName || 'STUDENT').toUpperCase();
  drawCentered(cleanStudent, height - 206, timesBold, 12.5);

  const cleanRoll = (rollNo || '').trim().toUpperCase();
  const cleanRegNo = (registrationNumber || regNo || '').trim();

  let curStudentY = height - 226;
  if (cleanRoll) {
    drawCentered(`Roll No: ${cleanRoll}`, curStudentY, timesBold, 10.5);
    curStudentY -= 19;
  }
  if (cleanRegNo) {
    drawCentered(`Registration No: ${cleanRegNo}`, curStudentY, timesBold, 10.5);
    curStudentY -= 19;
  }
  if (department && department.trim()) {
    const cleanDept = department.trim().toUpperCase().replace(/^DEPARTMENT OF\s+/i, '');
    const deptTitle = `Department of ${cleanDept.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}`;
    drawCentered(deptTitle, curStudentY, timesBold, 10);
    curStudentY -= 19;
  }
  // If verified directly from Cinderac, render the verified semester
  if (isCinderacVerified && yearSemester && yearSemester.trim()) {
    drawCentered(yearSemester.trim(), curStudentY, timesBold, 10);
    curStudentY -= 19;
  }

  // Section 2: Submitted To
  const submittedToY = curStudentY - 18;
  drawCentered('Submitted', submittedToY, timesItalic, 12);
  drawCentered('To', submittedToY - 22, timesItalic, 12);

  const cleanTeacher = (teacherName || 'FACULTY').toUpperCase();
  drawCentered(cleanTeacher, submittedToY - 50, timesBold, 12.5);

  const desigLine = teacherDesignation ? `(${teacherDesignation.replace(/[()]/g, '').trim()})` : '';
  if (desigLine) {
    drawCentered(desigLine, submittedToY - 72, timesBold, 10.5);
  }

  // Section 3: Official Red NERIST Crest (Centered: y=420pt to 578pt from top)
  const logoPath = getNeristLogoPath();
  const logoW = 124;
  const logoH = 158;
  const logoBottomY = height - 578;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const logoBytes = fs.readFileSync(logoPath);
      const logoImg = await pdfDoc.embedPng(logoBytes);
      page.drawImage(logoImg, {
        x: (width - logoW) / 2,
        y: logoBottomY,
        width: logoW,
        height: logoH,
      });
    } catch (e) {
      console.warn('[DocGen] Error embedding NERIST crest in PDF:', e.message);
    }
  }

  // Section 4: Universal Institutional Footer (Calibrated: 638pt down to 738pt from top)
  let footerBaseY = height - 638;
  if (department && department.trim()) {
    drawCentered(`DEPARTMENT OF ${department.trim().toUpperCase()}`, footerBaseY, timesBold, 9.5);
    footerBaseY -= 25;
  } else {
    footerBaseY -= 10;
  }

  drawCentered('NORTH EASTERN REGIONAL INSTITUTE OF SCIENCE AND TECHNOLOGY', footerBaseY, timesBold, 9.5);
  footerBaseY -= 22;
  drawCentered('DEEMED TO BE UNIVERSITY U/S 3 OF THE UGC ACT, 1956', footerBaseY, timesBold, 8);
  footerBaseY -= 23;
  drawCentered('UNDER MINISTRY OF EDUCATION, GOVT. OF INDIA', footerBaseY, timesBold, 8);
  footerBaseY -= 23;
  drawCentered('NIRJULI, ARUNACHAL PRADESH-791109', footerBaseY, timesBold, 8);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Compiles an official NERIST Assignment Front Cover into an editable Microsoft Word (.docx) document
 * Exactly calibrated to official NERIST template (TRB_COVER_PAGE.pdf).
 */
async function generateAssignmentCoverDocx({
  subjectName = 'SUBJECT NAME',
  subjectCode = '',
  assignmentTitle = 'ASSIGNMENT',
  studentName = 'NERIST Student',
  rollNo = '',
  registrationNumber = '',
  regNo = '',
  yearSemester = '',
  isCinderacVerified = false,
  teacherName = 'FACULTY MEMBER',
  teacherDesignation = 'Professor',
  department = '',
}) {
  if (!docxPkg) {
    throw new Error('docx library is not available');
  }
  const { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, BorderStyle } = docxPkg;

  const cleanTitle = (assignmentTitle || 'ASSIGNMENT').toUpperCase();
  const cleanCode = (subjectCode || '').trim().toUpperCase();
  const cleanSubj = (subjectName || '').trim().toUpperCase();
  const fullSubjText = cleanCode ? `${cleanCode}  ${cleanSubj}` : cleanSubj;

  const cleanStudent = (studentName || 'STUDENT').toUpperCase();
  const cleanRoll = (rollNo || '').trim().toUpperCase();
  const cleanRegNo = (registrationNumber || regNo || '').trim();

  const cleanTeacher = (teacherName || 'FACULTY').toUpperCase();
  const desigLine = teacherDesignation ? `(${teacherDesignation.replace(/[()]/g, '').trim()})` : '';

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
      children: [new TextRun({ text: cleanTitle, bold: true, size: 30, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
      children: [new TextRun({ text: fullSubjText, bold: true, size: fullSubjText.length > 40 ? 22 : 26, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 50 },
      children: [new TextRun({ text: 'Submitted', italics: true, size: 24, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: 'By', italics: true, size: 24, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 50 },
      children: [new TextRun({ text: cleanStudent, bold: true, size: 25, font: 'Times New Roman' })],
    }),
  ];

  if (cleanRoll) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: `Roll No: ${cleanRoll}`, bold: true, size: 21, font: 'Times New Roman' })],
      })
    );
  }

  if (cleanRegNo) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: `Registration No: ${cleanRegNo}`, bold: true, size: 21, font: 'Times New Roman' })],
      })
    );
  }

  if (department && department.trim()) {
    const cleanDept = department.trim().toUpperCase().replace(/^DEPARTMENT OF\s+/i, '');
    const deptTitle = `Department of ${cleanDept.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}`;
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: deptTitle, bold: true, size: 20, font: 'Times New Roman' })],
      })
    );
  }

  // If verified directly from Cinderac, render the verified semester
  if (isCinderacVerified && yearSemester && yearSemester.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: yearSemester.trim(), bold: true, size: 20, font: 'Times New Roman' })],
      })
    );
  }

  // Submitted To
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 50 },
      children: [new TextRun({ text: 'Submitted', italics: true, size: 24, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: 'To', italics: true, size: 24, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 50 },
      children: [new TextRun({ text: cleanTeacher, bold: true, size: 25, font: 'Times New Roman' })],
    })
  );

  if (desigLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 440 },
        children: [new TextRun({ text: desigLine, bold: true, size: 22, font: 'Times New Roman' })],
      })
    );
  }

  // Insert Logo (calibrated dimensions: 124x158)
  const logoPath = getNeristLogoPath();
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const logoBytes = fs.readFileSync(logoPath);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 340 },
          children: [
            new ImageRun({
              data: logoBytes,
              transformation: { width: 124, height: 158 },
            }),
          ],
        })
      );
    } catch (e) {}
  }

  if (department && department.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: `DEPARTMENT OF ${department.trim().toUpperCase()}`, bold: true, size: 19, font: 'Times New Roman' })],
      })
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: 'NORTH EASTERN REGIONAL INSTITUTE OF SCIENCE AND TECHNOLOGY', bold: true, size: 19, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 50 },
      children: [new TextRun({ text: 'DEEMED TO BE UNIVERSITY U/S 3 OF THE UGC ACT, 1956', bold: true, size: 16, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 50 },
      children: [new TextRun({ text: 'UNDER MINISTRY OF EDUCATION, GOVT. OF INDIA', bold: true, size: 16, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'NIRJULI, ARUNACHAL PRADESH-791109', bold: true, size: 16, font: 'Times New Roman' })],
    })
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 500, bottom: 500, left: 500, right: 500 },
          borders: {
            pageBorderTop: { style: BorderStyle.SINGLE, size: 10, color: '000000' },
            pageBorderBottom: { style: BorderStyle.SINGLE, size: 10, color: '000000' },
            pageBorderLeft: { style: BorderStyle.SINGLE, size: 10, color: '000000' },
            pageBorderRight: { style: BorderStyle.SINGLE, size: 10, color: '000000' },
          },
        },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Generates an official editable Microsoft Word (.docx) application document
 * @returns {Promise<Buffer>}
 */
async function generateApplicationDocx({
  draftText,
  title = 'Application',
  studentName = 'Student',
  rollNo = '',
  dateStr = '',
}) {
  if (!docxPkg) {
    throw new Error('Word DOCX generation library is not loaded');
  }
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType } = docxPkg;
  const cleanBody = extractPureApplicationText(draftText)
    .replace(/^["']|["']$/g, '')
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,3}/g, '');

  const effectiveDate = dateStr || new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const paragraphs = [];

  // 1. Institutional Header
  paragraphs.push(new Paragraph({
    text: 'NORTH EASTERN REGIONAL INSTITUTE OF SCIENCE & TECHNOLOGY',
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.CENTER,
  }));
  paragraphs.push(new Paragraph({
    text: '(Deemed to be University u/s 3 of UGC Act, 1956 — MoE, Govt. of India)',
    alignment: AlignmentType.CENTER,
  }));
  paragraphs.push(new Paragraph({
    text: 'Nirjuli (Itanagar), Papum Pare District, Arunachal Pradesh - 791109',
    alignment: AlignmentType.CENTER,
  }));
  paragraphs.push(new Paragraph({ text: '' }));

  // 2. Date
  paragraphs.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ text: `Date: ${effectiveDate}`, bold: true }),
    ],
  }));
  paragraphs.push(new Paragraph({ text: '' }));

  // 3. Body lines
  const rawLines = cleanBody.split('\n');
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }
    const isSubjectLine = /^Subject\s*:/i.test(line);
    const isHeaderLine = /^(To,|Respected|Dear|Sir|Madam|Yours|From,)/i.test(line);

    if (isSubjectLine) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: line, bold: true, underline: { type: UnderlineType.SINGLE } }),
        ],
      }));
    } else if (isHeaderLine) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: line, bold: true }),
        ],
      }));
    } else {
      paragraphs.push(new Paragraph({
        text: line,
      }));
    }
  }

  // 4. Student Signature Block
  paragraphs.push(new Paragraph({ text: '' }));
  paragraphs.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ text: '________________________\n', bold: false }),
      new TextRun({ text: '(Signature of Student)\n', italics: true }),
      studentName && studentName !== 'Student' ? new TextRun({ text: `${studentName}\n`, bold: true }) : new TextRun({ text: '' }),
      rollNo ? new TextRun({ text: `Roll No: ${rollNo}\n` }) : new TextRun({ text: '' }),
    ],
  }));

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Generates self-contained, single-file offline playable HTML5 games & interactive tools
 */
function generateHtmlGame(gameType = 'snake', options = {}) {
  const type = (gameType || 'snake').toLowerCase();

  if (type.includes('ludo')) {
    return generateLudoGameHtml(options);
  } else if (type.includes('snake')) {
    return generateSnakeGameHtml(options);
  } else if (type.includes('tic') || type.includes('toe')) {
    return generateTicTacToeHtml(options);
  } else if (type.includes('sgpa') || type.includes('gpa') || type.includes('cgpa')) {
    return generateSgpaCalculatorHtml(options);
  } else if (type.includes('2048')) {
    return generate2048Html(options);
  }

  return generateSnakeGameHtml(options);
}

function generateLudoGameHtml({ title = 'NERIST Campus Ludo Club', studentName = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} · Agent Kurox</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
    body {
      background: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 8px;
    }
    header { text-align: center; margin-bottom: 6px; }
    h1 { font-size: 19px; color: #38bdf8; font-weight: 800; }
    .status-bar {
      display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 350px;
      background: #1e293b; padding: 6px 12px; border-radius: 8px; margin-bottom: 8px; border: 1px solid #334155;
    }
    .turn-pill { display: flex; align-items: center; gap: 6px; font-weight: bold; font-size: 13px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.red { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
    .dot.blue { background: #3b82f6; box-shadow: 0 0 8px #3b82f6; }
    #board-container {
      width: 100%; max-width: 350px; aspect-ratio: 1; background: #0f172a; border: 3px solid #334155;
      border-radius: 12px; position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    }
    .board-grid {
      display: grid; grid-template-columns: repeat(15, 1fr); grid-template-rows: repeat(15, 1fr); width: 100%; height: 100%;
    }
    .cell {
      border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;
      position: relative; font-size: 9px;
    }
    .yard-red { background: rgba(239, 68, 68, 0.25); }
    .yard-green { background: rgba(34, 197, 94, 0.15); }
    .yard-yellow { background: rgba(234, 179, 8, 0.15); }
    .yard-blue { background: rgba(59, 130, 246, 0.25); }
    .center-home { background: radial-gradient(circle, #6366f1 20%, #1e1b4b 80%); }
    .path-red { background: #dc2626; }
    .path-blue { background: #2563eb; }
    .safe-star::after { content: '⭐'; font-size: 8px; opacity: 0.9; }
    .token {
      width: 82%; height: 82%; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 900; z-index: 5;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .token.red { background: #ef4444; color: white; }
    .token.blue { background: #3b82f6; color: white; }
    .token.pulsing {
      animation: pulseGlow 0.7s infinite alternate; cursor: pointer; border-color: #facc15;
    }
    @keyframes pulseGlow {
      from { transform: scale(1.05); box-shadow: 0 0 6px #facc15; }
      to { transform: scale(1.25); box-shadow: 0 0 16px #facc15; }
    }
    .controls {
      display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 8px; width: 100%; max-width: 350px;
    }
    .dice-btn {
      flex: 1; background: linear-gradient(135deg, #2563eb, #1d4ed8); border: none; color: white; padding: 10px;
      border-radius: 10px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center;
      justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(37,99,235,0.4);
    }
    .dice-btn:active { transform: scale(0.97); }
    .dice-btn:disabled { background: #334155; opacity: 0.6; cursor: not-allowed; }
    .dice-cube {
      width: 28px; height: 28px; background: white; color: #0f172a; border-radius: 6px; display: flex;
      align-items: center; justify-content: center; font-size: 16px; font-weight: 900; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .log-box {
      width: 100%; max-width: 350px; background: #1e293b; border: 1px solid #334155; border-radius: 8px;
      padding: 6px 10px; margin-top: 6px; font-size: 11px; color: #94a3b8; min-height: 26px; text-align: center;
    }
    footer { margin-top: 6px; font-size: 10px; color: #64748b; }
  </style>
</head>
<body>
  <header>
    <h1>🎲 ${title}</h1>
  </header>

  <div class="status-bar">
    <div class="turn-pill">
      <span class="dot red" id="turn-dot"></span>
      <span id="turn-text">Player RED's Turn</span>
    </div>
    <div style="font-size: 11px; color: #94a3b8;">
      Red: <b id="score-red" style="color: #ef4444;">0/2 Home</b> | Blue: <b id="score-blue" style="color: #3b82f6;">0/2 Home</b>
    </div>
  </div>

  <div id="board-container">
    <div class="board-grid" id="grid"></div>
  </div>

  <div class="controls">
    <button class="dice-btn" id="roll-btn" onclick="rollDice()">
      <div class="dice-cube" id="dice-val">🎲</div>
      <span id="btn-text">Roll Dice</span>
    </button>
  </div>

  <div class="log-box" id="status-log">Roll the dice to start! (Roll 6 to spawn a pawn)</div>

  <footer>Agent Kurox Offline Games · NERIST Campus</footer>

  <script>
    const TRACK = [
      [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
      [0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
      [7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
      [14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
      [7,0],[6,0]
    ];

    const audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;
    function playSfx(f, dur = 0.08) {
      if (!audioCtx) return;
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.1, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
      } catch(e) {}
    }

    let turn = 'RED';
    let dice = 0;
    let isRolling = false;
    let waitingForSelection = false;

    const tokens = {
      RED: [{ id: 0, pos: -1 }, { id: 1, pos: -1 }],
      BLUE: [{ id: 0, pos: -1 }, { id: 1, pos: -1 }]
    };

    function getCoords(player, id, pos) {
      if (pos === -1) {
        if (player === 'RED') return id === 0 ? [2, 2] : [3, 3];
        return id === 0 ? [11, 11] : [12, 12];
      }
      if (pos >= 0 && pos <= 50) {
        const offset = player === 'RED' ? 0 : 26;
        return TRACK[(offset + pos) % 52];
      }
      if (pos >= 51 && pos <= 55) {
        const hIdx = pos - 51;
        if (player === 'RED') return [7, 1 + hIdx];
        return [7, 13 - hIdx];
      }
      return [7, 7];
    }

    function rollDice() {
      if (isRolling || waitingForSelection) return;
      isRolling = true;
      document.getElementById('roll-btn').disabled = true;

      let cnt = 0;
      const anim = setInterval(() => {
        playSfx(200 + cnt * 25, 0.03);
        document.getElementById('dice-val').textContent = Math.floor(Math.random() * 6) + 1;
        cnt++;
        if (cnt > 7) {
          clearInterval(anim);
          dice = Math.floor(Math.random() * 6) + 1;
          document.getElementById('dice-val').textContent = dice;
          playSfx(550, 0.12);
          isRolling = false;
          handleDiceResult();
        }
      }, 50);
    }

    function handleDiceResult() {
      const pTokens = tokens[turn];
      const validMoves = [];

      pTokens.forEach(t => {
        if (t.pos === -1) {
          if (dice === 6) validMoves.push(t);
        } else if (t.pos + dice <= 56) {
          validMoves.push(t);
        }
      });

      if (validMoves.length === 0) {
        document.getElementById('status-log').textContent = turn + ' rolled ' + dice + '. No valid moves! Next turn.';
        passTurn();
      } else if (validMoves.length === 1) {
        document.getElementById('status-log').textContent = turn + ' rolled ' + dice + '! Moving pawn...';
        movePawn(validMoves[0].id);
      } else {
        waitingForSelection = true;
        document.getElementById('status-log').innerHTML = '👉 <b>' + turn + ' rolled ' + dice + '!</b> Tap a glowing pawn to move.';
        highlightValidTokens(validMoves);
      }
    }

    function highlightValidTokens(validMoves) {
      renderBoard(validMoves.map(t => t.id));
    }

    function movePawn(pawnId) {
      waitingForSelection = false;
      const pawn = tokens[turn].find(t => t.id === pawnId);
      if (!pawn) return;

      if (pawn.pos === -1) {
        pawn.pos = 0;
        playSfx(440, 0.1);
      } else {
        pawn.pos += dice;
        playSfx(380, 0.08);
      }

      if (pawn.pos >= 0 && pawn.pos <= 50) {
        const offset = turn === 'RED' ? 0 : 26;
        const pawnTrackIdx = (offset + pawn.pos) % 52;
        const opponent = turn === 'RED' ? 'BLUE' : 'RED';
        const oppOffset = opponent === 'RED' ? 0 : 26;

        if (pawnTrackIdx !== 0 && pawnTrackIdx !== 26) {
          tokens[opponent].forEach(oppPawn => {
            if (oppPawn.pos >= 0 && oppPawn.pos <= 50) {
              const oppTrackIdx = (oppOffset + oppPawn.pos) % 52;
              if (oppTrackIdx === pawnTrackIdx) {
                oppPawn.pos = -1;
                playSfx(880, 0.2);
                document.getElementById('status-log').textContent = '💥 KNOCKOUT! ' + turn + ' captured ' + opponent + "\'s pawn! Roll again!";
                renderBoard();
                document.getElementById('roll-btn').disabled = false;
                return;
              }
            }
          });
        }
      }

      const redHome = tokens.RED.filter(t => t.pos === 56).length;
      const blueHome = tokens.BLUE.filter(t => t.pos === 56).length;
      document.getElementById('score-red').textContent = redHome + '/2 Home';
      document.getElementById('score-blue').textContent = blueHome + '/2 Home';

      if (redHome === 2 || blueHome === 2) {
        const winner = redHome === 2 ? 'RED' : 'BLUE';
        document.getElementById('status-log').innerHTML = '🏆 <b>PLAYER ' + winner + ' WINS THE GAME!</b> 🎉';
        playSfx(900, 0.4);
        renderBoard();
        return;
      }

      if (dice === 6) {
        document.getElementById('status-log').textContent = '🎉 Rolled a 6! ' + turn + ' rolls again!';
        document.getElementById('roll-btn').disabled = false;
      } else {
        passTurn();
      }
      renderBoard();
    }

    function passTurn() {
      turn = turn === 'RED' ? 'BLUE' : 'RED';
      document.getElementById('turn-text').textContent = "Player " + turn + "'s Turn";
      document.getElementById('turn-dot').className = 'dot ' + turn.toLowerCase();
      document.getElementById('roll-btn').disabled = false;
      renderBoard();
    }

    function renderBoard(pulseIds = []) {
      const grid = document.getElementById('grid');
      grid.innerHTML = '';

      for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
          const cell = document.createElement('div');
          cell.className = 'cell';

          if (r < 6 && c < 6) cell.className += ' yard-red';
          else if (r < 6 && c > 8) cell.className += ' yard-green';
          else if (r > 8 && c < 6) cell.className += ' yard-yellow';
          else if (r > 8 && c > 8) cell.className += ' yard-blue';
          else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) cell.className += ' center-home';
          else if (r === 7 && c > 0 && c < 6) cell.className += ' path-red';
          else if (r === 7 && c > 8 && c < 14) cell.className += ' path-blue';

          if ((r === 6 && c === 1) || (r === 8 && c === 13) || (r === 2 && c === 8) || (r === 12 && c === 6)) {
            cell.className += ' safe-star';
          }

          if (r === 7 && c === 7) {
            cell.innerHTML = '🏆';
          }

          ['RED', 'BLUE'].forEach(p => {
            tokens[p].forEach(t => {
              const [tr, tc] = getCoords(p, t.id, t.pos);
              if (tr === r && tc === c) {
                const tokDiv = document.createElement('div');
                tokDiv.className = 'token ' + p.toLowerCase();
                tokDiv.textContent = (p === 'RED' ? 'R' : 'B') + (t.id + 1);
                if (waitingForSelection && p === turn && pulseIds.includes(t.id)) {
                  tokDiv.className += ' pulsing';
                  tokDiv.onclick = () => movePawn(t.id);
                }
                cell.appendChild(tokDiv);
              }
            });
          });

          grid.appendChild(cell);
        }
      }
    }

    renderBoard();
  </script>
</body>
</html>`;
}

function generateSnakeGameHtml({ title = 'NERIST Retro Snake' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} · Agent Kurox</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
    body {
      background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 12px;
    }
    header { text-align: center; margin-bottom: 8px; }
    h1 { font-size: 20px; color: #58a6ff; letter-spacing: 0.5px; }
    .speed-bar {
      display: flex; gap: 6px; margin-top: 6px; margin-bottom: 8px; justify-content: center;
    }
    .speed-btn {
      background: #21262d; border: 1px solid #30363d; color: #8b949e; font-size: 11px; padding: 4px 10px;
      border-radius: 6px; cursor: pointer; font-weight: bold;
    }
    .speed-btn.active {
      background: #238636; color: white; border-color: #2ea043;
    }
    .scoreboard {
      display: flex; gap: 20px; font-size: 13px; color: #8b949e; margin-bottom: 8px;
    }
    .scoreboard span { color: #3fb950; font-weight: bold; }
    #canvas-container {
      position: relative; background: #161b22; border: 2px solid #30363d; border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    canvas { display: block; border-radius: 6px; }
    #overlay {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(13, 17, 23, 0.9);
      display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 6px;
    }
    #overlay h2 { font-size: 22px; color: #f85149; margin-bottom: 8px; }
    #overlay p { font-size: 13px; color: #8b949e; margin-bottom: 16px; text-align: center; }
    .btn {
      background: #238636; color: white; border: none; padding: 10px 24px; font-size: 14px;
      font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 12px rgba(35,134,54,0.4);
    }
    .btn:active { transform: scale(0.96); }
    /* Mobile D-Pad */
    #dpad {
      margin-top: 10px; display: grid; grid-template-columns: repeat(3, 54px); grid-template-rows: repeat(3, 54px); gap: 6px;
    }
    .d-btn {
      background: #21262d; border: 1px solid #30363d; border-radius: 10px; color: #c9d1d9; font-size: 20px;
      display: flex; align-items: center; justify-content: center; touch-action: manipulation;
    }
    .d-btn:active { background: #388bfd; color: white; }
    #d-up { grid-column: 2; grid-row: 1; }
    #d-left { grid-column: 1; grid-row: 2; }
    #d-right { grid-column: 3; grid-row: 2; }
    #d-down { grid-column: 2; grid-row: 3; }
    footer { margin-top: 8px; font-size: 10px; color: #6e7681; }
  </style>
</head>
<body>
  <header>
    <h1>🐍 ${title}</h1>
    <div class="speed-bar">
      <button class="speed-btn" onclick="setSpeed(120, this)">🐢 Slow</button>
      <button class="speed-btn active" onclick="setSpeed(75, this)">🐇 Normal</button>
      <button class="speed-btn" onclick="setSpeed(45, this)">⚡ Fast</button>
      <button class="speed-btn" onclick="setSpeed(28, this)">🔥 Blitz</button>
      <button class="speed-btn" id="sfx-toggle" onclick="toggleSfx()">🔊 SFX</button>
    </div>
    <div class="scoreboard">
      <div>Score: <span id="score">0</span></div>
      <div>Best: <span id="best">0</span></div>
    </div>
  </header>

  <div id="canvas-container">
    <canvas id="game" width="300" height="300"></canvas>
    <div id="overlay">
      <h2 id="ov-title">Snake Arcade</h2>
      <p id="ov-sub">Swipe, use Arrow keys or D-Pad below!</p>
      <button class="btn" id="start-btn" onclick="startGame()">Start Game</button>
    </div>
  </div>

  <div id="dpad">
    <div class="d-btn" id="d-up" onclick="setDir('UP')">▲</div>
    <div class="d-btn" id="d-left" onclick="setDir('LEFT')">◀</div>
    <div class="d-btn" id="d-right" onclick="setDir('RIGHT')">▶</div>
    <div class="d-btn" id="d-down" onclick="setDir('DOWN')">▼</div>
  </div>

  <footer>Agent Kurox Offline Games · NERIST Campus</footer>

  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const grid = 15;
    let snake = [{ x: 9, y: 9 }];
    let food = { x: 5, y: 5 };
    let dir = 'RIGHT';
    let nextDir = 'RIGHT';
    let score = 0;
    let speedMs = 75;
    let sfxEnabled = true;
    let best = localStorage.getItem('kurox_snake_best') || 0;
    document.getElementById('best').innerText = best;
    let gameLoop = null;

    const audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;
    function playTone(freq, dur = 0.08, type = 'square') {
      if (!audioCtx || !sfxEnabled) return;
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.08, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
      } catch(e) {}
    }

    function toggleSfx() {
      sfxEnabled = !sfxEnabled;
      document.getElementById('sfx-toggle').innerText = sfxEnabled ? '🔊 SFX' : '🔇 Muted';
    }

    function setSpeed(ms, btn) {
      speedMs = ms;
      document.querySelectorAll('.speed-btn').forEach(b => {
        if (b !== document.getElementById('sfx-toggle')) b.classList.remove('active');
      });
      if (btn) btn.classList.add('active');
      if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = setInterval(update, speedMs);
      }
    }

    function spawnFood() {
      food = {
        x: Math.floor(Math.random() * (canvas.width / grid)),
        y: Math.floor(Math.random() * (canvas.height / grid)),
      };
    }

    function setDir(d) {
      if (d === 'UP' && dir !== 'DOWN') { nextDir = 'UP'; playTone(280, 0.03, 'triangle'); }
      if (d === 'DOWN' && dir !== 'UP') { nextDir = 'DOWN'; playTone(280, 0.03, 'triangle'); }
      if (d === 'LEFT' && dir !== 'RIGHT') { nextDir = 'LEFT'; playTone(280, 0.03, 'triangle'); }
      if (d === 'RIGHT' && dir !== 'LEFT') { nextDir = 'RIGHT'; playTone(280, 0.03, 'triangle'); }
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'w') setDir('UP');
      if (e.key === 'ArrowDown' || e.key === 's') setDir('DOWN');
      if (e.key === 'ArrowLeft' || e.key === 'a') setDir('LEFT');
      if (e.key === 'ArrowRight' || e.key === 'd') setDir('RIGHT');
    });

    let touchStartX = 0, touchStartY = 0;
    canvas.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });
    canvas.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 25) setDir('RIGHT');
        else if (dx < -25) setDir('LEFT');
      } else {
        if (dy > 25) setDir('DOWN');
        else if (dy < -25) setDir('UP');
      }
    });

    function update() {
      dir = nextDir;
      const head = { ...snake[0] };
      if (dir === 'UP') head.y--;
      if (dir === 'DOWN') head.y++;
      if (dir === 'LEFT') head.x--;
      if (dir === 'RIGHT') head.x++;

      if (head.x < 0 || head.x >= canvas.width / grid || head.y < 0 || head.y >= canvas.height / grid) {
        return gameOver();
      }
      if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        return gameOver();
      }

      snake.unshift(head);

      if (head.x === food.x && head.y === food.y) {
        score += 10;
        document.getElementById('score').innerText = score;
        playTone(600, 0.08, 'sine');
        setTimeout(() => playTone(820, 0.1, 'sine'), 50);
        if (score > best) {
          best = score;
          localStorage.setItem('kurox_snake_best', best);
          document.getElementById('best').innerText = best;
        }
        spawnFood();
      } else {
        snake.pop();
      }

      draw();
    }

    function draw() {
      ctx.fillStyle = '#161b22';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Food
      ctx.fillStyle = '#f85149';
      ctx.beginPath();
      ctx.arc((food.x + 0.5) * grid, (food.y + 0.5) * grid, grid / 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Snake
      snake.forEach((segment, idx) => {
        ctx.fillStyle = idx === 0 ? '#58a6ff' : '#238636';
        ctx.fillRect(segment.x * grid + 1, segment.y * grid + 1, grid - 2, grid - 2);
      });
    }

    function startGame() {
      document.getElementById('overlay').style.display = 'none';
      snake = [{ x: 9, y: 9 }, { x: 8, y: 9 }];
      dir = 'RIGHT';
      nextDir = 'RIGHT';
      score = 0;
      document.getElementById('score').innerText = 0;
      spawnFood();
      if (gameLoop) clearInterval(gameLoop);
      gameLoop = setInterval(update, speedMs);
    }

    function gameOver() {
      clearInterval(gameLoop);
      playTone(180, 0.2, 'sawtooth');
      setTimeout(() => playTone(120, 0.3, 'sawtooth'), 180);
      document.getElementById('ov-title').innerText = 'Game Over!';
      document.getElementById('ov-sub').innerText = 'Final Score: ' + score;
      document.getElementById('start-btn').innerText = 'Play Again';
      document.getElementById('overlay').style.display = 'flex';
    }
  </script>
</body>
</html>`;
}

function generateTicTacToeHtml({ title = 'NERIST Cyber Tic-Tac-Toe' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} · Agent Kurox</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    body {
      background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 12px;
    }
    h1 { color: #58a6ff; font-size: 20px; margin-bottom: 6px; }
    .mode-bar {
      display: flex; gap: 8px; margin-bottom: 8px;
    }
    .mode-btn {
      background: #21262d; border: 1px solid #30363d; color: #8b949e; font-size: 11px; padding: 4px 12px;
      border-radius: 6px; cursor: pointer; font-weight: bold;
    }
    .mode-btn.active { background: #388bfd; color: white; border-color: #58a6ff; }
    .scoreboard {
      display: flex; gap: 16px; font-size: 12px; color: #8b949e; margin-bottom: 8px;
    }
    .scoreboard b { color: #f0f6fc; }
    #status { font-size: 14px; margin-bottom: 10px; color: #3fb950; font-weight: bold; }
    .grid {
      display: grid; grid-template-columns: repeat(3, 80px); grid-template-rows: repeat(3, 80px); gap: 6px;
      background: #21262d; padding: 8px; border-radius: 12px; border: 2px solid #30363d; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .cell {
      background: #161b22; border-radius: 8px; display: flex; align-items: center; justify-content: center;
      font-size: 34px; font-weight: bold; cursor: pointer; transition: 0.15s;
    }
    .cell:active { background: #30363d; }
    .cell.x { color: #58a6ff; }
    .cell.o { color: #f85149; }
    .cell.win { background: rgba(56, 189, 248, 0.25); border: 2px solid #38bdf8; }
    .log-container {
      width: 100%; max-width: 280px; background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 6px 10px; margin-top: 10px; max-height: 70px; overflow-y: auto; font-size: 11px; color: #8b949e;
    }
    .btn {
      margin-top: 10px; background: #238636; color: white; border: none; padding: 8px 20px; font-size: 13px;
      font-weight: bold; border-radius: 6px; cursor: pointer;
    }
    footer { margin-top: 10px; font-size: 10px; color: #6e7681; }
  </style>
</head>
<body>
  <h1>⭕ ${title}</h1>
  <div class="mode-bar">
    <button class="mode-btn active" id="btn-p2" onclick="setMode('2P')">👥 2 Players (Pass & Play)</button>
    <button class="mode-btn" id="btn-ai" onclick="setMode('AI')">🤖 vs Kurox AI</button>
  </div>
  <div class="scoreboard">
    <div>Player 1 (X): <b id="s-x">0</b></div>
    <div>Player 2 (O): <b id="s-o">0</b></div>
    <div>Draws: <b id="s-d">0</b></div>
  </div>
  <div id="status">Player 1 (X)'s Turn</div>
  <div class="grid" id="board"></div>
  <div class="log-container" id="move-log">Game started! Player 1 (X) to move.</div>
  <button class="btn" onclick="reset()">New Round</button>
  <footer>Agent Kurox Offline Games · NERIST Campus</footer>

  <script>
    let board = Array(9).fill('');
    let turn = 'X';
    let active = true;
    let mode = '2P';
    let scores = { X: 0, O: 0, D: 0 };
    const posNames = ['Top-Left', 'Top-Center', 'Top-Right', 'Mid-Left', 'Center', 'Mid-Right', 'Bottom-Left', 'Bottom-Center', 'Bottom-Right'];

    function setMode(m) {
      mode = m;
      document.getElementById('btn-p2').classList.toggle('active', m === '2P');
      document.getElementById('btn-ai').classList.toggle('active', m === 'AI');
      reset();
    }

    function render() {
      const container = document.getElementById('board');
      container.innerHTML = '';
      board.forEach((val, idx) => {
        const div = document.createElement('div');
        div.className = 'cell ' + (val ? val.toLowerCase() : '');
        div.innerText = val;
        div.onclick = () => tap(idx);
        container.appendChild(div);
      });
    }

    function tap(i) {
      if (!active || board[i]) return;
      makeMove(i, turn);

      if (active && mode === 'AI' && turn === 'O') {
        setTimeout(aiMove, 300);
      }
    }

    function makeMove(i, p) {
      board[i] = p;
      const log = document.getElementById('move-log');
      const pName = p === 'X' ? 'Player 1 (X)' : (mode === 'AI' ? 'Kurox AI (O)' : 'Player 2 (O)');
      log.innerHTML = '• <b>' + pName + '</b> played ' + posNames[i] + '<br>' + log.innerHTML;
      render();

      const winCombo = getWinCombo(p);
      if (winCombo) {
        winCombo.forEach(idx => {
          document.querySelectorAll('.cell')[idx].classList.add('win');
        });
        document.getElementById('status').innerText = '🎉 ' + pName + ' Wins!';
        scores[p]++;
        updateScore();
        active = false;
        return;
      }
      if (board.every(Boolean)) {
        document.getElementById('status').innerText = "🤝 It's a Draw!";
        scores.D++;
        updateScore();
        active = false;
        return;
      }
      turn = turn === 'X' ? 'O' : 'X';
      const nextName = turn === 'X' ? 'Player 1 (X)' : (mode === 'AI' ? 'Kurox AI (O)' : 'Player 2 (O)');
      document.getElementById('status').innerText = nextName + "'s Turn";
    }

    function aiMove() {
      if (!active) return;
      // Win check
      for (let i = 0; i < 9; i++) {
        if (!board[i]) {
          board[i] = 'O';
          if (getWinCombo('O')) { board[i] = ''; return makeMove(i, 'O'); }
          board[i] = '';
        }
      }
      // Block check
      for (let i = 0; i < 9; i++) {
        if (!board[i]) {
          board[i] = 'X';
          if (getWinCombo('X')) { board[i] = ''; return makeMove(i, 'O'); }
          board[i] = '';
        }
      }
      // Center
      if (!board[4]) return makeMove(4, 'O');
      // Corners
      const corners = [0, 2, 6, 8].filter(c => !board[c]);
      if (corners.length > 0) return makeMove(corners[Math.floor(Math.random() * corners.length)], 'O');
      // Any
      const open = board.map((v, i) => v ? null : i).filter(v => v !== null);
      if (open.length > 0) makeMove(open[0], 'O');
    }

    function getWinCombo(p) {
      const wins = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
      ];
      return wins.find(w => w.every(idx => board[idx] === p));
    }

    function updateScore() {
      document.getElementById('s-x').innerText = scores.X;
      document.getElementById('s-o').innerText = scores.O;
      document.getElementById('s-d').innerText = scores.D;
    }

    function reset() {
      board = Array(9).fill('');
      turn = 'X';
      active = true;
      document.getElementById('status').innerText = "Player 1 (X)'s Turn";
      document.getElementById('move-log').innerText = 'New round started! Player 1 (X) to move.';
      render();
    }
    render();
  </script>
</body>
</html>`;
}

function generateSgpaCalculatorHtml({ title = 'NERIST SGPA / CGPA Calculator' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} · Agent Kurox</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1117; color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 16px; display: flex; flex-direction: column; align-items: center;
    }
    h1 { color: #58a6ff; font-size: 19px; margin-bottom: 4px; text-align: center; }
    p.sub { font-size: 12px; color: #8b949e; margin-bottom: 16px; text-align: center; }
    .card {
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 16px; width: 100%; max-width: 420px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-bottom: 10px; align-items: center; }
    .header { font-size: 12px; font-weight: bold; color: #58a6ff; }
    input, select {
      background: #0d1117; border: 1px solid #30363d; color: white;
      padding: 8px; border-radius: 6px; font-size: 13px; width: 100%;
    }
    .result-box {
      margin-top: 16px; padding: 14px; background: #21262d; border-radius: 8px;
      text-align: center; border: 1px solid #388bfd;
    }
    .result-box h2 { font-size: 26px; color: #3fb950; }
    .result-box p { font-size: 12px; color: #8b949e; margin-top: 4px; }
    footer { margin-top: 14px; font-size: 11px; color: #6e7681; }
  </style>
</head>
<body>
  <h1>🎓 ${title}</h1>
  <p class="sub">NERIST 10-Point Grading System (O:10, A+:9, A:8, B+:7, B:6, C:5, F:0)</p>

  <div class="card">
    <div class="row header">
      <div>Subject Name</div>
      <div>Credits</div>
      <div>Grade</div>
    </div>
    <div id="subjects"></div>

    <div class="result-box">
      <div style="font-size: 12px; color: #c9d1d9;">Calculated SGPA:</div>
      <h2 id="sgpa-val">0.00</h2>
      <p id="total-credits">Total Credits: 0</p>
    </div>
  </div>

  <footer>Built by Agent Kurox for NERIST Students</footer>

  <script>
    const gradePoints = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'D': 4, 'F': 0 };
    const defaultSubs = [
      { name: 'Theory Paper 1', credit: 4 },
      { name: 'Theory Paper 2', credit: 4 },
      { name: 'Theory Paper 3', credit: 3 },
      { name: 'Theory Paper 4', credit: 3 },
      { name: 'Department Elective', credit: 3 },
      { name: 'Laboratory 1', credit: 2 },
      { name: 'Laboratory 2', credit: 2 },
    ];

    function render() {
      const container = document.getElementById('subjects');
      container.innerHTML = '';
      defaultSubs.forEach((sub, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = \`
          <input type="text" value="\${sub.name}">
          <input type="number" id="c-\${i}" value="\${sub.credit}" min="1" max="10" onchange="calc()">
          <select id="g-\${i}" onchange="calc()">
            <option value="O">O (10)</option>
            <option value="A+" selected>A+ (9)</option>
            <option value="A">A (8)</option>
            <option value="B+">B+ (7)</option>
            <option value="B">B (6)</option>
            <option value="C">C (5)</option>
            <option value="F">F (0)</option>
          </select>
        \`;
        container.appendChild(row);
      });
      calc();
    }

    function calc() {
      let totalPts = 0;
      let totalCredits = 0;
      defaultSubs.forEach((_, i) => {
        const credit = parseFloat(document.getElementById('c-' + i).value) || 0;
        const grade = document.getElementById('g-' + i).value;
        const pts = gradePoints[grade] || 0;
        totalPts += (credit * pts);
        totalCredits += credit;
      });
      const sgpa = totalCredits > 0 ? (totalPts / totalCredits).toFixed(2) : '0.00';
      document.getElementById('sgpa-val').innerText = sgpa;
      document.getElementById('total-credits').innerText = 'Total Credits: ' + totalCredits;
    }

    render();
  </script>
</body>
</html>`;
}

function generate2048Html({ title = 'NERIST 2048 Puzzle' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} · Agent Kurox</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    body {
      background: #faf8ef; color: #776e65;
      font-family: "Clear Sans", "Helvetica Neue", Arial, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 12px;
    }
    header { display: flex; justify-content: space-between; width: 280px; align-items: center; margin-bottom: 12px; }
    h1 { font-size: 32px; font-weight: bold; color: #776e65; }
    .score-box { background: #bbada0; color: white; padding: 6px 14px; border-radius: 6px; font-weight: bold; text-align: center; }
    #grid {
      width: 280px; height: 280px; background: #bbada0; border-radius: 8px;
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px;
    }
    .tile {
      background: #cdc1b4; border-radius: 6px; display: flex; align-items: center;
      justify-content: center; font-size: 22px; font-weight: bold; color: #776e65;
    }
    .t2 { background: #eee4da; }
    .t4 { background: #ede0c8; }
    .t8 { background: #f2b179; color: white; }
    .t16 { background: #f59563; color: white; }
    .t32 { background: #f67c5f; color: white; }
    .t64 { background: #f65e3b; color: white; }
    .t128 { background: #edcf72; color: white; font-size: 18px; }
    .t256 { background: #edcc61; color: white; font-size: 18px; }
    .t512 { background: #edc850; color: white; font-size: 18px; }
    .t1024 { background: #edc53f; color: white; font-size: 16px; }
    .t2048 { background: #edc22e; color: white; font-size: 16px; }
    footer { margin-top: 14px; font-size: 11px; color: #8f7a66; }
  </style>
</head>
<body>
  <header>
    <h1>2048</h1>
    <div class="score-box">SCORE<div id="score">0</div></div>
  </header>
  <div id="grid"></div>
  <footer>Swipe on phone or use Arrow Keys · Agent Kurox</footer>

  <script>
    let board = Array(16).fill(0);
    let score = 0;

    function init() {
      board = Array(16).fill(0);
      score = 0;
      addRandom(); addRandom();
      render();
    }

    function addRandom() {
      const empties = board.map((v, i) => v === 0 ? i : null).filter(v => v !== null);
      if (empties.length === 0) return;
      const spot = empties[Math.floor(Math.random() * empties.length)];
      board[spot] = Math.random() < 0.9 ? 2 : 4;
    }

    function render() {
      const grid = document.getElementById('grid');
      grid.innerHTML = '';
      board.forEach(v => {
        const div = document.createElement('div');
        div.className = 'tile' + (v > 0 ? ' t' + v : '');
        div.innerText = v > 0 ? v : '';
        grid.appendChild(div);
      });
      document.getElementById('score').innerText = score;
    }

    function slide(row) {
      let arr = row.filter(x => x);
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] === arr[i + 1]) {
          arr[i] *= 2;
          score += arr[i];
          arr[i + 1] = 0;
        }
      }
      arr = arr.filter(x => x);
      while (arr.length < 4) arr.push(0);
      return arr;
    }

    function move(dir) {
      let rotated = [...board];
      let changed = false;
      for (let r = 0; r < 4; r++) {
        let row = [];
        for (let c = 0; c < 4; c++) {
          let idx = dir === 'L' ? r * 4 + c :
                    dir === 'R' ? r * 4 + (3 - c) :
                    dir === 'U' ? c * 4 + r : (3 - c) * 4 + r;
          row.push(rotated[idx]);
        }
        let slided = slide(row);
        for (let c = 0; c < 4; c++) {
          let idx = dir === 'L' ? r * 4 + c :
                    dir === 'R' ? r * 4 + (3 - c) :
                    dir === 'U' ? c * 4 + r : (3 - c) * 4 + r;
          if (rotated[idx] !== slided[c]) changed = true;
          rotated[idx] = slided[c];
        }
      }
      if (changed) {
        board = rotated;
        addRandom();
        render();
      }
    }

    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') move('L');
      if (e.key === 'ArrowRight') move('R');
      if (e.key === 'ArrowUp') move('U');
      if (e.key === 'ArrowDown') move('D');
    });

    let tx = 0, ty = 0;
    document.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; });
    document.addEventListener('touchend', e => {
      let dx = e.changedTouches[0].clientX - tx;
      let dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 30) move('R'); else if (dx < -30) move('L');
      } else {
        if (dy > 30) move('D'); else if (dy < -30) move('U');
      }
    });

    init();
  </script>
</body>
</html>`;
}

module.exports = {
  formatForWhatsApp,
  formatMathAndChemistry,
  extractPureApplicationText,
  sanitizeForPdf,
  generateApplicationPdf,
  generateApplicationDocx,
  generateAssignmentCoverPdf,
  generateAssignmentCoverDocx,
  generateHtmlGame,
};
