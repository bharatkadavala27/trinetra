const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getAllUsersAdmin,
    getUserDetailAdmin,
    verifyUser,
    banUser,
    unbanUser,
    forcePasswordReset,
    impersonateUser,
    deleteOrAnonymizeUser,
    mergeAccounts,
    bulkUserAction,
    sendSystemMessage,
    exportUsersToCsv
} = require('../controllers/adminUserController');
const {
    getAllListingsAdmin,
    getListingDetailAdmin,
    approveListing,
    rejectListing,
    requestMoreInfo,
    verifyBusinessBadge,
    flagListing,
    suspendListing,
    deleteListing,
    checkDuplicates,
    bulkListingAction,
    exportListingsCsv,
    getListingAuditTrail
} = require('../controllers/adminListingController');
const {
    getAllReviewsAdmin,
    bulkReviewAction,
    addModerationNote
} = require('../controllers/adminReviewController');
const {
    getAllRoles,
    getRoleDetail,
    createRole,
    updateRole,
    deleteRole
} = require('../controllers/adminRoleController');
const {
    getAuditLogs,
    getAuditLogDetail,
    getAuditReportByAction,
    getAuditReportByAdmin,
    getAdminActivitySummary
} = require('../controllers/auditLogController');

// Protect all admin routes - requires authentication
router.use(protect);

// ==================== USER MANAGEMENT ====================
router.get('/users', authorize('Super Admin', 'Admin'), getAllUsersAdmin);
router.get('/users/:id', authorize('Super Admin', 'Admin'), getUserDetailAdmin);
router.put('/users/:id/verify', authorize('Super Admin', 'Admin'), verifyUser);
router.put('/users/:id/ban', authorize('Super Admin', 'Admin'), banUser);
router.put('/users/:id/unban', authorize('Super Admin', 'Admin'), unbanUser);
router.put('/users/:id/force-password-reset', authorize('Super Admin', 'Admin'), forcePasswordReset);
router.post('/users/:id/impersonate', authorize('Super Admin'), impersonateUser);
router.delete('/users/:id', authorize('Super Admin', 'Admin'), deleteOrAnonymizeUser);
router.post('/users/merge', authorize('Super Admin'), mergeAccounts);
router.post('/users/bulk-action', authorize('Super Admin', 'Admin'), bulkUserAction);
router.post('/users/:id/message', authorize('Super Admin', 'Admin', 'Support'), sendSystemMessage);
router.get('/users/export/csv', authorize('Super Admin', 'Admin'), exportUsersToCsv);

// ==================== LISTING MANAGEMENT ====================
router.get('/listings', authorize('Super Admin', 'Admin', 'Moderator'), getAllListingsAdmin);
router.get('/listings/:id', authorize('Super Admin', 'Admin', 'Moderator'), getListingDetailAdmin);
router.put('/listings/:id/approve', authorize('Super Admin', 'Admin'), approveListing);
router.put('/listings/:id/reject', authorize('Super Admin', 'Admin'), rejectListing);
router.put('/listings/:id/request-info', authorize('Super Admin', 'Admin'), requestMoreInfo);
router.put('/listings/:id/verify-badge', authorize('Super Admin', 'Admin'), verifyBusinessBadge);
router.put('/listings/:id/flag', authorize('Super Admin', 'Admin', 'Moderator'), flagListing);
router.put('/listings/:id/suspend', authorize('Super Admin', 'Admin'), suspendListing);
router.delete('/listings/:id', authorize('Super Admin', 'Admin'), deleteListing);
router.get('/listings/:id/check-duplicates', authorize('Super Admin', 'Admin'), checkDuplicates);
router.post('/listings/bulk-action', authorize('Super Admin', 'Admin'), bulkListingAction);
router.get('/listings/export/csv', authorize('Super Admin', 'Admin'), exportListingsCsv);
router.get('/listings/:id/audit', authorize('Super Admin', 'Admin', 'Moderator'), getListingAuditTrail);

// ==================== REVIEW MODERATION ====================
router.get('/reviews', authorize('Super Admin', 'Admin', 'Moderator'), getAllReviewsAdmin);
router.post('/reviews/bulk-action', authorize('Super Admin', 'Admin'), bulkReviewAction);
router.put('/reviews/:id/note', authorize('Super Admin', 'Admin', 'Moderator'), addModerationNote);

// ==================== ROLE MANAGEMENT ====================
router.get('/roles', authorize('Super Admin', 'Admin'), getAllRoles);
router.get('/roles/:id', authorize('Super Admin', 'Admin'), getRoleDetail);
router.post('/roles', authorize('Super Admin'), createRole);
router.put('/roles/:id', authorize('Super Admin'), updateRole);
router.delete('/roles/:id', authorize('Super Admin'), deleteRole);

// ==================== AUDIT LOGS ====================
router.get('/audit-logs', authorize('Super Admin', 'Admin', 'Finance'), getAuditLogs);
router.get('/audit-logs/:id', authorize('Super Admin', 'Admin'), getAuditLogDetail);
router.get('/audit-logs/report/by-action', authorize('Super Admin', 'Admin', 'Finance'), getAuditReportByAction);
router.get('/audit-logs/report/by-admin', authorize('Super Admin', 'Finance'), getAuditReportByAdmin);
router.get('/audit-logs/admin/:adminId/summary', authorize('Super Admin', 'Finance'), getAdminActivitySummary);

module.exports = router;
