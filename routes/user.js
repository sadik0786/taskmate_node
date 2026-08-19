const express = require("express");
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
  getUsersByHierarchy,
} = require("../controllers/userController");
const {
  authenticate,
  authorize,
  filterDataByRole,
} = require("../middleware/authMiddleware");
const router = express.Router();

// ✅ FIXED: Proper role-based routes with hierarchy filtering
router.get("/", authenticate, filterDataByRole, getUsersByHierarchy);
router.get(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  getUserById
);
router.post("/", authenticate, authorize(["manager", "admin"]), createUser);
router.post(
  "/:id",
  authenticate,
  authorize(["manager", "admin"]),
  updateUser
);
router.post("/:id", authenticate, authorize(["manager"]), deleteUser); // Only manager can delete

module.exports = router;
