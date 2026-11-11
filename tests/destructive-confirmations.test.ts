import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Goal 11 — Destructive Actions & Explicit Confirmation Guards', () => {
  const readComponent = (relPath: string) => {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
  };

  describe('1. Shared ConfirmDialog Component Architecture', () => {
    it('verifies ConfirmDialog component implements accessibility and safety invariants', () => {
      const source = readComponent('src/components/ui/ConfirmDialog.tsx');
      // Role & Accessibility
      expect(source).toContain('role="alertdialog"');
      expect(source).toContain('aria-modal="true"');
      expect(source).toContain('aria-labelledby="confirm-dialog-title"');
      expect(source).toContain('aria-describedby="confirm-dialog-description"');

      // Default safe focus on cancel
      expect(source).toContain('cancelButtonRef.current.focus()');

      // Escape key aborts
      expect(source).toContain("e.key === 'Escape'");
      expect(source).toContain('onCancel()');

      // Consequence warning support
      expect(source).toContain('consequenceWarning');

      // Typed confirmation support for high-severity destruction
      expect(source).toContain('requireTypedConfirmation');
      expect(source).toContain('typedConfirmationPhrase');
      expect(source).toContain('isTypedConfirmationValid');
    });
  });

  describe('2. Findings Actions Confirmation Guards (Single & Bulk Dismiss/Unmark)', () => {
    it('verifies FindingsView guards bulk unmark and bulk dismiss with ConfirmDialog', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      // ConfirmDialog is imported and used
      expect(findingsSource).toContain('import ConfirmDialog');
      expect(findingsSource).toContain('showUnmarkConfirm');
      expect(findingsSource).toContain('showDismissConfirm');

      // Bulk actions toolbar triggers confirmation states
      expect(findingsSource).toContain('setShowUnmarkConfirm(true)');
      expect(findingsSource).toContain('setShowDismissConfirm(true)');

      // ConfirmDialog instances with plain-language consequence warnings
      expect(findingsSource).toContain('Dismissed findings will be hidden from active contribution routes');
      expect(findingsSource).toContain('executeBulkDismiss(true)');
      expect(findingsSource).toContain('executeBulkReview(false)');
    });

    it('verifies FindingDetailsView guards single finding dismiss and unmark with ConfirmDialog', () => {
      const detailsSource = readComponent('src/components/views/FindingDetailsView.tsx');
      expect(detailsSource).toContain('import ConfirmDialog');
      expect(detailsSource).toContain('showUnmarkConfirm');
      expect(detailsSource).toContain('showDismissConfirm');

      // Guarded handlers
      expect(detailsSource).toContain('handleToggleReviewClick');
      expect(detailsSource).toContain('handleDismissFinding');

      // Consequence warnings and soft-delete/archive restore option
      expect(detailsSource).toContain('Dismissed findings are soft-archived');
      expect(detailsSource).toContain('Restore Finding');
    });

    it('verifies PATCH /api/findings/[findingId] supports soft-delete status transitions', () => {
      const routeSource = readComponent('src/app/api/findings/[findingId]/route.ts');
      expect(routeSource).toContain('body?.status');
      expect(routeSource).toContain("body?.status === 'dismissed'");
      expect(routeSource).toContain("Dismissed finding:");
    });
  });

  describe('3. Issue Drafts Deletion & Unsaved Content Guards', () => {
    it('verifies DraftsView uses ConfirmDialog for deletion instead of silent or one-click delete', () => {
      const draftsSource = readComponent('src/components/views/DraftsView.tsx');
      expect(draftsSource).toContain('import ConfirmDialog');
      expect(draftsSource).toContain('showDeleteConfirm');
      expect(draftsSource).toContain('setShowDeleteConfirm(true)');
      expect(draftsSource).toContain('handleDeleteDraft');
      expect(draftsSource).toContain('This permanently deletes this draft record');
    });

    it('verifies DraftsView guards unsaved edits before switching drafts or unloading', () => {
      const draftsSource = readComponent('src/components/views/DraftsView.tsx');
      expect(draftsSource).toContain('showDiscardUnsavedConfirm');
      expect(draftsSource).toContain('draftAutosave.hasUnsavedChanges');
      expect(draftsSource).toContain('setShowDiscardUnsavedConfirm(true)');
      expect(draftsSource).toContain('beforeunload');
    });

    it('preserves the Human Approval Gate as the strongest review barrier', () => {
      const draftsSource = readComponent('src/components/views/DraftsView.tsx');
      expect(draftsSource).toContain('Approve & Unlock Export');
      expect(draftsSource).toContain('showRejectModal');
      expect(draftsSource).toContain('Record Rejection Reason');
      expect(draftsSource).toContain('handleRejectDraft');
    });
  });

  describe('4. Dashboard Repository Scans Deletion Guard', () => {
    it('verifies DashboardView guards scan deletion with ConfirmDialog and consequence warning', () => {
      const dashboardSource = readComponent('src/components/views/DashboardView.tsx');
      expect(dashboardSource).toContain('import ConfirmDialog');
      expect(dashboardSource).toContain('showDeleteScanConfirm');
      expect(dashboardSource).toContain('scanToDelete');
      expect(dashboardSource).toContain('setShowDeleteScanConfirm(true)');
      expect(dashboardSource).toContain('handleDeleteScan');
      expect(dashboardSource).toContain('This permanently deletes the scan record and all associated findings');
    });
  });

  describe('5. Profile & Settings Destructive Guards (Typed Delete & Unsaved Bio)', () => {
    it('verifies ProfileView requires typed confirmation phrase DELETE for account deletion', () => {
      const profileSource = readComponent('src/components/views/ProfileView.tsx');
      expect(profileSource).toContain('import ConfirmDialog');
      expect(profileSource).toContain('showDeleteAccountConfirm');
      expect(profileSource).toContain('requireTypedConfirmation={true}');
      expect(profileSource).toContain('typedConfirmationPhrase="DELETE"');
      expect(profileSource).toContain('handleDeleteAccount');
    });

    it('verifies ProfileView guards workspace history clearing with ConfirmDialog', () => {
      const profileSource = readComponent('src/components/views/ProfileView.tsx');
      expect(profileSource).toContain('showClearConfirm');
      expect(profileSource).toContain('handleClearData');
      expect(profileSource).toContain('Clear Workspace History?');
    });

    it('verifies ProfileView guards local bio recovery discard with ConfirmDialog', () => {
      const profileSource = readComponent('src/components/views/ProfileView.tsx');
      expect(profileSource).toContain('showDiscardRecoveryConfirm');
      expect(profileSource).toContain('Discard Local Notes Recovery?');
      expect(profileSource).toContain('bioAutosave.recovery.discard()');
    });

    it('verifies ProfileView guards Sign Out when unsaved bio notes are present', () => {
      const profileSource = readComponent('src/components/views/ProfileView.tsx');
      expect(profileSource).toContain('showLogoutWithUnsavedConfirm');
      expect(profileSource).toContain('bioAutosave.hasUnsavedChanges');
      expect(profileSource).toContain('handleLogoutClick');
      expect(profileSource).toContain('Sign Out with Unsaved Changes?');
    });
  });

  describe('6. Live Action Log Active Run Cancellation Guard', () => {
    it('verifies LiveActionLog guards cancelling active agent run with ConfirmDialog', () => {
      const logSource = readComponent('src/components/agent/LiveActionLog.tsx');
      expect(logSource).toContain('import ConfirmDialog');
      expect(logSource).toContain('showCancelConfirm');
      expect(logSource).toContain('setShowCancelConfirm(true)');
      expect(logSource).toContain('handleCancelRun');
      expect(logSource).toContain('Cancel Active Agent Run?');
      expect(logSource).toContain('This terminates the execution stream and discards any uncompleted plan steps');
    });
  });
});
