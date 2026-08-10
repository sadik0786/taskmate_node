const express = require("express");
const router = express.Router();

const {
  getAllEmployee,
  getAllLeaveType,
  applyLeave,
  getMyLeaves,
  updateLeaves,
  getOtherLeaveRequest,
  getPendingLeavesForHr,
  getAllLeaveReport,
  cancelLeave,
  getTodayLeaves,
  getHolidays,
  punchIn,
  punchOut,
  getTodayAttendance,
  getMyPayslips,
  getTodayEvents,
  getAttendanceHistory,
} = require("../controllers/hrmsController");
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
router.get("/attendance/today", authenticate, getTodayAttendance);
router.get("/attendance/history", authenticate, getAttendanceHistory);

router.get("/my-payslips", authenticate, getMyPayslips);

// Today's events
router.get("/today-events", authenticate, getTodayEvents);

module.exports = router;
