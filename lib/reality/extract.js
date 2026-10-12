'use strict';
// What the Realism Engine reads out of words: the numbers a text states (each with the ways it may be written), the
// material claims in page text (prices, certifications, reviews, guarantees, ...), and the facts an owner's brief
// confirms. Pure; no model calls.

// numbers in a text, each as the ways it may be written ("18:00" matches "6pm"; "£1,150" is 1150)
function numbersIn(text) {
  const out = [];
  let s = String(text).replace(/(\d),(\d{3})\b/g, '$1$2');
  s = s.replace(/\b(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)\b/gi, (m, h, mm, ap) => { out.push([String(+h % 12 + (ap.toLowerCase() === 'pm' ? 12 : 0)), String(+h)]); if (mm && mm !== '00') out.push([String(+mm)]); return ' '; });
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mm) => { out.push(+h > 12 ? [String(+h), String(+h - 12)] : [String(+h)]); if (mm !== '00') out.push([String(+mm)]); return ' '; });
  for (const n of s.match(/\d+(?:\.\d+)?/g) || []) out.push([String(+n)]);
  return out;
}

// Claims that commit a business to something, in page text. Order matters only for overlapping matches (first wins).
const CLAIMS = [
  { kind: 'price', re: /(?:[$€£¥₹]|\b(?:CHF|USD|EUR|GBP|AUD|CAD|NZD|SEK|NOK|DKK|JPY)\s?)\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:USD|EUR|GBP|CHF|dollars|euros|pounds)\b/gi },
  { kind: 'review', re: /\b\d(?:\.\d)?\s?(?:\/\s?5|out of 5|stars?)\b|★{3,}|\bfive[- ]star\b|\b\d[\d,]*\+?\s(?:reviews|ratings)\b|\brated (?:#?1|number one|\d(?:\.\d)?)\b|\btestimonials?\b/gi },
  { kind: 'customerCount', re: /\b\d[\d,.]*k?\+?\s(?:happy\s|satisfied\s|loyal\s)?(?:customers|clients|members|users|patients|guests|families|homes|businesses|teams|students|subscribers|riders|owners)\b/gi },
  { kind: 'certification', re: /\b(?:certified|certification|accredited|accreditation|ISO ?\d{3,5})\b/gi },
  { kind: 'guarantee', re: /\b(?:guarantee[ds]?|money[- ]back|warrant(?:y|ies|ied)|lifetime (?:warranty|guarantee))\b/gi },
  { kind: 'legal', re: /\b(?:refund policy|returns? policy|cancellation policy|terms (?:and|&) conditions|privacy policy|non[- ]refundable)\b/gi },
  { kind: 'award', re: /\b(?:award[- ]winning|awards?|winner of|voted (?:best|#1|number one))\b/gi },
  { kind: 'founded', re: /\b(?:since|est\.?|established|founded(?: in)?)\s+(?:in\s+)?(?:1[89]\d\d|20\d\d)\b|\b\d+\+? years? (?:of experience|in business|experience)\b/gi },
  { kind: 'address', re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Way|Drive|Dr|Place|Pl|Square|Sq)\b\.?/g },
  { kind: 'contact', re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b|(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/g },
  { kind: 'availability', re: /\b\d+(?:[-–]\d+)?\s?(?:days?|weeks?|months?)\b(?=[^.]{0,40}\b(?:delivery|deliver\w*|lead time|ships?|shipping|made to order|turnaround|wait))|\b(?:ships? (?:in|within) \d+|made to order|in stock|limited (?:to \d+|edition|run))\b/gi },
  { kind: 'hours', re: /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/gi },
  { kind: 'specification', re: /\b\d+(?:[.,]\d+)?\s?(?:mm|cm|kg|g|ml|L|litres?|liters?|h|hrs?|hours|bar|ATM|Hz|vph|W|kW|kWh|GB|TB|mAh|mph|km\/h|inches|ft|sq ?ft|m²|jewels|%)(?![\w])/gi },
];

// claims in one text: [{ kind, match }]; module = the business's industry module (its own phrases are added)
function claimsIn(text, module) {
  const t = String(text || ''), out = [], taken = [];
  const pats = CLAIMS.concat(((module && module.phrases) || []).map((p) => ({ kind: p.kind, re: new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g') })));
  for (const { kind, re } of pats) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(t))) {
      const a = m.index, b = a + m[0].length;
      if (!m[0].trim()) { re.lastIndex++; continue; }
      if (taken.some(([x, y]) => a < y && b > x)) continue;
      taken.push([a, b]); out.push({ kind, match: m[0].trim() });
    }
  }
  return out;
}

// a page field's own kind from its path (a configurator's price is a price even when it is a bare number)
function kindOfPath(p) {
  const s = String(p).toLowerCase();
  if (/(?:^|\.)(?:price|prices|cost|fee|fees|deposit|rate|rates|amount)\b|\.price$|deposit/.test(s)) return 'price';
  if (/weeks|leadtime|lead_time|turnaround/.test(s)) return 'availability';
  if (/(?:^|\.)(?:mm|m|bar|reserve|turns|jewels|capacity|minutes|duration)$/.test(s)) return 'specification';
  if (/phone|email/.test(s)) return 'contact';
  if (/address|street/.test(s)) return 'address';
  if (/hours|open|close/.test(s)) return 'hours';
  return null;
}

module.exports = { numbersIn, claimsIn, kindOfPath, CLAIMS };
