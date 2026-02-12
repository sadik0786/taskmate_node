const express = require("express");
const multer = require("multer");
const path = require("path");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  registerEmployee,
  login,
  uploadAvatar,
  getRoles,
  getUsersByRole,
  getUsersByRoles,
  getProfile,
  updateMobile,
  forgotPasswordRequest,
  resetPasswordSelf,
  getCurrentUser,
  checkEmailExists,
  admins,
} = require("../controllers/authController");

const router = express.Router();

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const userId = req.user.id;
    if (!userId) return cb(new Error("UserId missing"), null);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${userId}${ext}`);
  },
});
const upload = multer({ storage });

router.get("/me", authenticate, getCurrentUser);

// public
router.post("/login", login);

// protected
router.get("/admins", authenticate, authorize(["ceo", "hr"]), admins);
router.post(
  "/checkemail",
  authenticate,
  authorize(["superadmin", "admin"]),
  checkEmailExists
);
router.post(
  "/register",
  authenticate,
  authorize(["ceo", "hr"]),
  registerEmployee,
);
router.post("/mobileUpdate", authenticate, updateMobile);

router.get("/roles", authenticate, getRoles);
router.get("/by-role", authenticate, getUsersByRole);
router.get("/by-roles", authenticate, getUsersByRoles);

router.get("/profile", authenticate, getProfile);

router.post("/upload", authenticate, upload.single("avatar"), uploadAvatar);
// forgot password
router.post("/forgot_password", forgotPasswordRequest);
router.post("/reset_password_self", resetPasswordSelf);

module.exports = router;
