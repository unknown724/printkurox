/**
 * Generates human-readable rotating pickup codes like #MK429, #AB105, #KP729.
 * Format: #[A-Z]{2}[0-9]{3}
 * Generates 518,400 collision-resistant codes while maintaining crisp 5-character readability.
 */

export function generateRandomPickupCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude easily confused letters I, O
  const letter1 = letters[Math.floor(Math.random() * letters.length)];
  const letter2 = letters[Math.floor(Math.random() * letters.length)];
  // 3-digit number from 100 to 999
  const randomNumber = Math.floor(Math.random() * 900) + 100;
  return `#${letter1}${letter2}${randomNumber}`;
}
