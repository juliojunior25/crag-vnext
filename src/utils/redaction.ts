/**
 * Redaction utility for sensitive data
 * 
 * Redacts API keys, tokens, secrets, and high-entropy values from logs.
 */

const SENSITIVE_PATTERNS = [
  /(api[_-]?key|apikey)/i,
  /(secret|token|password|passwd|pwd)/i,
  /(authorization|auth)/i,
  /(bearer|basic)\s+[\w-]+/i,
];

const HIGH_ENTROPY_THRESHOLD = 3.5; // Shannon entropy threshold

/**
 * Calculate Shannon entropy of a string
 */
function calculateEntropy(str: string): number {
  const len = str.length;
  if (len === 0) return 0;

  const frequencies: Record<string, number> = {};
  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  for (const count of Object.values(frequencies)) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Check if a string matches sensitive patterns
 */
function matchesSensitivePattern(key: string, value: string): boolean {
  const keyLower = key.toLowerCase();
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(keyLower) || pattern.test(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a value has high entropy (likely a secret)
 */
function isHighEntropy(value: string): boolean {
  if (typeof value !== 'string' || value.length < 16) {
    return false;
  }
  return calculateEntropy(value) >= HIGH_ENTROPY_THRESHOLD;
}

/**
 * Determine redaction type for a value
 */
function getRedactionType(key: string, value: string): string {
  if (matchesSensitivePattern(key, value)) {
    if (key.toLowerCase().includes('api') || key.toLowerCase().includes('key')) {
      return 'API_KEY';
    }
    if (key.toLowerCase().includes('token')) {
      return 'TOKEN';
    }
    return 'SECRET';
  }
  if (isHighEntropy(value)) {
    return 'HIGH_ENTROPY';
  }
  return 'SENSITIVE';
}

/**
 * Redact sensitive data from an object
 */
export function redactSensitiveData<T extends Record<string, any>>(data: T): T {
  const redacted = { ...data } as Record<string, any>;

  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === 'string' && value.length > 0) {
      if (matchesSensitivePattern(key, value) || isHighEntropy(value)) {
        const type = getRedactionType(key, value);
        redacted[key] = `{REDACTED:${type}}`;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactSensitiveData(value as Record<string, any>);
    }
  }

  return redacted as T;
}

