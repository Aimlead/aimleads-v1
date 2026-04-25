export const PASSWORD_RULES = [
  { key: 'length', test: (p) => p.length >= 8 },
  { key: 'uppercase', test: (p) => /[A-Z]/.test(p) },
  { key: 'number', test: (p) => /[0-9]/.test(p) },
];

export function validatePassword(password, t) {
  if (!password) {
    return t('accountSettings.passwordMinLength', { defaultValue: 'Password must be at least 8 characters.' });
  }
  if (password.length < 8) {
    return t('accountSettings.passwordMinLength', { defaultValue: 'Password must be at least 8 characters.' });
  }
  if (!/[A-Z]/.test(password)) {
    return t('accountSettings.passwordNeedsUppercase', { defaultValue: 'Password must include an uppercase letter.' });
  }
  if (!/[0-9]/.test(password)) {
    return t('accountSettings.passwordNeedsNumber', { defaultValue: 'Password must include a number.' });
  }
  return null;
}
