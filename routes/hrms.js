const express = require("express");
const router = express.Router();

const {
  getAllEmployee,
  getHolidays,
  getMyPayslips,
  getTodayEvents,
} = require("../controllers/hrms/miscController");

const {
  getAllLeaveType,
  applyLeave,
  getMyLeaves,
  updateLeaves,
  getOtherLeaveRequest,
  getPendingLeavesForHr,
  getAllLeaveReport,
  cancelLeave,
  getTodayLeaves,
} = require("../controllers/hrms/leaveController");

const {
  punchIn,
  punchOut,
  takeBreak,
  endBreak,
  getTodayAttendance,
  getAttendanceHistory,
  getAdminAttendanceReport,
} = require("../controllers/hrms/attendanceController");

const {
  applyRegularization,
  getMyRegularizations,
  getPendingRegularizations,
  updateRegularizationStatus,
} = require("../controllers/hrms/regularizationController");

const { authenticate, authorize } = require("../middleware/authMiddleware");

router.get("/all-employee", authenticate, getAllEmployee);
router.get("/leave-types", authenticate, getAllLeaveType);
router.get("/my-leaves", authenticate, getMyLeaves);
router.post("/leave-apply", authenticate, applyLeave);
router.get(
  "/other-leaves-request",
  authenticate,
  authorize(["superadmin", "hr", "ceo", "manager"]),
  getOtherLeaveRequest
);
router.put(
  "/update-leave-status",
  authenticate,
  authorize(["superadmin", "hr", "ceo", "manager"]),
  updateLeaves
);
router.get(
  "/all-leaves-report",
  authenticate,
  authorize(["superadmin", "hr", "ceo", "manager"]),
  getAllLeaveReport
);
router.delete("/leave-cancel/:id", authenticate, cancelLeave);
router.get(
  "/today-leaves",
  authenticate,
  authorize(["superadmin", "hr", "ceo", "manager"]),
  getTodayLeaves
);

// Phase 2 & 3 Routes
router.get("/holidays", authenticate, getHolidays);

router.post("/attendance/punch-in", authenticate, punchIn);
router.post("/attendance/punch-out", authenticate, punchOut);
router.post("/attendance/take-break", authenticate, takeBreak);
router.post("/attendance/end-break", authenticate, endBreak);
router.get("/attendance/today", authenticate, getTodayAttendance);
router.get("/attendance/history", authenticate, getAttendanceHistory);

// Admin Attendance Report
router.get(
  "/attendance/admin-report",
  authenticate,
  authorize(["superadmin", "hr", "ceo", "manager"]),
  getAdminAttendanceReport
);

// Regularization Routes
router.post("/attendance/regularize", authenticate, applyRegularization);
router.get("/attendance/regularize/my-requests", authenticate, getMyRegularizations);
router.get(
  "/attendance/regularize/pending",
  authenticate,
  authorize(["superadmin", "hr", "ceo", "manager"]),
  getPendingRegularizations
);
router.put(
  "/attendance/regularize/status",
  authenticate,
  authorize(["superadmin", "hr", "ceo", "manager"]),
  updateRegularizationStatus
);

router.get("/my-payslips", authenticate, getMyPayslips);

// Today's events
router.get("/today-events", authenticate, getTodayEvents);

module.exports = router;
