import { AppError } from './middleware/error';

type FieldValidator = (value: unknown) => boolean | string;

const isString = (max = 200): FieldValidator => (v) =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max || 'invalid string';

const isEmail = (): FieldValidator => (v) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'invalid email';

const isNumber = (): FieldValidator => (v) => typeof v === 'number' && Number.isFinite(v);

const optionalNumber = (): FieldValidator => (v) =>
  v == null || (typeof v === 'number' && Number.isFinite(v));

export function validate(
  body: Record<string, unknown>,
  rules: Record<string, FieldValidator>
): void {
  for (const [key, validator] of Object.entries(rules)) {
    const result = validator(body[key]);
    if (result !== true) {
      const reason = typeof result === 'string' ? result : 'required';
      throw new AppError(`Field "${key}" is ${reason}.`, 400);
    }
  }
}

export const V = {
  string: isString,
  email: isEmail,
  number: isNumber,
  optionalNumber,
  coordinate: (): FieldValidator => (v) =>
    v == null || (typeof v === 'number' && v >= -90 && v <= 90),
};
