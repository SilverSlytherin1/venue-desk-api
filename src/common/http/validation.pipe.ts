import { type ValidationError, ValidationPipe } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import { type FieldError, ValidationFailedError } from '../errors/domain-errors.js';

/** Rejects unknown properties instead of silently dropping them, so client typos surface early. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationFailedError(errors.map(toFieldError)),
  });
}

/** What a field is called in a sentence, where its name alone would read badly. */
const LABELS: Partial<Record<string, string>> = {
  id: 'ID',
  seats: 'Number of seats',
  startsAt: 'Start time',
  eventId: 'Event',
  assigneeId: 'Assignee',
  pageSize: 'Page size',
  q: 'Search text',
  to: 'Target status',
};

/**
 * One sentence per kind of rule. Clients show these messages to people as they are, so every
 * DTO reports problems in the same voice and none carries message strings of its own. A rule
 * that is not listed here keeps the message given where it is declared.
 */
const MESSAGES: Partial<Record<string, (label: string, error: ValidationError) => string>> = {
  whitelistValidation: (_label, error) => `"${error.property}" is not an accepted field.`,
  isNotEmpty: (label) => `${label} is required.`,
  isString: (label) => `${label} must be text.`,
  isEmail: () => 'Enter a valid email address.',
  isUuid: (label) => `${label} must be a valid UUID.`,
  isIso8601: (label) => `${label} must be a date and time in ISO 8601 format.`,
  isInt: (label) => `${label} must be a whole number.`,
  min: range,
  max: range,
  maxLength: (label, error) =>
    `${label} must be at most ${ruleArgs<number>(error, 'maxLength')[0]} characters.`,
  isEnum: (label, error) =>
    `${label} must be one of: ${ruleArgs<string[]>(error, 'isEnum')[1]?.join(', ')}.`,
};

/**
 * One message per field. class-validator runs a property's rules bottom-up, so the last
 * failure belongs to the rule declared first, which by convention is the most basic one.
 */
export function toFieldError(error: ValidationError): FieldError {
  const label = LABELS[error.property] ?? capitalise(error.property);
  const [rule = '', declared = `${label} is invalid.`] =
    Object.entries(error.constraints ?? {}).at(-1) ?? [];

  const isAbsent = error.value === undefined || error.value === null;
  const message =
    isAbsent && rule !== 'whitelistValidation'
      ? `${label} is required.`
      : (MESSAGES[rule]?.(label, error) ?? declared);
  return { field: error.property, message };
}

function range(label: string, error: ValidationError): string {
  const [min] = ruleArgs<number>(error, 'min');
  const [max] = ruleArgs<number>(error, 'max');
  if (min !== undefined && max !== undefined) return `${label} must be between ${min} and ${max}.`;
  return min !== undefined
    ? `${label} must be at least ${min}.`
    : `${label} must be at most ${max}.`;
}

/** The arguments a rule was declared with, such as the 4 of @Max(4). The error does not carry them. */
function ruleArgs<T>(error: ValidationError, rule: string): (T | undefined)[] {
  const dto = error.target?.constructor;
  const declaration =
    dto &&
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', false, false)
      .find((metadata) => metadata.propertyName === error.property && metadata.name === rule);
  return (declaration?.constraints as T[] | undefined) ?? [];
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
