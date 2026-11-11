import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EmailSchema,
  LoginPasswordSchema,
  SignupPasswordSchema,
  GitBranchSchema,
  GitHubRepoUrlSchema,
  ScanInputSchema,
  LoginInputSchema,
  SignupInputSchema,
  ForgotPasswordInputSchema,
  IssueDraftEditSchema,
  ProfileUpdateSchema,
  mapServerErrorsToFields,
  FormFieldError,
} from '../src/lib/validation';
import fs from 'fs';
import path from 'path';

describe('Form Validation Engine (Zod Schemas, Fix Hints & Accessible Contracts)', () => {
  describe('EmailSchema', () => {
    it('rejects empty email with required fix hint', () => {
      const res = EmailSchema.safeParse('');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('Email address is required');
        expect(res.error.issues[0].message).toContain('Fix hint:');
      }
    });

    it('rejects malformed email with formatting fix hint', () => {
      const res = EmailSchema.safeParse('not-an-email');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('Invalid email format');
        expect(res.error.issues[0].message).toContain('Fix hint: format as name@example.com');
      }
    });

    it('accepts valid email addresses', () => {
      expect(EmailSchema.safeParse('contributor@example.com').success).toBe(true);
      expect(EmailSchema.safeParse('user.name+tag@sub.domain.org').success).toBe(true);
    });
  });

  describe('Password Schemas', () => {
    it('LoginPasswordSchema requires at least 1 character with fix hint', () => {
      const empty = LoginPasswordSchema.safeParse('');
      expect(empty.success).toBe(false);
      if (!empty.success) {
        expect(empty.error.issues[0].message).toContain('Password is required');
        expect(empty.error.issues[0].message).toContain('Fix hint:');
      }
      expect(LoginPasswordSchema.safeParse('secret').success).toBe(true);
    });

    it('SignupPasswordSchema enforces minimum 8 characters with fix hint', () => {
      const short = SignupPasswordSchema.safeParse('short7');
      expect(short.success).toBe(false);
      if (!short.success) {
        expect(short.error.issues[0].message).toContain('at least 8 characters');
        expect(short.error.issues[0].message).toContain('Fix hint:');
      }

      const valid = SignupPasswordSchema.safeParse('SuperSecure123!');
      expect(valid.success).toBe(true);
    });
  });

  describe('GitBranchSchema', () => {
    it('accepts empty branch (optional ref)', () => {
      expect(GitBranchSchema.safeParse('').success).toBe(true);
      expect(GitBranchSchema.safeParse(undefined).success).toBe(true);
    });

    it('accepts standard branch names', () => {
      expect(GitBranchSchema.safeParse('main').success).toBe(true);
      expect(GitBranchSchema.safeParse('feature/auth-v2').success).toBe(true);
      expect(GitBranchSchema.safeParse('release_1.0.0').success).toBe(true);
      expect(GitBranchSchema.safeParse('fix/issue-42').success).toBe(true);
    });

    it('rejects branch names with spaces or git-forbidden characters', () => {
      const forbidden = [
        'feature branch',
        'branch..name',
        'feature~1',
        'feature^2',
        'feature:test',
        'feature?test',
        'feature*test',
        'feature[test',
        'feature\\test',
        'feature@test',
        '/leading-slash',
        'trailing-slash/',
        '.leading-dot',
        'trailing-dot.',
      ];

      for (const branch of forbidden) {
        const res = GitBranchSchema.safeParse(branch);
        expect(res.success, `Expected branch "${branch}" to fail`).toBe(false);
        if (!res.success) {
          expect(res.error.issues[0].message).toContain('Fix hint:');
        }
      }
    });

    it('rejects branch names exceeding 100 characters', () => {
      const longBranch = 'a'.repeat(101);
      const res = GitBranchSchema.safeParse(longBranch);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('under 100 characters');
      }
    });
  });

  describe('GitHubRepoUrlSchema & ScanInputSchema', () => {
    it('accepts valid GitHub formats (full URL, owner/repo, ssh)', () => {
      expect(GitHubRepoUrlSchema.safeParse('https://github.com/expressjs/express').success).toBe(true);
      expect(GitHubRepoUrlSchema.safeParse('pallets/flask').success).toBe(true);
      expect(GitHubRepoUrlSchema.safeParse('git@github.com:facebook/react.git').success).toBe(true);
      expect(GitHubRepoUrlSchema.safeParse('https://github.com/tailwindlabs/tailwindcss/').success).toBe(true);
    });

    it('rejects invalid repository formats with actionable fix hint', () => {
      const invalid = ['', 'not-a-repo', 'https://gitlab.com/owner/repo', 'ftp://github.com/a/b'];
      for (const url of invalid) {
        const res = GitHubRepoUrlSchema.safeParse(url);
        expect(res.success, `Expected "${url}" to fail`).toBe(false);
        if (!res.success) {
          expect(res.error.issues[0].message).toContain('Fix hint:');
        }
      }
    });

    it('validates complete ScanInputSchema with branch and scope', () => {
      const valid = ScanInputSchema.safeParse({
        repositoryUrl: 'https://github.com/vercel/next.js',
        branch: 'canary',
        scope: 'partial',
      });
      expect(valid.success).toBe(true);

      const invalidBranch = ScanInputSchema.safeParse({
        repositoryUrl: 'https://github.com/vercel/next.js',
        branch: 'canary with spaces',
      });
      expect(invalidBranch.success).toBe(false);
    });
  });

  describe('LoginInputSchema & SignupInputSchema', () => {
    it('validates LoginInputSchema requires valid email and password', () => {
      const empty = LoginInputSchema.safeParse({ email: '', password: '' });
      expect(empty.success).toBe(false);

      const valid = LoginInputSchema.safeParse({
        email: 'user@example.com',
        password: 'ValidPassword123',
      });
      expect(valid.success).toBe(true);
    });

    it('validates SignupInputSchema with password mismatch and terms acceptance', () => {
      // Mismatch
      const mismatch = SignupInputSchema.safeParse({
        email: 'user@example.com',
        password: 'Password123!',
        passwordConfirmation: 'DifferentPassword!',
        acceptedTerms: true,
      });
      expect(mismatch.success).toBe(false);
      if (!mismatch.success) {
        expect(mismatch.error.issues[0].message).toContain('Passwords do not match');
      }

      // Unaccepted terms
      const unacceptedTerms = SignupInputSchema.safeParse({
        email: 'user@example.com',
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
        acceptedTerms: false,
      });
      expect(unacceptedTerms.success).toBe(false);
      if (!unacceptedTerms.success) {
        expect(unacceptedTerms.error.issues[0].message).toContain('Terms acceptance is required');
      }

      // Valid signup
      const valid = SignupInputSchema.safeParse({
        email: 'user@example.com',
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
        acceptedTerms: true,
      });
      expect(valid.success).toBe(true);
    });

    it('validates ForgotPasswordInputSchema', () => {
      expect(ForgotPasswordInputSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
      expect(ForgotPasswordInputSchema.safeParse({ email: 'bad' }).success).toBe(false);
    });
  });

  describe('IssueDraftEditSchema', () => {
    it('enforces title between 3 and 200 characters', () => {
      const tooShort = IssueDraftEditSchema.safeParse({
        title: 'Hi',
        body: 'This is a valid body description over 10 chars.',
      });
      expect(tooShort.success).toBe(false);
      if (!tooShort.success) {
        expect(tooShort.error.issues[0].message).toContain('Title is too short');
        expect(tooShort.error.issues[0].message).toContain('Fix hint:');
      }

      const tooLong = IssueDraftEditSchema.safeParse({
        title: 'A'.repeat(201),
        body: 'This is a valid body description over 10 chars.',
      });
      expect(tooLong.success).toBe(false);
      if (!tooLong.success) {
        expect(tooLong.error.issues[0].message).toContain('Title is too long');
      }
    });

    it('enforces body between 10 and 20,000 characters', () => {
      const shortBody = IssueDraftEditSchema.safeParse({
        title: 'Valid Issue Title',
        body: 'Too short',
      });
      expect(shortBody.success).toBe(false);
      if (!shortBody.success) {
        expect(shortBody.error.issues[0].message).toContain('Description is too short');
        expect(shortBody.error.issues[0].message).toContain('Fix hint:');
      }

      const valid = IssueDraftEditSchema.safeParse({
        title: 'Fix insecure package lock configuration',
        body: '## Detailed Problem Analysis\n\nDependencies should be pinned.',
        labels: 'security, good-first-issue',
        status: 'draft',
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('ProfileUpdateSchema', () => {
    it('enforces name between 2 and 100 characters with fix hint', () => {
      const tooShort = ProfileUpdateSchema.safeParse({ name: 'A' });
      expect(tooShort.success).toBe(false);
      if (!tooShort.success) {
        expect(tooShort.error.issues[0].message).toContain('Name is too short');
        expect(tooShort.error.issues[0].message).toContain('Fix hint:');
      }

      const valid = ProfileUpdateSchema.safeParse({
        name: 'Ada Lovelace',
        bio: 'Open source contributor and computer scientist.',
      });
      expect(valid.success).toBe(true);
    });

    it('enforces bio maximum 2000 characters', () => {
      const longBio = ProfileUpdateSchema.safeParse({
        name: 'Valid Name',
        bio: 'B'.repeat(2001),
      });
      expect(longBio.success).toBe(false);
      if (!longBio.success) {
        expect(longBio.error.issues[0].message).toContain('Bio is too long');
        expect(longBio.error.issues[0].message).toContain('Fix hint:');
      }
    });
  });

  describe('mapServerErrorsToFields (Server-to-Field Mapping)', () => {
    it('maps structured fieldErrors object directly', () => {
      const mapped = mapServerErrorsToFields(
        { fieldErrors: { email: 'Email already registered', password: 'Too weak' } },
        ['email', 'password']
      );
      expect(mapped.email).toBe('Email already registered');
      expect(mapped.password).toBe('Too weak');
    });

    it('maps single field error object', () => {
      const mapped = mapServerErrorsToFields(
        { field: 'repositoryUrl', error: 'Repository not found on GitHub' },
        ['repositoryUrl', 'branch']
      );
      expect(mapped.repositoryUrl).toBe('Repository not found on GitHub');
    });

    it('maps raw error strings containing email conflict to email field with fix hint', () => {
      const mapped = mapServerErrorsToFields(
        'An account with this email already exists.',
        ['email', 'password']
      );
      expect(mapped.email).toContain('already exists');
      expect(mapped.email).toContain('Fix hint: try signing in instead.');
    });

    it('maps raw error strings containing branch errors to branch field', () => {
      const mapped = mapServerErrorsToFields(
        'Branch canary does not exist on remote repository.',
        ['repositoryUrl', 'branch']
      );
      expect(mapped.branch).toContain('Branch canary does not exist');
    });

    it('returns empty object when no matching field is found', () => {
      const mapped = mapServerErrorsToFields('Internal Server Error 500', ['email', 'password']);
      expect(Object.keys(mapped)).toHaveLength(0);
    });
  });

  describe('FormFieldError Component (Accessible Inline Rendering)', () => {
    it('renders null when error is undefined or empty', () => {
      const html1 = renderToStaticMarkup(React.createElement(FormFieldError, { error: null }));
      const html2 = renderToStaticMarkup(React.createElement(FormFieldError, { error: undefined }));
      const html3 = renderToStaticMarkup(React.createElement(FormFieldError, { error: '' }));
      expect(html1).toBe('');
      expect(html2).toBe('');
      expect(html3).toBe('');
    });

    it('renders accessible role="alert" with error text when error is present', () => {
      const html = renderToStaticMarkup(
        React.createElement(FormFieldError, {
          id: 'test-error-id',
          error: 'Email address is required. Fix hint: enter your email.',
        })
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('id="test-error-id"');
      expect(html).toContain('Email address is required. Fix hint: enter your email.');
    });
  });

  describe('Codebase Consistency Verification (All Forms Using Centralized Validation)', () => {
    const root = process.cwd();

    it('ScanView wires useFormValidation and FormFieldError', () => {
      const content = fs.readFileSync(path.join(root, 'src/components/views/ScanView.tsx'), 'utf-8');
      expect(content).toContain('useFormValidation');
      expect(content).toContain('ScanInputSchema');
      expect(content).toContain('FormFieldError');
      expect(content).toContain('id="scan-repositoryUrl"');
      expect(content).toContain('id="scan-branch"');
      expect(content).toContain('aria-invalid');
      expect(content).toContain('aria-describedby');
    });

    it('LoginPage wires useFormValidation and FormFieldError', () => {
      const content = fs.readFileSync(path.join(root, 'src/app/login/page.tsx'), 'utf-8');
      expect(content).toContain('useFormValidation');
      expect(content).toContain('LoginInputSchema');
      expect(content).toContain('FormFieldError');
      expect(content).toContain('id="login-email"');
      expect(content).toContain('id="login-password"');
      expect(content).toContain('aria-invalid');
      expect(content).toContain('aria-describedby');
    });

    it('SignupPage wires useFormValidation and FormFieldError', () => {
      const content = fs.readFileSync(path.join(root, 'src/app/signup/page.tsx'), 'utf-8');
      expect(content).toContain('useFormValidation');
      expect(content).toContain('SignupInputSchema');
      expect(content).toContain('FormFieldError');
      expect(content).toContain('id="signup-email"');
      expect(content).toContain('id="signup-password"');
      expect(content).toContain('id="signup-confirm-password"');
      expect(content).toContain('id="signup-acceptedTerms"');
      expect(content).toContain('aria-invalid');
      expect(content).toContain('aria-describedby');
    });

    it('ForgotPasswordPage wires useFormValidation and FormFieldError', () => {
      const content = fs.readFileSync(path.join(root, 'src/app/forgot-password/page.tsx'), 'utf-8');
      expect(content).toContain('useFormValidation');
      expect(content).toContain('ForgotPasswordInputSchema');
      expect(content).toContain('FormFieldError');
      expect(content).toContain('id="reset-email"');
      expect(content).toContain('aria-invalid');
      expect(content).toContain('aria-describedby');
    });

    it('DraftsView wires useFormValidation and FormFieldError for issue draft editor', () => {
      const content = fs.readFileSync(path.join(root, 'src/components/views/DraftsView.tsx'), 'utf-8');
      expect(content).toContain('useFormValidation');
      expect(content).toContain('IssueDraftEditSchema');
      expect(content).toContain('FormFieldError');
      expect(content).toContain('id="draft-edit-title"');
      expect(content).toContain('id="draft-edit-body"');
      expect(content).toContain('aria-invalid');
      expect(content).toContain('aria-describedby');
    });

    it('ProfileView wires useFormValidation and FormFieldError for profile and notes', () => {
      const content = fs.readFileSync(path.join(root, 'src/components/views/ProfileView.tsx'), 'utf-8');
      expect(content).toContain('useFormValidation');
      expect(content).toContain('ProfileUpdateSchema');
      expect(content).toContain('FormFieldError');
      expect(content).toContain('id="profile-name"');
      expect(content).toContain('id="profile-bio"');
      expect(content).toContain('aria-invalid');
      expect(content).toContain('aria-describedby');
    });

    it('AuthModal wires useFormValidation and FormFieldError for modal auth forms', () => {
      const content = fs.readFileSync(path.join(root, 'src/components/auth/AuthModal.tsx'), 'utf-8');
      expect(content).toContain('useFormValidation');
      expect(content).toContain('LoginInputSchema');
      expect(content).toContain('SignupInputSchema');
      expect(content).toContain('FormFieldError');
      expect(content).toContain('id="modal-login-email"');
      expect(content).toContain('id="modal-signup-email"');
      expect(content).toContain('aria-invalid');
      expect(content).toContain('aria-describedby');
    });
  });
});
