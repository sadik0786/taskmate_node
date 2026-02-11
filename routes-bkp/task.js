const express = require("express");
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");
const {
  authenticate,
  authorize,
  filterDataByRole,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/getTask", authenticate, filterDataByRole, getTasks);

router.post(
  "/addTask",
  authenticate,
  authorize(["employee", "admin"]),
  createTask
);
router.post(
  "/updateTask/:id",
  authenticate,
  authorize(["employee", "admin"]),
  updateTask
);
router.post(
  "/deleteTask/:id",
  authenticate,
  authorize(["employee", "admin"]),
  deleteTask
);

module.exports = router;
