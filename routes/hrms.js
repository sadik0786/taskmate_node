const express = require("express");
const router = express.Router();

const {
  getAllLeaveType,
  applyLeave,
  getMyLeaves,
  updateLeaves,
  getOtherLeaveRequest,
  getPendingLeavesForHr,
} = require("../controllers/hrmsController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

router.get("/leave-types", authenticate, getAllLeaveType);
router.get("/my-leaves", authenticate, getMyLeaves);
router.post("/leave-apply", authenticate, applyLeave);
router.get(
  "/other-leaves-request",
  authenticate,
  authorize(["superadmin", "hr"]),
  getOtherLeaveRequest
);
router.put(
  "/update-leave-status",
  authorize(["superadmin", "hr"]),
  authenticate,
  updateLeaves
);

module.exports = router;
