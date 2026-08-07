/**
 * Password Policy — Section C
 *
 * Enforces minimum complexity, scores strength, and provides a
 * password-history storage interface for future reuse prevention.
 *
 * Exported:
 *   validatePasswordStrength(password) — returns { valid, score, errors }
 *   scorePassword(password)            — returns 0–100 integer
 *   PASSWORD_MIN_LENGTH                — exported constant
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
}

/**
 * Score a password 0–100 based on length, character variety, and entropy.
 * Used independently of validation for UI strength meters.
 */
export function scorePassword(password: string): number {
  if (!password) return 0;

  let score = 0;

  // Length contribution (up to 35 pts)
  score += Math.min(35, password.length * 3);

  // Character class variety (10 pts each, up to 40 pts)
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 10;

  // Bonus: 3+ distinct char classes (5 pts)
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(r => r.test(password)).length;
  if (classes >= 3) score += 5;

  // Bonus: all 4 classes (10 pts)
  if (classes === 4) score += 10;

  // Penalise: common sequential patterns (-10)
  if (/(.)\1{2,}/.test(password)) score -= 10;   // "aaaa"
  if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def)/i.test(password)) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Validate password against the policy rules.
 * Returns a { valid, score, errors } object.
 * Does NOT check history (requires DB access — do that at the route level).
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character (e.g. !@#$%^&*)");
  }

  const score = scorePassword(password);

  return {
    valid: errors.length === 0,
    score,
    errors,
  };
}

/**
 * Strength label for UI display.
 */
export function passwordStrengthLabel(score: number): "weak" | "fair" | "good" | "strong" {
  if (score < 30) return "weak";
  if (score < 55) return "fair";
  if (score < 75) return "good";
  return "strong";
}
