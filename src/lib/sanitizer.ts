/**
 * SensitiveDataSanitizer - TypeScript port of iOS Privacy Mode sanitizer
 *
 * Deterministic, client-side sanitizer for Privacy Mode.
 * Goal: mask high-confidence sensitive tokens before any cloud/LLM processing.
 *
 * Supports:
 * - Configurable categories (email, phone, IBAN, national ID, credit card, CR number, 700 number)
 * - Custom strings provided by user (names, company names, etc.)
 */

export enum RedactionCategory {
  email = 'email',
  phone = 'phone',
  iban = 'iban',
  nationalId = 'nationalId',
  creditCard = 'creditCard',
  crNumber = 'crNumber',
  unifiedNumber = 'unifiedNumber',
  custom = 'custom',
}

export const CATEGORY_INFO: Record<RedactionCategory, {
  displayName: string;
  exampleMask: string;
}> = {
  [RedactionCategory.email]: {
    displayName: 'Emails',
    exampleMask: 'a****@d****.com',
  },
  [RedactionCategory.phone]: {
    displayName: 'Phone Numbers',
    exampleMask: '+966*****78',
  },
  [RedactionCategory.iban]: {
    displayName: 'IBANs',
    exampleMask: 'SA**********7519',
  },
  [RedactionCategory.nationalId]: {
    displayName: 'National IDs',
    exampleMask: '********90',
  },
  [RedactionCategory.creditCard]: {
    displayName: 'Credit Cards',
    exampleMask: '************1234',
  },
  [RedactionCategory.crNumber]: {
    displayName: 'CR Numbers',
    exampleMask: '********10',
  },
  [RedactionCategory.unifiedNumber]: {
    displayName: '700 Numbers',
    exampleMask: '700*******89',
  },
  [RedactionCategory.custom]: {
    displayName: 'Custom Terms',
    exampleMask: '████████',
  },
};

/**
 * Auto-detected categories (not .custom)
 */
export const AUTO_DETECTED_CATEGORIES: RedactionCategory[] = [
  RedactionCategory.email,
  RedactionCategory.phone,
  RedactionCategory.iban,
  RedactionCategory.nationalId,
  RedactionCategory.creditCard,
  RedactionCategory.crNumber,
  RedactionCategory.unifiedNumber,
];

export interface PrivacyRedactionReport {
  privacyMode: boolean;
  version: string;
  categoriesEnabled: RedactionCategory[];
  counts: Partial<Record<RedactionCategory, number>>;
  pagesAffected: number[];
  customStringsCount: number;
  createdAt: string;
}

export interface SanitizedPage {
  pageNumber: number;
  sanitizedText: string;
  counts: Partial<Record<RedactionCategory, number>>;
}

export interface PrivacyModeConfig {
  enabledCategories: Set<RedactionCategory>;
  customStrings: string[];
}

/**
 * Default config with all auto-detected categories enabled
 */
export function getDefaultPrivacyConfig(): PrivacyModeConfig {
  return {
    enabledCategories: new Set(AUTO_DETECTED_CATEGORIES),
    customStrings: [],
  };
}

/**
 * Get human-readable summary of what was redacted
 */
export function getRedactionSummary(counts: Partial<Record<RedactionCategory, number>>): string {
  const total = Object.values(counts).reduce((sum, c) => sum + (c || 0), 0);
  if (total === 0) {
    return 'No sensitive data detected';
  }

  const parts: string[] = [];
  for (const cat of Object.values(RedactionCategory)) {
    const count = counts[cat];
    if (count && count > 0) {
      parts.push(`${count} ${CATEGORY_INFO[cat].displayName.toLowerCase()}`);
    }
  }
  return 'Masked: ' + parts.join(', ');
}

// Regex patterns
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const IBAN_REGEX = /\b[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){10,30}\b/gi;
const NATIONAL_ID_REGEX = /\b[12]\d{9}\b/g;
const CREDIT_CARD_CANDIDATE_REGEX = /\b(?:\d[ -]?){13,19}\b/g;
const CR_NUMBER_REGEX = /\b\d{10}\b/g;
const UNIFIED_NUMBER_REGEX = /\b700\d{7,}\b/g;

/**
 * Main sanitizer class
 */
export class SensitiveDataSanitizer {
  private config: PrivacyModeConfig;

  constructor(config: PrivacyModeConfig = getDefaultPrivacyConfig()) {
    this.config = config;
  }

  /**
   * Sanitize multiple pages
   */
  sanitizePages(
    pages: Array<{ pageNumber: number; text: string }>
  ): { pages: SanitizedPage[]; report: PrivacyRedactionReport } {
    const sanitized: SanitizedPage[] = [];
    const totalCounts: Partial<Record<RedactionCategory, number>> = {};
    const pagesAffected = new Set<number>();

    // Initialize counts
    for (const cat of Object.values(RedactionCategory)) {
      totalCounts[cat] = 0;
    }

    for (const p of pages) {
      const result = this.sanitizeText(p.text);
      const pageTotal = Object.values(result.counts).reduce((sum, c) => sum + (c || 0), 0);
      
      if (pageTotal > 0) {
        pagesAffected.add(p.pageNumber);
      }

      for (const [cat, count] of Object.entries(result.counts)) {
        totalCounts[cat as RedactionCategory] = (totalCounts[cat as RedactionCategory] || 0) + (count || 0);
      }

      sanitized.push({
        pageNumber: p.pageNumber,
        sanitizedText: result.text,
        counts: result.counts,
      });
    }

    const enabledCategories = AUTO_DETECTED_CATEGORIES.filter(cat =>
      this.config.enabledCategories.has(cat)
    );
    if (this.config.customStrings.length > 0) {
      enabledCategories.push(RedactionCategory.custom);
    }

    // Filter counts to only enabled categories
    const filteredCounts: Partial<Record<RedactionCategory, number>> = {};
    for (const [cat, count] of Object.entries(totalCounts)) {
      if (this.config.enabledCategories.has(cat as RedactionCategory) || cat === RedactionCategory.custom) {
        filteredCounts[cat as RedactionCategory] = count;
      }
    }

    const report: PrivacyRedactionReport = {
      privacyMode: true,
      version: 'v1',
      categoriesEnabled: enabledCategories,
      counts: filteredCounts,
      pagesAffected: Array.from(pagesAffected).sort((a, b) => a - b),
      customStringsCount: this.config.customStrings.length,
      createdAt: new Date().toISOString(),
    };

    return { pages: sanitized, report };
  }

  /**
   * Sanitize a single text string
   */
  private sanitizeText(text: string): { text: string; counts: Partial<Record<RedactionCategory, number>> } {
    let output = text;
    const counts: Partial<Record<RedactionCategory, number>> = {};

    // Initialize counts
    for (const cat of Object.values(RedactionCategory)) {
      counts[cat] = 0;
    }

    // Order matters: more "structured" first to reduce overlap weirdness
    if (this.config.enabledCategories.has(RedactionCategory.email)) {
      const [newOutput, count] = this.replaceMatches(output, EMAIL_REGEX, this.maskEmail);
      output = newOutput;
      counts[RedactionCategory.email] = count;
    }

    if (this.config.enabledCategories.has(RedactionCategory.iban)) {
      const [newOutput, count] = this.replaceMatches(output, IBAN_REGEX, this.maskIban);
      output = newOutput;
      counts[RedactionCategory.iban] = count;
    }

    if (this.config.enabledCategories.has(RedactionCategory.creditCard)) {
      const [newOutput, count] = this.replaceCreditCards(output);
      output = newOutput;
      counts[RedactionCategory.creditCard] = count;
    }

    if (this.config.enabledCategories.has(RedactionCategory.phone)) {
      const [newOutput, count] = this.replaceMatches(output, PHONE_REGEX, this.maskPhone);
      output = newOutput;
      counts[RedactionCategory.phone] = count;
    }

    if (this.config.enabledCategories.has(RedactionCategory.nationalId)) {
      const [newOutput, count] = this.replaceMatches(output, NATIONAL_ID_REGEX, this.maskNationalId);
      output = newOutput;
      counts[RedactionCategory.nationalId] = count;
    }

    if (this.config.enabledCategories.has(RedactionCategory.crNumber)) {
      const [newOutput, count] = this.replaceMatches(output, CR_NUMBER_REGEX, this.maskCrNumber);
      output = newOutput;
      counts[RedactionCategory.crNumber] = count;
    }

    if (this.config.enabledCategories.has(RedactionCategory.unifiedNumber)) {
      const [newOutput, count] = this.replaceMatches(output, UNIFIED_NUMBER_REGEX, this.maskUnifiedNumber);
      output = newOutput;
      counts[RedactionCategory.unifiedNumber] = count;
    }

    // Custom strings (case-insensitive replacement)
    if (this.config.customStrings.length > 0) {
      let customCount = 0;
      for (const customString of this.config.customStrings) {
        const trimmed = customString.trim();
        if (trimmed.length < 2) continue; // Skip very short strings

        const mask = '█'.repeat(trimmed.length);
        const [newOutput, count] = this.replaceCustomString(output, trimmed, mask);
        output = newOutput;
        customCount += count;
      }
      counts[RedactionCategory.custom] = customCount;
    }

    // Filter to enabled only
    const filteredCounts: Partial<Record<RedactionCategory, number>> = {};
    for (const [cat, count] of Object.entries(counts)) {
      if (
        this.config.enabledCategories.has(cat as RedactionCategory) ||
        (cat === RedactionCategory.custom && this.config.customStrings.length > 0)
      ) {
        filteredCounts[cat as RedactionCategory] = count;
      }
    }

    return { text: output, counts: filteredCounts };
  }

  /**
   * Replace all matches of a regex with masked versions
   */
  private replaceMatches(
    input: string,
    regex: RegExp,
    masker: (match: string) => string
  ): [string, number] {
    let count = 0;
    // Reset regex state
    regex.lastIndex = 0;
    
    const output = input.replace(regex, (match) => {
      count++;
      return masker(match);
    });
    
    return [output, count];
  }

  /**
   * Replace credit cards with Luhn validation
   */
  private replaceCreditCards(input: string): [string, number] {
    let count = 0;
    CREDIT_CARD_CANDIDATE_REGEX.lastIndex = 0;

    const output = input.replace(CREDIT_CARD_CANDIDATE_REGEX, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) return match;
      if (!this.luhnIsValid(digits)) return match;

      count++;
      return this.maskCreditCard(match);
    });

    return [output, count];
  }

  /**
   * Case-insensitive string replacement
   */
  private replaceCustomString(input: string, target: string, replacement: string): [string, number] {
    let count = 0;
    const regex = new RegExp(this.escapeRegex(target), 'gi');
    
    const output = input.replace(regex, () => {
      count++;
      return replacement;
    });

    return [output, count];
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // MARK: - Masking rules

  private maskEmail = (email: string): string => {
    const atIndex = email.indexOf('@');
    if (atIndex === -1) {
      return '*'.repeat(Math.max(4, email.length));
    }

    const local = email.substring(0, atIndex);
    const domain = email.substring(atIndex + 1);

    const maskPart = (s: string, keepPrefix: number, keepSuffix: number): string => {
      if (s.length <= keepPrefix + keepSuffix) {
        return '*'.repeat(Math.max(4, s.length));
      }
      const prefix = s.substring(0, keepPrefix);
      const suffix = s.substring(s.length - keepSuffix);
      const stars = '*'.repeat(Math.max(4, s.length - keepPrefix - keepSuffix));
      return `${prefix}${stars}${suffix}`;
    };

    const maskedLocal = maskPart(local, 1, 0);
    const maskedDomain = maskPart(domain, 1, 0);
    return `${maskedLocal}@${maskedDomain}`;
  };

  private maskPhone = (phone: string): string => {
    const trimmed = phone.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7) {
      return '*'.repeat(Math.max(7, trimmed.length));
    }

    const suffix = digits.substring(digits.length - 2);
    const prefixDigits = digits.substring(0, 3);
    const prefix = trimmed.startsWith('+') ? `+${prefixDigits}` : prefixDigits;
    const stars = '*'.repeat(Math.max(5, digits.length - prefixDigits.length - 2));
    return `${prefix}${stars}${suffix}`;
  };

  private maskIban = (iban: string): string => {
    const compact = iban.replace(/\s/g, '').toUpperCase();
    if (compact.length < 8) {
      return '*'.repeat(Math.max(8, iban.length));
    }
    const prefix = compact.substring(0, 2);
    const suffix = compact.substring(compact.length - 4);
    const stars = '*'.repeat(Math.max(8, compact.length - 6));
    return `${prefix}${stars}${suffix}`;
  };

  private maskNationalId = (id: string): string => {
    const digits = id.replace(/\D/g, '');
    if (digits.length <= 2) {
      return '*'.repeat(Math.max(4, id.length));
    }
    const suffix = digits.substring(digits.length - 2);
    return '*'.repeat(Math.max(6, digits.length - 2)) + suffix;
  };

  private maskCreditCard = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 4) {
      return '*'.repeat(Math.max(8, raw.length));
    }
    return '*'.repeat(Math.max(12, digits.length - 4)) + digits.substring(digits.length - 4);
  };

  private maskCrNumber = (cr: string): string => {
    const digits = cr.replace(/\D/g, '');
    if (digits.length <= 2) {
      return '*'.repeat(Math.max(8, cr.length));
    }
    const suffix = digits.substring(digits.length - 2);
    return '*'.repeat(Math.max(6, digits.length - 2)) + suffix;
  };

  private maskUnifiedNumber = (num: string): string => {
    const digits = num.replace(/\D/g, '');
    if (digits.length < 5) {
      return '*'.repeat(Math.max(8, num.length));
    }
    const prefix = digits.substring(0, 3); // "700"
    const suffix = digits.substring(digits.length - 2);
    const stars = '*'.repeat(Math.max(5, digits.length - 5));
    return `${prefix}${stars}${suffix}`;
  };

  // MARK: - Luhn validation

  private luhnIsValid(digits: string): boolean {
    let sum = 0;
    const reversed = digits.split('').reverse().map(d => parseInt(d, 10));

    for (let i = 0; i < reversed.length; i++) {
      let d = reversed[i];
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }

    return sum % 10 === 0;
  }
}

/**
 * Extract text from a PDF using pdf.js
 * This is used for client-side text extraction in ephemeral privacy mode
 */
export async function extractTextFromPdf(file: File): Promise<Array<{ pageNumber: number; text: string }>> {
  // Dynamic import of pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const pages: Array<{ pageNumber: number; text: string }> = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    
    pages.push({ pageNumber: i, text });
  }

  return pages;
}
