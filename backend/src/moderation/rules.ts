export const MAX_MESSAGE_LENGTH = 500;

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Removes control characters and collapses whitespace. */
export function normalizeText(input: string): string {
  return input.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

export type Signal = 'phone_number' | 'email' | 'url' | 'street_address' | 'social_handle';

const patterns: [Signal, RegExp][] = [
  ['phone_number', /(?:\+|00)?\d[\d\s().-]{7,}\d/],
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/i],
  ['url', /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|de|net|org|io|me|app|co|xyz|info)\b/i],
  [
    'street_address',
    /\b\d{1,4}\s+[\p{L}.'-]+\s*(?:straße|strasse|str\.|weg|allee|platz|gasse|street|st\.|ave\.?|avenue|road|rd\.?|lane|ln\.?)\b|\b[\p{L}.'-]*(?:straße|strasse|weg|allee|platz|gasse)\s+\d{1,4}\b/iu,
  ],
  ['social_handle', /(?:^|\s)@[a-z0-9_.]{3,}/i],
];

/**
 * Cheap pattern hints passed to the classifier as context. They never block on their
 * own ("call me at 8" is not a phone number; a venue name is not an address).
 */
export function detectSignals(text: string): Signal[] {
  return patterns.filter(([, re]) => re.test(text)).map(([signal]) => signal);
}
