const express = require("express");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  getEmployees,
  deleteEmployees,
  getEmployeeTasks,
  getAllEmployeeTasks,
  getAllAdminTasks,
  addProject,
  listProjects,
  addSubProject,
  listSubProjects,
  listSubProjectsByProject,
  checkEmailExists,
  resetPassword,
} = require("../controllers/adminController");

const router = express.Router();

router.get(
  "/employee",
  authenticate,
  authorize(["superadmin", "admin"]),
  getEmployees
);
router.post("/employee/:id", authenticate, deleteEmployees);
router.get(
  "/all_task_admin",
  authenticate,
  authorize(["superadmin"]),
  getAllAdminTasks
);
// Superadmin  can see by id admin / employee tasks
router.get(
  "/emp_tasks/:empId",
  authenticate,
  authorize(["superadmin", "admin"]),
  getEmployeeTasks
);
// Superadmin or Admin can see list of all tasks
router.get(
  "/all_task_emp",
  authenticate,
  authorize(["superadmin", "admin"]),
  getAllEmployeeTasks
);
// ---------------- add project
router.post("/addProject", authenticate, authorize(["admin"]), addProject);
//----------------- get all saved project
router.get("/listProject", authenticate, listProjects);
//----------------- add sub project
router.post(
  "/addSubProject",
  authenticate,
  authorize(["admin", "employee"]),
  addSubProject
);
//----------------- get all saved sub project
router.get("/listSubProject", authenticate, listSubProjects);
router.get("/listSubProjectsByProject", authenticate, listSubProjectsByProject);
//----------------- Reset Password Routes
router.post(
  "/check_email",
  authenticate,
  authorize(["superadmin", "admin"]),
  checkEmailExists
);
router.post(
  "/reset_password",
  authenticate,
  authorize(["superadmin", "admin"]),
  resetPassword
);

module.exports = router;
