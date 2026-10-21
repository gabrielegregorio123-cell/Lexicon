/**
 * Greek and Ancient Language diacritic normalization utilities.
 * Handles polytonic Greek normalization, accent stripping, sigma unification,
 * and Latin transliteration so that:
 * ἄγαλμα == αγαλμα == agalma == AGALMA
 */

// Greek characters map to Latin transliterations
const GREEK_TO_LATIN_MAP: Record<string, string> = {
  'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'e',
  'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x',
  'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y',
  'φ': 'ph', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o'
};

/**
 * Remove polytonic Greek accents, breathings, iota subscripts,
 * Latin macrons, breves, accents, etc. via Unicode NFD decomposition.
 */
export function stripDiacritics(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    // Remove all combining diacritical marks (Unicode block U+0300 - U+036F)
    .replace(/[\u0300-\u036f]/g, '')
    // Also remove Greek combining marks and dialytika
    .replace(/[\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, '')
    .normalize('NFC')
    // Normalize final sigma ς to regular sigma σ for comparison
    .replace(/ς/g, 'σ');
}

/**
 * Transliterates normalized Greek text to Latin alphabet
 */
export function greekToLatin(str: string): string {
  const normalized = stripDiacritics(str.toLowerCase());
  let result = '';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    result += GREEK_TO_LATIN_MAP[ch] || ch;
  }
  return result;
}

/**
 * Produces a normalized search key combining Greek accentless and Latin transliteration
 */
export function getSearchTokens(text: string): string[] {
  if (!text) return [];
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const tokens = new Set<string>();

  for (const w of words) {
    tokens.add(w);
    const stripped = stripDiacritics(w);
    tokens.add(stripped);
    const transliterated = greekToLatin(stripped);
    tokens.add(transliterated);
  }

  return Array.from(tokens);
}

/**
 * Check if query matches target with Greek diacritic/transliteration tolerance
 */
export function matchesQuery(target: string, query: string): boolean {
  if (!query) return true;
  if (!target) return false;

  const q = query.trim().toLowerCase();
  const qStripped = stripDiacritics(q);
  const qLatin = greekToLatin(qStripped);

  const t = target.toLowerCase();
  const tStripped = stripDiacritics(t);
  const tLatin = greekToLatin(tStripped);

  return (
    t.includes(q) ||
    tStripped.includes(qStripped) ||
    tLatin.includes(qLatin) ||
    tStripped.includes(qLatin) ||
    tLatin.includes(qStripped)
  );
}
