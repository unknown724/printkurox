/**
 * Generates human-readable rotating pickup codes like #B42, #A01, #C99.
 * Format: #[A-Z][0-9]{2}
 */

export function generateRandomPickupCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude easily confused letters I, O
  const randomLetter = letters[Math.floor(Math.random() * letters.length)];
  const randomNumber = Math.floor(Math.random() * 99) + 1; // 1 to 99
  const paddedNumber = randomNumber.toString().padStart(2, '0');
  return `#${randomLetter}${paddedNumber}`;
}
