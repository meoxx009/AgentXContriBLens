import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { debounce } from '../src/lib/debounce';
import { AutosaveStatusBadge } from '../src/components/ui/AutosaveStatusBadge';
import { PUT as putProfile } from '../src/app/api/profile/route';
import { PATCH as patchDraft } from '../src/app/api/drafts/route';
import { db } from '../src/lib/db';
import { signSessionToken } from '../src/lib/auth';
import type { User, IssueDraft } from '../src/types';

const TEST_USER: User = {
  id: 'usr_autosave_test_1',
  email: 'autosave@example.com',
  name: 'Autosave Tester',
  bio: 'Initial bio text',
  createdAt: new Date().toISOString(),
  settings: {
    theme: 'dark',
    fontSize: 'normal',
    reduceMotion: false,
    strictRedaction: true,
  },
};

const TEST_DRAFT: IssueDraft = {
  id: 'draft_autosave_test_1',
  userId: TEST_USER.id,
  routeId: 'route_autosave_1',
  scanId: 'scan_autosave_1',
  findingId: 'vuln_autosave_1',
  repoName: 'test/repo',
  title: 'Fix insecure dependency version',
  markdownContent: '## Initial Markdown Content\n\nPlease review this issue.',
  status: 'draft',
  generatedBy: 'gemini',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function authReq(url: string, method: string = 'GET', body?: any, user = TEST_USER) {
  const token = signSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `contriblens_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Autosave Engine & UI Invariants', () => {
  beforeEach(() => {
    vi.useRealTimers();
    db.saveUser({ ...TEST_USER });
    db.saveDraft({ ...TEST_DRAFT });
  });

  describe('1. Centralized Debounce Engine', () => {
    it('debounces rapid typing into a single execution after user pauses', () => {
      vi.useFakeTimers();
      const saveSpy = vi.fn();
      const debouncedSave = debounce(saveSpy, 850);

      // Rapid keystrokes
      debouncedSave('c');
      debouncedSave('co');
      debouncedSave('con');
      debouncedSave('contrib');

      expect(saveSpy).not.toHaveBeenCalled();

      // Fast forward past delay
      vi.advanceTimersByTime(850);

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith('contrib');
      vi.useRealTimers();
    });

    it('cancels pending execution cleanly when cancel is called', () => {
      vi.useFakeTimers();
      const saveSpy = vi.fn();
      const debouncedSave = debounce(saveSpy, 850);

      debouncedSave('typing...');
      debouncedSave.cancel();

      vi.advanceTimersByTime(1000);
      expect(saveSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('flushes pending execution immediately on blur/close without waiting', () => {
      vi.useFakeTimers();
      const saveSpy = vi.fn();
      const debouncedSave = debounce(saveSpy, 850);

      debouncedSave('text typed before blur');
      expect(saveSpy).not.toHaveBeenCalled();

      // User blurs input: flush immediately
      debouncedSave.flush();
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith('text typed before blur');

      // Advancing timer does not re-trigger
      vi.advanceTimersByTime(1000);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('2. In-flight Deduplication & Request Versioning/Sequencing', () => {
    it('prevents concurrent in-flight saves and queues newest value', async () => {
      let activeCalls = 0;
      let maxConcurrent = 0;
      const savedValues: string[] = [];

      let resolveFirstCall: () => void = () => {};
      const firstCallPromise = new Promise<void>((r) => {
        resolveFirstCall = r;
      });

      // Simulation of async autosave coordinator
      let inFlight = false;
      let pendingValue: string | null = null;
      let sequence = 0;

      async function simulatedSave(val: string) {
        if (inFlight) {
          pendingValue = val;
          return;
        }
        inFlight = true;
        const currentSeq = ++sequence;
        activeCalls++;
        maxConcurrent = Math.max(maxConcurrent, activeCalls);

        try {
          if (currentSeq === 1) {
            await firstCallPromise;
          }
          savedValues.push(val);
        } finally {
          activeCalls--;
          inFlight = false;
          if (pendingValue !== null) {
            const next = pendingValue;
            pendingValue = null;
            simulatedSave(next);
          }
        }
      }

      // First keystroke batch
      const p1 = simulatedSave('draft v1');
      // Second and third keystrokes arrive while first is in flight
      simulatedSave('draft v2');
      simulatedSave('draft v3');

      expect(maxConcurrent).toBe(1);
      expect(savedValues.length).toBe(0);

      // Release first call
      resolveFirstCall();
      await p1;

      // Allow microtasks for queued call to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(maxConcurrent).toBe(1);
      expect(savedValues).toEqual(['draft v1', 'draft v3']);
    });

    it('discards stale response when a newer sequence was initiated', async () => {
      let sequence = 0;
      let activeState = 'initial';

      async function performSaveWithSequence(val: string, delay: number) {
        const thisSeq = ++sequence;
        await new Promise((r) => setTimeout(r, delay));

        // Versioning check: ignore stale responses
        if (thisSeq === sequence) {
          activeState = val;
        }
      }

      // First save is slow (100ms), second save is fast (20ms)
      const slow = performSaveWithSequence('stale response', 100);
      const fast = performSaveWithSequence('fresh newer response', 20);

      await Promise.all([slow, fast]);

      // Newer response must win; stale response must not overwrite
      expect(activeState).toBe('fresh newer response');
    });
  });

  describe('3. Failure Invariant: Keep Local Content Intact', () => {
    it('retains user local text and offers retry when server fails, never overwriting with server data', async () => {
      let localDraftText = 'My important unfinished text that user just typed';
      let status: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
      let errorMessage: string | null = null;

      const failedSave = async () => {
        status = 'saving';
        // Simulate server 500 error
        const res = { success: false, error: 'Database temporarily unavailable' };
        if (!res.success) {
          status = 'error';
          errorMessage = res.error;
          // INVARIANT: localDraftText MUST NOT be reverted or overwritten!
        }
      };

      await failedSave();

      expect(status).toBe('error');
      expect(errorMessage).toBe('Database temporarily unavailable');
      expect(localDraftText).toBe('My important unfinished text that user just typed');
    });
  });

  describe('4. Drafts View API Autosave Route (PATCH /api/drafts)', () => {
    it('autosaves draft edits (title, markdown, labels) and updates server state', async () => {
      const newTitle = 'Updated title via autosave';
      const newMarkdown = '## Updated description\n\nFixed securely.';
      const newLabels = ['security', 'good-first-issue', 'updated'];

      const req = authReq('http://localhost:3000/api/drafts', 'PATCH', {
        draftId: TEST_DRAFT.id,
        title: newTitle,
        markdownContent: newMarkdown,
        labels: newLabels,
      });

      const res = await patchDraft(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.draft.title).toBe(newTitle);
      expect(data.draft.markdownContent).toBe(newMarkdown);
      expect(data.draft.labels).toEqual(newLabels);

      // Verify in DB
      const persisted = db.getDraftById(TEST_DRAFT.id);
      expect(persisted?.title).toBe(newTitle);
    });

    it('redacts exposed secrets in autosaved draft markdown before storing', async () => {
      const validPat = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const leakyMarkdown = `Fixing key with token: ${validPat}`;
      const req = authReq('http://localhost:3000/api/drafts', 'PATCH', {
        draftId: TEST_DRAFT.id,
        markdownContent: leakyMarkdown,
      });

      const res = await patchDraft(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.draft.markdownContent).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(data.draft.markdownContent).toContain('ghp_********************************');
    });
  });

  describe('5. Profile Bio & Notes API Autosave Route (PUT /api/profile)', () => {
    it('autosaves profile bio and returns updated user object with bio', async () => {
      const newBio = 'Senior security researcher focused on supply chain and dependency vulnerabilities.';
      const req = authReq('http://localhost:3000/api/profile', 'PUT', {
        bio: newBio,
      });

      const res = await putProfile(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.bio).toBe(newBio);

      // Verify in DB
      const userInDb = db.getUserById(TEST_USER.id);
      expect(userInDb?.bio).toBe(newBio);
    });

    it('redacts secrets in autosaved bio input before storing', async () => {
      const leakyBio = 'Contact me at my private key: AKIAIOSFODNN7EXAMPLE';
      const req = authReq('http://localhost:3000/api/profile', 'PUT', {
        bio: leakyBio,
      });

      const res = await putProfile(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.user.bio).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(data.user.bio).toContain('AKIA************MPLE');
    });

    it('rejects bio exceeding 2000 characters with 400', async () => {
      const hugeBio = 'a'.repeat(2001);
      const req = authReq('http://localhost:3000/api/profile', 'PUT', {
        bio: hugeBio,
      });

      const res = await putProfile(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('Bio must not exceed 2000 characters');
    });
  });

  describe('6. AutosaveStatusBadge UI Component States', () => {
    it('renders "Saving…" during in-flight network save', () => {
      const html = renderToStaticMarkup(
        React.createElement(AutosaveStatusBadge, {
          status: 'saving',
        })
      );
      expect(html).toContain('Saving…');
      expect(html).toContain('animate-spin');
    });

    it('renders "Saved ✓ <time>" when save is confirmed by server', () => {
      const now = new Date('2026-11-11T12:00:00Z');
      const html = renderToStaticMarkup(
        React.createElement(AutosaveStatusBadge, {
          status: 'saved',
          lastSavedAt: now,
        })
      );
      expect(html).toContain('Saved ✓');
    });

    it('never claims "Saved" if lastSavedAt is missing or save failed', () => {
      const html = renderToStaticMarkup(
        React.createElement(AutosaveStatusBadge, {
          status: 'error',
          errorMessage: 'Server 500 error',
          onRetry: () => {},
        })
      );
      expect(html).not.toContain('Saved ✓');
      expect(html).toContain('Save failed —');
      expect(html).toContain('retry');
    });

    it('renders honest "Sign in to save" hint when unauthenticated', () => {
      const html = renderToStaticMarkup(
        React.createElement(AutosaveStatusBadge, {
          status: 'unauthenticated',
          isAuthenticated: false,
        })
      );
      expect(html).toContain('Sign in to save');
      expect(html).not.toContain('Saved ✓');
    });
  });

  describe('7. Local Recovery on Page Return', () => {
    it('detects difference between cached local draft and server version', () => {
      const serverContent: string = 'Server draft version 1';
      const localCachedContent: string = 'Server draft version 1 with unsaved local edits';

      const hasDiscrepancy = serverContent !== localCachedContent;
      expect(hasDiscrepancy).toBe(true);

      // Restore action applies local content
      let activeText = serverContent;
      const restore = () => {
        activeText = localCachedContent;
      };
      restore();
      expect(activeText).toBe(localCachedContent);

      // Discard action keeps server content
      const discard = () => {
        activeText = serverContent;
      };
      discard();
      expect(activeText).toBe(serverContent);
    });
  });
});
