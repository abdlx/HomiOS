/** Generic input validation helpers. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function assertClean(value: string, label: string): void {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a string`);
  if (value.length > 4096) throw new ValidationError(`${label} is too long`);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new ValidationError(`${label} contains control characters`);
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,62}$/;
export function validateName(name: string): string {
  assertClean(name, 'name');
  const trimmed = (name || '').trim();
  if (!NAME_RE.test(trimmed)) {
    throw new ValidationError('Name must be 1-63 chars: letters, numbers, space, _ . -');
  }
  return trimmed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateEmail(email: unknown): string {
  if (typeof email !== 'string') throw new ValidationError('Email is required');
  const trimmed = email.trim().toLowerCase();
  assertClean(trimmed, 'email');
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) {
    throw new ValidationError('A valid email address is required');
  }
  return trimmed;
}

export const MIN_PASSWORD_LENGTH = 12;

/**
 * bcrypt silently truncates at 72 bytes, so anything longer adds no entropy while
 * letting a client burn CPU on a megabyte-long "password" — cap it.
 */
export function validatePassword(password: unknown): string {
  if (typeof password !== 'string') throw new ValidationError('Password is required');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new ValidationError('Password must be at most 72 bytes');
  }
  return password;
}
