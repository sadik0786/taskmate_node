const express = require("express");
const multer = require("multer");
const path = require("path");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  registerEmployee,
  login,
  uploadAvatar,
  getRoles,
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
router.get("/admins", authenticate, authorize(["superadmin"]), admins);
router.post(
  "/checkemail",
  authenticate,
  authorize(["superadmin", "admin"]),
  checkEmailExists
);
router.post(
  "/register",
  authenticate,
  authorize(["superadmin", "admin"]),
  registerEmployee
);
router.post("/mobileUpdate", authenticate, updateMobile);

router.get("/roles", authenticate, getRoles);
router.get("/profile", authenticate, getProfile);

router.post("/upload", authenticate, upload.single("avatar"), uploadAvatar);
// forgot password
router.post(
  "/forgot_password",
  forgotPasswordRequest // No authentication required initially
);
router.post(
  "/reset_password_self",
  resetPasswordSelf // Minimal authentication (email verification)
);

module.exports = router;
