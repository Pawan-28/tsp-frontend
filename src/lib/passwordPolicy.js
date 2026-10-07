/** Password policy shared by Settings and Change Password — mirrors backend utils/password.js. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = "Min. 8 characters with at least one letter and one number";

/** Returns an error message, or null when the password is acceptable. */
export function validateNewPassword(value) {
  const text = String(value ?? "");
  if (text.length < PASSWORD_MIN_LENGTH) {
    return `New password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!/[A-Za-z]/.test(text) || !/\d/.test(text)) {
    return "New password must include at least one letter and one number";
  }
  return null;
}
