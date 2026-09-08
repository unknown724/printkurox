/**
 * Generates human-readable rotating pickup codes like #B429, #A105, #K729.
 * Format: #[A-Z][0-9]{3}
 * Generates 21,600 collision-resistant codes while maintaining crisp 4-character readability.
 */

export function generateRandomPickupCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude easily confused letters I, O
  const randomLetter = letters[Math.floor(Math.random() * letters.length)];
  // 3-digit number from 100 to 999
  const randomNumber = Math.floor(Math.random() * 900) + 100;
  return `#${randomLetter}${randomNumber}`;
}
