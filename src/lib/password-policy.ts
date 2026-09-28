export const MIN_PASSWORD_CHARACTERS = 8;
export const MAX_PASSWORD_BYTES = 72;

export type PasswordPolicyError = "PASSWORD_REQUIRED" | "PASSWORD_TOO_SHORT" | "PASSWORD_TOO_LONG";

export function passwordByteLength(password: string) {
  return new TextEncoder().encode(password).byteLength;
}

export function passwordPolicyError(password: string): PasswordPolicyError | null {
  if (!password) return "PASSWORD_REQUIRED";
  if (password.length < MIN_PASSWORD_CHARACTERS) return "PASSWORD_TOO_SHORT";
  if (passwordByteLength(password) > MAX_PASSWORD_BYTES) return "PASSWORD_TOO_LONG";
  return null;
}

export function passwordPolicyMessage(error: PasswordPolicyError) {
  if (error === "PASSWORD_TOO_LONG") return `Password must be no more than ${MAX_PASSWORD_BYTES} UTF-8 bytes.`;
  return `Password must be at least ${MIN_PASSWORD_CHARACTERS} characters.`;
}

export function passwordCanBeVerified(password: string) {
  return password.length > 0 && passwordByteLength(password) <= MAX_PASSWORD_BYTES;
}
