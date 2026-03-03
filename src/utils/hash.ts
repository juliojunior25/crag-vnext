import { createHash } from 'crypto';

/**
 * SHA-256 hash of a string
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
