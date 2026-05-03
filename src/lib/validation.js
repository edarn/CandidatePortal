import { z } from 'zod';

const COMMON_WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  'password',
  'qwerty123',
  'abc123456',
  'iloveyou',
  'admin1234',
  'welcome123',
  'monkey1234',
  '1234567890',
  'letmein123',
  'dragon1234',
  'football1',
  'baseball1',
  'master1234',
  'sunshine1',
  'princess1',
  'shadow1234',
  'passw0rd1',
  'password1',
]);

export const emailSchema = z.string().trim().toLowerCase().email().max(255);

export const passwordSchema = z
  .string()
  .min(10, { params: { i18n: 'errors.field.passwordTooShort' } })
  .max(200)
  .refine((p) => !/^\d+$/.test(p), { params: { i18n: 'errors.field.passwordOnlyDigits' } })
  .refine((p) => !COMMON_WEAK_PASSWORDS.has(p.toLowerCase()), {
    params: { i18n: 'errors.field.passwordTooCommon' },
  });

export const phoneSchema = z
  .string()
  .trim()
  .min(5)
  .max(30)
  .regex(/^[\d\s+()\-]+$/, { params: { i18n: 'errors.field.phone' } });

export const fullNameSchema = z.string().trim().min(1).max(100);

export const localeSchema = z.enum(['sv', 'en']);

export const tagNameSchema = z.string().trim().min(1).max(40);

export const tagColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .optional()
  .or(z.literal(''));

export const linkedinSchema = z.string().trim().url().max(500).optional().or(z.literal(''));
export const shortTextSchema = z.string().trim().max(200).optional().or(z.literal(''));
export const longTextSchema = z.string().trim().max(2000).optional().or(z.literal(''));

export function flattenZodErrors(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (out[key]) continue;
    if (issue.params?.i18n) {
      out[key] = issue.params.i18n;
    } else if (issue.code === 'invalid_string' && issue.validation === 'email') {
      out[key] = 'errors.field.email';
    } else if (issue.code === 'invalid_string' && issue.validation === 'url') {
      out[key] = 'errors.field.url';
    } else if (issue.code === 'invalid_type' || issue.code === 'too_small') {
      out[key] = 'errors.field.required';
    } else if (issue.code === 'too_big') {
      out[key] = 'errors.field.tooLong';
    } else {
      out[key] = 'errors.generic';
    }
  }
  return out;
}
