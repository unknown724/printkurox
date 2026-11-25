/**
 * =============================================================================
 * NERIST Campus Smart Search Engine (ML / Information Retrieval Hybrid)
 * =============================================================================
 * Powers high-precision, typo-tolerant search across Faculty and Student datasets.
 * 
 * Architecture mirrors modern search ranking engines (YouTube / Google Search):
 * 1. Phonetic Normalization (Soundex / Metaphone tuned for Northeast / Indian names:
 *    handles b/v, w/v, ee/i, oo/u, dh/d, sh/s, y/i, collapsed double consonants).
 * 2. Jaro-Winkler Distance (high weight on common prefixes for human names).
 * 3. Character N-Gram Vector Cosine / Dice Similarity (sub-token / typo tolerance).
 * 4. Token Bag-of-Words & Permutation Invariant Matching (handles swapped first/last names).
 * 5. Department Alias Resolution (CSE, ECE, ME, CE, EE, FET, AE, FO, CMS, HSS, etc.).
 * 6. International Clickable Phone Formatting (+91 XXXXX XXXXX).
 * =============================================================================
 */

function cleanHonorifics(str) {
  if (!str) return '';
  return str
    .replace(/\b(dr|mr|ms|prof|mrs|er|sir|maam|mam|madam|miss|shri|smt)\b\.?/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phonetic transformation tuned for Northeast / Indian student & faculty names
 */
function phoneticKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/v/g, 'b')
    .replace(/w/g, 'v')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/sh/g, 's')
    .replace(/z/g, 'j')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1') // collapse double letters: mm->m, nn->n, tt->t
    .trim();
}

/**
 * Fast Jaro-Winkler string similarity (0.0 to 1.0)
 */
function jaroWinkler(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length);
  const s2Matches = new Array(s2.length);
  let m = 0;

  for (let i = 0; i < s1.length; i++) {
    const low = Math.max(0, i - range);
    const high = Math.min(i + range + 1, s2.length);
    for (let j = low; j < high; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        m++;
        break;
      }
    }
  }

  if (m === 0) return 0;

  let k = 0;
  let numTrans = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) numTrans++;
      k++;
    }
  }

  const weight = (m / s1.length + m / s2.length + (m - numTrans / 2) / m) / 3;
  let p = 0;
  while (p < 4 && s1[p] === s2[p]) p++;
  return weight + p * 0.1 * (1 - weight);
}

/**
 * Character N-Gram Dice Similarity (sub-token / typo tolerance)
 */
function getNgrams(str, n = 2) {
  const set = new Set();
  const padded = ` ${str} `;
  for (let i = 0; i <= padded.length - n; i++) {
    set.add(padded.slice(i, i + n));
  }
  return set;
}

function ngramSimilarity(s1, s2, n = 2) {
  if (!s1 || !s2) return 0;
  const g1 = getNgrams(s1, n);
  const g2 = getNgrams(s2, n);
  let common = 0;
  for (const g of g1) {
    if (g2.has(g)) common++;
  }
  return (2 * common) / (g1.size + g2.size);
}

/**
 * Compute multi-angle match score (0.0 to 1.0) between query and candidate
 */
function matchScore(query, candidate) {
  const qClean = cleanHonorifics(query).toLowerCase();
  const cClean = cleanHonorifics(candidate).toLowerCase();
  if (!qClean || !cClean) return 0;
  if (qClean === cClean) return 1.0;
  if (cClean.includes(qClean)) return 0.95;

  // 1. Phonetic match check
  const qPhon = phoneticKey(qClean);
  const cPhon = phoneticKey(cClean);
  if (cPhon.includes(qPhon) || qPhon.includes(cPhon)) {
    return 0.92;
  }

  // 2. Token Bag-of-Words matching (handles swapped names like "Roy Gautam" -> "Gautam Roy")
  const qWords = qClean.split(/\s+/).filter(Boolean);
  const cWords = cClean.split(/\s+/).filter(Boolean);

  let wordScore = 0;
  for (const qw of qWords) {
    let best = 0;
    for (const cw of cWords) {
      const jw = jaroWinkler(qw, cw);
      const ng = ngramSimilarity(qw, cw, 2);
      const ph = phoneticKey(qw) === phoneticKey(cw) ? 0.9 : 0;
      const s = Math.max(jw, ng, ph);
      if (s > best) best = s;
    }
    wordScore += best;
  }
  wordScore /= qWords.length;

  // 3. Full-string fuzzy metrics
  const fullJw = jaroWinkler(qClean, cClean);
  const fullNg = ngramSimilarity(qClean, cClean, 2);
  const fullPh = jaroWinkler(qPhon, cPhon);
  const fullComposite = fullJw * 0.4 + fullNg * 0.4 + fullPh * 0.2;

  return Math.max(wordScore, fullComposite);
}

/**
 * Rank candidates by score and return matches above minScore
 */
function rankCandidates(query, list, extractNameFn, minScore = 0.68, maxResults = 5) {
  if (!query || !query.trim() || !list || list.length === 0) return [];
  const q = query.trim();

  const scored = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const name = extractNameFn(item) || '';
    if (!name) continue;

    const score = matchScore(q, name);
    if (score >= minScore) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.item);
}

/**
 * Recognized NERIST Department Aliases & Abbreviations
 */
const DEPARTMENT_ALIASES = {
  cse: 'Computer Science and Engineering',
  cs: 'Computer Science and Engineering',
  comp: 'Computer Science and Engineering',
  computer: 'Computer Science and Engineering',
  ece: 'Electronics and Communication Engineering',
  ec: 'Electronics and Communication Engineering',
  electronics: 'Electronics and Communication Engineering',
  ee: 'Electrical Engineering',
  electrical: 'Electrical Engineering',
  me: 'Mechanical Engineering',
  mech: 'Mechanical Engineering',
  mechanical: 'Mechanical Engineering',
  ce: 'Civil Engineering',
  civil: 'Civil Engineering',
  ae: 'Agricultural Engineering',
  agri: 'Agricultural Engineering',
  agricultural: 'Agricultural Engineering',
  fet: 'Food Engineering and Technology',
  food: 'Food Engineering and Technology',
  fo: 'Forestry',
  forestry: 'Forestry',
  hss: 'Humanities and Social Sciences',
  humanities: 'Humanities and Social Sciences',
  cms: 'Centre for Management Studies',
  management: 'Centre for Management Studies',
  ph: 'Physics',
  phy: 'Physics',
  physics: 'Physics',
  ch: 'Chemistry',
  chem: 'Chemistry',
  chemistry: 'Chemistry',
  ma: 'Mathematics',
  math: 'Mathematics',
  maths: 'Mathematics',
  mathematics: 'Mathematics',
  admin: 'Administration / Registrar Office',
  administration: 'Administration / Registrar Office',
  registrar: 'Administration / Registrar Office',
  acad: 'Academic Administration',
  academic: 'Academic Administration',
};

/**
 * Resolves query to full department name if it matches an alias
 */
function resolveDepartment(query) {
  if (!query) return null;
  const lower = query.trim().toLowerCase();
  return DEPARTMENT_ALIASES[lower] || null;
}

/**
 * Format 10-digit mobile number into international WhatsApp clickable phone
 * (e.g. "9774196181" -> "+91 97741 96181")
 */
function formatClickablePhone(raw) {
  if (!raw) return 'Not listed';
  const clean = raw.replace(/[^0-9]/g, '').slice(-10);
  if (clean.length === 10 && /^[6-9]/.test(clean)) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return 'Not listed';
}

module.exports = {
  cleanHonorifics,
  phoneticKey,
  jaroWinkler,
  ngramSimilarity,
  matchScore,
  rankCandidates,
  DEPARTMENT_ALIASES,
  resolveDepartment,
  formatClickablePhone,
};
