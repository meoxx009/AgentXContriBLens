'use client';

import React, { useState, useCallback, useRef } from 'react';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { parseGitHubUrl } from './scanner/github';

/**
 * ContribLens — Centralized Accessible Form Validation
 *
 * Single source of truth for form validation rules, inline human-readable error messages,
 * and accessible field-level feedback (aria-invalid, aria-describedby, focus management).
 *
 * Rules:
 * 1. Zod schemas are authoritative for both client and server contracts.
 * 2. Neutral until touched/blur; validate on blur, re-validate on change once invalid.
 * 3. Validate all before submit, auto-focusing the first invalid field.
 * 4. Human-readable errors: one short sentence + fix hint without jargon.
 * 5. Submit buttons disable only while submitting.
 * 6. Server Zod errors map back to the correct fields in the form.
 */

// ============================================================================
// 1. Core Validation Schemas
// ============================================================================

export const EmailSchema = z
  .string({ required_error: 'Email address is required. Fix hint: enter your email.' })
  .trim()
  .min(1, 'Email address is required. Fix hint: enter your email.')
  .email('Invalid email format. Fix hint: format as name@example.com.');

export const LoginPasswordSchema = z
  .string({ required_error: 'Password is required. Fix hint: enter your account password.' })
  .min(1, 'Password is required. Fix hint: enter your account password.');

export const SignupPasswordSchema = z
  .string({ required_error: 'Password is required. Fix hint: enter at least 8 characters.' })
  .min(8, 'Password must be at least 8 characters. Fix hint: use 8 or more characters with numbers or symbols.');

export const GitBranchSchema = z
  .string()
  .trim()
  .max(100, 'Branch name must be under 100 characters. Fix hint: shorten the branch name.')
  .optional()
  .default('')
  .refine(
    (val) => {
      if (!val) return true; // optional
      // Disallow git forbidden characters: spaces, ~, ^, :, ?, *, [, \, @, or ..
      if (/[\s~^:?*\[\\@]|\.\./.test(val)) return false;
      // Disallow starting or ending with / or .
      if (val.startsWith('/') || val.endsWith('/') || val.startsWith('.') || val.endsWith('.')) return false;
      return /^[a-zA-Z0-9._\-/]+$/.test(val);
    },
    {
      message: "Invalid branch name. Fix hint: use letters, numbers, '-', '_', or '/' without spaces.",
    }
  );

export const GitHubRepoUrlSchema = z
  .string({ required_error: 'Repository URL is required. Fix hint: enter a GitHub repository URL.' })
  .trim()
  .min(1, 'Repository URL is required. Fix hint: enter a GitHub repository URL.')
  .refine(
    (val) => {
      const parsed = parseGitHubUrl(val);
      return parsed !== null;
    },
    {
      message: 'Invalid repository format. Fix hint: use https://github.com/owner/repo or owner/repo.',
    }
  );

export const ScanInputSchema = z.object({
  repositoryUrl: GitHubRepoUrlSchema,
  branch: GitBranchSchema.optional().default(''),
  scope: z.enum(['partial', 'deep']).optional().default('partial'),
});

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: LoginPasswordSchema,
});

export const SignupInputSchema = z
  .object({
    email: EmailSchema,
    password: SignupPasswordSchema,
    passwordConfirmation: z
      .string({ required_error: 'Password confirmation is required. Fix hint: re-enter your password.' })
      .min(1, 'Password confirmation is required. Fix hint: re-enter your password.'),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({
        message: 'Terms acceptance is required. Fix hint: check the box to accept the privacy notice.',
      }),
    }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Passwords do not match. Fix hint: re-enter the same password.',
    path: ['passwordConfirmation'],
  });

export const ForgotPasswordInputSchema = z.object({
  email: EmailSchema,
});

export const IssueDraftEditSchema = z.object({
  title: z
    .string({ required_error: 'Issue title is required. Fix hint: provide a short, descriptive title.' })
    .trim()
    .min(3, 'Title is too short. Fix hint: enter at least 3 characters.')
    .max(200, 'Title is too long. Fix hint: shorten to under 200 characters.'),
  body: z
    .string({ required_error: 'Markdown description is required. Fix hint: explain the finding and proposed fix.' })
    .trim()
    .min(10, 'Description is too short. Fix hint: provide at least 10 characters explaining the issue.')
    .max(20000, 'Description is too long. Fix hint: shorten to under 20,000 characters.'),
  labels: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || !val.trim()) return true;
        const items = val.split(',').map((s) => s.trim()).filter(Boolean);
        return items.every((l) => l.length <= 50 && !/[<>{}\\]/.test(l));
      },
      {
        message: 'Invalid label format. Fix hint: use comma-separated tags under 50 characters each.',
      }
    ),
  status: z.enum(['draft', 'awaiting_review', 'reviewed', 'approved', 'rejected', 'exported']).optional(),
});

export const ProfileUpdateSchema = z.object({
  name: z
    .string({ required_error: 'Contributor name is required. Fix hint: enter your name or handle.' })
    .trim()
    .min(2, 'Name is too short. Fix hint: enter at least 2 characters.')
    .max(100, 'Name is too long. Fix hint: shorten to under 100 characters.'),
  bio: z
    .string()
    .max(2000, 'Bio is too long. Fix hint: shorten to under 2000 characters.')
    .optional()
    .nullable(),
});

// ============================================================================
// 2. Server Error to Field Mapping Helpers
// ============================================================================

/**
 * Maps arbitrary server error messages or structured payloads back to specific form fields.
 */
export function mapServerErrorsToFields(
  serverError: string | Record<string, any> | null | undefined,
  knownFields: string[]
): Record<string, string> {
  if (!serverError) return {};
  const mapped: Record<string, string> = {};

  if (typeof serverError === 'object') {
    // If server returned structured { fieldErrors: { email: '...' } }
    if (serverError.fieldErrors && typeof serverError.fieldErrors === 'object') {
      return serverError.fieldErrors;
    }
    // If server returned { field: 'email', error: '...' }
    if (serverError.field && serverError.error) {
      mapped[serverError.field] = String(serverError.error);
      return mapped;
    }
  }

  const rawMessage = typeof serverError === 'string' ? serverError : serverError.error || serverError.message || '';
  if (!rawMessage) return {};

  const lower = rawMessage.toLowerCase();

  for (const field of knownFields) {
    if (field === 'email' && (lower.includes('email') || lower.includes('account with this email'))) {
      mapped.email = lower.includes('already exists')
        ? 'An account with this email already exists. Fix hint: try signing in instead.'
        : rawMessage;
    } else if (field === 'passwordConfirmation' && (lower.includes('password confirmation') || lower.includes('passwords do not match'))) {
      mapped.passwordConfirmation = 'Passwords do not match. Fix hint: re-enter the same password.';
    } else if (field === 'password' && lower.includes('password') && !mapped.passwordConfirmation) {
      mapped.password = lower.includes('at least 8')
        ? 'Password must be at least 8 characters. Fix hint: enter a longer password.'
        : rawMessage;
    } else if (field === 'acceptedTerms' && (lower.includes('terms') || lower.includes('privacy'))) {
      mapped.acceptedTerms = 'Terms acceptance is required. Fix hint: check the box to agree.';
    } else if (field === 'repositoryUrl' && (lower.includes('repository') || lower.includes('repo url') || lower.includes('github_invalid_url'))) {
      mapped.repositoryUrl = rawMessage;
    } else if (field === 'branch' && (lower.includes('branch') || lower.includes('ref'))) {
      mapped.branch = rawMessage;
    } else if (field === 'name' && lower.includes('name')) {
      mapped.name = rawMessage;
    } else if (field === 'title' && lower.includes('title')) {
      mapped.title = rawMessage;
    } else if (field === 'body' && (lower.includes('body') || lower.includes('markdown') || lower.includes('description'))) {
      mapped.body = rawMessage;
    } else if (field === 'bio' && lower.includes('bio')) {
      mapped.bio = rawMessage;
    }
  }

  return mapped;
}

// ============================================================================
// 3. useFormValidation React Hook
// ============================================================================

export interface UseFormValidationOptions<T extends Record<string, any>> {
  schema: z.ZodType<any>;
  initialValues: T;
  idPrefix?: string;
  validateOnBlur?: boolean;
  validateOnChangeAfterBlur?: boolean;
}

export function useFormValidation<T extends Record<string, any>>({
  schema,
  initialValues,
  idPrefix = 'field',
  validateOnBlur = true,
  validateOnChangeAfterBlur = true,
}: UseFormValidationOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const valuesRef = useRef<T>(initialValues);
  valuesRef.current = values;

  // Validate a single field against the schema
  const validateSingleField = useCallback(
    (field: keyof T, valToTest: any, currentVals: T): string | null => {
      const merged = { ...currentVals, [field]: valToTest };
      const parsed = schema.safeParse(merged);
      if (parsed.success) {
        return null;
      }

      const issue = parsed.error.issues.find((iss) => iss.path[0] === field);
      if (issue) {
        return issue.message;
      }
      return null;
    },
    [schema]
  );

  // Field change handler: updates values, and re-validates if already touched or invalid
  const setFieldValue = useCallback(
    (field: keyof T, value: any) => {
      setValues((prev) => {
        const next = { ...prev, [field]: value };
        valuesRef.current = next;
        return next;
      });

      // Re-validate immediately if the field has been touched or currently has an error
      if (validateOnChangeAfterBlur && (touched[field] || errors[field])) {
        const error = validateSingleField(field, value, valuesRef.current);
        setErrors((prev) => {
          if (error) {
            return { ...prev, [field]: error };
          }
          const copy = { ...prev };
          delete copy[field];
          return copy;
        });
      }
    },
    [errors, touched, validateOnChangeAfterBlur, validateSingleField]
  );

  // Field blur handler: marks touched and validates
  const handleBlur = useCallback(
    (field: keyof T) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      if (validateOnBlur) {
        const error = validateSingleField(field, valuesRef.current[field], valuesRef.current);
        setErrors((prev) => {
          if (error) {
            return { ...prev, [field]: error };
          }
          const copy = { ...prev };
          delete copy[field];
          return copy;
        });
      }
    },
    [validateOnBlur, validateSingleField]
  );

  // Set explicit field error (e.g. from server response)
  const setFieldError = useCallback((field: keyof T, error: string | null) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => {
      if (error) {
        return { ...prev, [field]: error };
      }
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
  }, []);

  // Clear single error or all errors
  const clearErrors = useCallback((field?: keyof T) => {
    if (field) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    } else {
      setErrors({});
    }
  }, []);

  // Validate entire form (called before submit)
  const validateAll = useCallback(
    (overrideValues?: T): { isValid: boolean; errors: Partial<Record<keyof T, string>>; firstInvalidField: keyof T | null } => {
      const vals = overrideValues || valuesRef.current;
      const parsed = schema.safeParse(vals);

      if (parsed.success) {
        setErrors({});
        return { isValid: true, errors: {}, firstInvalidField: null };
      }

      const nextErrors: Partial<Record<keyof T, string>> = {};
      const nextTouched: Partial<Record<keyof T, boolean>> = {};
      let firstInvalid: keyof T | null = null;

      for (const issue of parsed.error.issues) {
        const fieldName = (issue.path[0] as keyof T) || ('form' as unknown as keyof T);
        if (!nextErrors[fieldName]) {
          nextErrors[fieldName] = issue.message;
          nextTouched[fieldName] = true;
          if (!firstInvalid) {
            firstInvalid = fieldName;
          }
        }
      }

      setErrors(nextErrors);
      setTouched((prev) => ({ ...prev, ...nextTouched }));

      // Accessible auto-focus: focus the first invalid element
      if (firstInvalid && typeof document !== 'undefined') {
        const elementId = `${idPrefix}-${String(firstInvalid)}`;
        const el = (document.getElementById(elementId) ||
          (String(firstInvalid) === 'passwordConfirmation'
            ? document.getElementById(`${idPrefix}-confirm-password`)
            : null)) as HTMLElement | null;
        if (el && typeof el.focus === 'function') {
          el.focus();
        }
      }

      return {
        isValid: false,
        errors: nextErrors,
        firstInvalidField: firstInvalid,
      };
    },
    [idPrefix, schema]
  );

  // Map server errors back to the form and focus first field
  const applyServerErrors = useCallback(
    (serverError: string | Record<string, any>, knownFieldList?: (keyof T)[]) => {
      const keys = (knownFieldList || (Object.keys(valuesRef.current) as (keyof T)[])) as string[];
      const mapped = mapServerErrorsToFields(serverError, keys);

      if (Object.keys(mapped).length > 0) {
        const newErrors = { ...errors, ...mapped } as Partial<Record<keyof T, string>>;
        const newTouched: Partial<Record<keyof T, boolean>> = {};
        for (const k of Object.keys(mapped)) {
          newTouched[k as keyof T] = true;
        }
        setErrors(newErrors);
        setTouched((prev) => ({ ...prev, ...newTouched }));

        const firstKey = Object.keys(mapped)[0];
        if (firstKey && typeof document !== 'undefined') {
          const el = (document.getElementById(`${idPrefix}-${firstKey}`) ||
            (firstKey === 'passwordConfirmation'
              ? document.getElementById(`${idPrefix}-confirm-password`)
              : null)) as HTMLElement | null;
          if (el && typeof el.focus === 'function') {
            el.focus();
          }
        }
        return true;
      }
      return false;
    },
    [errors, idPrefix]
  );

  // Reset form
  const reset = useCallback((newValues?: T) => {
    const vals = newValues || initialValues;
    setValues(vals);
    valuesRef.current = vals;
    setErrors({});
    setTouched({});
  }, [initialValues]);

  // Standard props generator for an accessible field
  const getFieldProps = useCallback(
    (field: keyof T) => {
      const fieldId = `${idPrefix}-${String(field)}`;
      const hasError = Boolean(errors[field]);
      const errorId = hasError ? `${fieldId}-error` : undefined;

      return {
        id: fieldId,
        name: String(field),
        value: values[field] ?? '',
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
          setFieldValue(field, e.target.value);
        },
        onBlur: () => handleBlur(field),
        'aria-invalid': hasError,
        'aria-describedby': errorId,
      };
    },
    [errors, handleBlur, idPrefix, setFieldValue, values]
  );

  return {
    values,
    setValues,
    errors,
    touched,
    setFieldValue,
    setFieldError,
    handleBlur,
    clearErrors,
    validateAll,
    applyServerErrors,
    reset,
    getFieldProps,
  };
}

// ============================================================================
// 4. Accessible Form Field Error Component
// ============================================================================

export interface FormFieldErrorProps {
  id?: string;
  error?: string | null;
  className?: string;
}

export function FormFieldError({ id, error, className = '' }: FormFieldErrorProps) {
  if (!error) return null;
  return React.createElement(
    'p',
    {
      id,
      role: 'alert',
      className: `mt-1.5 text-xs text-red-300 font-mono flex items-center gap-1.5 animate-fade-in ${className}`,
    },
    React.createElement(AlertCircle, {
      className: 'w-3.5 h-3.5 text-red-400 shrink-0',
      'aria-hidden': 'true',
    }),
    React.createElement('span', null, error)
  );
}
