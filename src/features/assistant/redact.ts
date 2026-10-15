/**
 * Removes contact details a pasted email or invite often contains (a
 * recruiter's email address or phone number) before the text reaches a model
 * or the database. dolu bolu never needs them to track a drive, so they are
 * not sent anywhere (AGENTS.md: bounded, relevant context only). Links are
 * kept: assessment and meeting URLs are exactly what the user wants extracted.
 */

const url = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Digit runs with optional +, spaces, dots, dashes, or brackets…
const phoneCandidate = /(?<![\w/])\+?\(?\d[\d\s().-]{7,}\d(?![\w/])/g;
// …that contain enough digits to be a phone number, and no date (16-09-2026, 2026-09-16).
const MIN_PHONE_DIGITS = 10;
const datePattern = /\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/;

function isPhoneNumber(candidate: string) {
  return candidate.replace(/\D/g, "").length >= MIN_PHONE_DIGITS && !datePattern.test(candidate);
}

export const REDACTED_EMAIL = "[email removed]";
export const REDACTED_PHONE = "[phone removed]";

export function redactContactDetails(text: string) {
  // Protect links first so an address inside a URL is never altered.
  const links: string[] = [];
  const protectedText = text.replace(url, (match) => `\u0000${links.push(match) - 1}\u0000`);

  const redacted = protectedText
    .replace(email, REDACTED_EMAIL)
    .replace(phoneCandidate, (match) => (isPhoneNumber(match) ? REDACTED_PHONE : match));

  return redacted.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => links[Number(index)]!);
}
