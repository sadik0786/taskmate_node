require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { poolPromise, sql } = require("../db");
const { ROLES, ROLE_IDS } = require("../config/constants");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id; // set by authenticate middleware
    const pool = await poolPromise;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT 
          U.ID,
          U.Name,
          U.Email,
          U.RoleID AS UserRoleID,
          R.RoleName
        FROM dbo.UserTaskMateApp U
        INNER JOIN dbo.RoleTaskMateApp R ON U.RoleID = R.RoleID
        WHERE U.ID = @userId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const user = result.recordset[0];
    res.json({ success: true, user });
  } catch (err) {
    console.error("getCurrentUser error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
// all admins
exports.admins = async (req, res) => {
  try {
    const user = req.user;
    const pool = await poolPromise;
    if (user.role.toLowerCase() !== "ceo") {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const query = `
      SELECT 
        U.ID, 
        U.Name, 
        U.Email
      FROM dbo.UserTaskMateApp U
      INNER JOIN dbo.RoleTaskMateApp R ON U.RoleID = R.RoleID
      WHERE R.RoleName in( 'hr','accountant','superadmin','admin','employee')
      ORDER BY U.Name
    `;

    const result = await pool.request().query(query);

    res.json({
      success: true,
      admins: result.recordset,
    });
  } catch (err) {
    console.error("Error fetching admins:", err);
    res.status(500).json({ error: "Failed to fetch admins" });
  }
};
exports.checkEmailExists = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!email.endsWith("@5nance.com")) {
      return res.status(400).json({
        emailExists: false,
        message: "Only @5nance.com emails are allowed",
      });
    }

    const pool = await poolPromise;

    // Check if email exists in EmailTaskMateApp table and is active
    const emailCheckQuery = `
      SELECT COUNT(*) as emailCount 
      FROM dbo.EmailTaskMateApp 
      WHERE EmpEmail = @Email AND IsActive = 1
    `;

    const emailCheckResult = await pool
      .request()
      .input("Email", sql.NVarChar(150), email)
      .query(emailCheckQuery);

    const emailExists = emailCheckResult.recordset[0].emailCount > 0;

    res.json({
      success: true,
      emailExists: emailExists,
      message: emailExists
        ? "Email found in authorized list"
        : "Email not found in authorized list",
    });
  } catch (err) {
    console.error("checkEmailExists error:", err);
    res.status(500).json({
      success: false,
      error: "Server error during email check",
    });
  }
};
//------ REGISTER EMPLOYEE (Admin only)
exports.registerEmployee = async (req, res) => {
const { name, email, mobile, password, roleId, reportingId } = req.body;


  try {
    const creatorRole = (req.user.role || "").toLowerCase();
    const creatorId = req.user.id;
    // Convert roleId to number (VERY IMPORTANT)
    const newRoleId = Number(roleId);
    if (!newRoleId) {
      return res.status(400).json({
        success: false,
        error: "Invalid roleId",
      });
    }
    // Mobile validation
    if (mobile && !/^\d{10,15}$/.test(mobile)) {
      return res.status(400).json({ error: "Invalid mobile number" });
    }
    if (!email.endsWith("@5nance.com")) {
      return res
        .status(400)
        .json({ error: "Only @5nance.com emails are allowed" });
    }

    // Role Hierarchy Logic
    if (creatorRole === ROLES.CEO) {
      if (
        ![ROLE_IDS.HR, ROLE_IDS.Accountant, ROLE_IDS.SuperAdmin].includes(
          newRoleId,
        )
      ) {
        return res.status(403).json({
          success: false,
          error: "CEO can only create HR, Accountant, or SuperAdmin",
        });
      }
    } else if (creatorRole === ROLES.HR) {
      if (![ROLE_IDS.Admin, ROLE_IDS.Employee].includes(newRoleId)) {
        return res.status(403).json({
          success: false,
          error: "HR can only create Admin or Employee",
        });
      }
    }

    const pool = await poolPromise;
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool
      .request()
      .input("Name", sql.NVarChar(100), name)
      .input("Email", sql.NVarChar(150), email)
      .input(
        "Mobile",
        sql.VarChar(15),
        mobile && mobile.trim() !== "" ? mobile : null,
      )
      .input("PasswordHash", sql.NVarChar(255), hashedPassword)
      .input("RoleID", sql.Int, newRoleId)
      .input("ReportingID", sql.Int, reportingId || creatorId)
      .input("CreatedBy", sql.Int, creatorId)
      .execute("dbo.Usp_PostRegisterEmployeeTaskMateAppApi");

    const employee = result.recordset?.[0];
    if (!employee) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to create employee" });
    }

    res.json({
      success: true,
      employee,
    });
  } catch (err) {
    console.error("Register Employee error:", err);

    if (err.message?.includes("already exists")) {
      return res.status(200).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: "Server error" });
  }
};
//------ Get role (filtered by logged-in user)
exports.getRoles = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(
        "SELECT RoleId, RoleName, IsActive FROM dbo.RoleTaskMateApp WHERE IsActive = 1 ORDER BY RoleId",
      );

    let roles = result.recordset || [];
    const userRole = (req.user?.role || "").toLowerCase().trim();

     if (userRole === "ceo") {
       roles = roles.filter((r) => {
         const role = (r.RoleName || "").toLowerCase().trim();
         return role === "hr" || role === "accountant" || role === "superadmin";
       });
     } else if (userRole === "hr") {
       roles = roles.filter((r) => {
         const role = (r.RoleName || "").toLowerCase().trim();
         return role === "admin" || role === "employee";
       });
     } else {
       roles = [];
     }

    return res.json({ success: true, data: roles });
  } catch (err) {
    console.error("getRoles error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

  // GET /users/by-role?role=superadmin
  exports.getUsersByRole = async (req, res) => {
    try {
      const { role } = req.query;
      if (!role) {
        return res.status(400).json({
          success: false,
          error: "Role is required",
        });
      }

      const pool = await poolPromise;
      const result = await pool.request().input("RoleName", sql.NVarChar, role)
        .query(`
      SELECT u.ID, u.Name 
      FROM UserTaskMateApp u
      JOIN RoleTaskMateApp r ON u.RoleID = r.RoleId
      WHERE LOWER(r.RoleName) = LOWER(@RoleName)
    `);

      res.json({
        success: true,
        data: result.recordset,
      });
    } catch (err) {
      console.error("getUsersByRole error:", err);
      res.status(500).json({
        success: false,
        error: "Server error",
      });
    }
  };
  exports.getUsersByRoles = async (req, res) => {
    try {
      let roles = req.query.roles;

      if (!roles) {
        return res.status(400).json({
          success: false,
          error: "Roles required",
        });
      }

      if (!Array.isArray(roles)) {
        roles = [roles];
      }

      const pool = await poolPromise;
      const request = pool.request();

      roles.forEach((role, index) => {
        request.input(`role${index}`, sql.NVarChar, role);
      });

      const conditions = roles
        .map((_, index) => `LOWER(r.RoleName) = LOWER(@role${index})`)
        .join(" OR ");

      const result = await request.query(`
      SELECT u.ID, u.Name
      FROM UserTaskMateApp u
      JOIN RoleTaskMateApp r ON u.RoleID = r.RoleId
      WHERE ${conditions}
      ORDER BY u.Name
    `);

      res.json({
        success: true,
        data: result.recordset,
      });
    } catch (err) {
      console.error("getUsersByRoles error:", err);
      res.status(500).json({
        success: false,
        error: "Server error",
      });
    }
  };


//------ GET PROFILE
exports.getProfile = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("UserId", sql.Int, req.user.id)
      .query(
        `SELECT u.ID, u.Name, u.Email, u.Mobile, u.RoleID, r.RoleName, u.ReportingID
         FROM dbo.UserTaskMateApp u
         LEFT JOIN dbo.RoleTaskMateApp r ON u.RoleID = r.RoleId
         WHERE u.ID = @UserId`,
      );

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const u = result.recordset[0];
    res.json({
      success: true,
      user: {
        id: u.ID,
        name: u.Name,
        email: u.Email,
        mobile: u.Mobile,
        roleId: u.RoleID,
        roleName: (u.RoleName || "").toString(),
        reportingId: u.ReportingID,
      },
    });
  } catch (err) {
    console.error("getProfile error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
//------ LOGIN
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(200).json({
      success: false,
      message: "Please enter both email and password.",
    });
  }

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Email", sql.NVarChar(150), email)
      .execute("dbo.Usp_PostLoginUserTaskMateAppApi");

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No account found with this email address.",
      });
    }

    const user = result.recordset[0];
    const isValid = await bcrypt.compare(password, user.PasswordHash);

    if (!isValid) {
      return res.status(200).json({
        success: false,
        message: "Incorrect password. Please try again.",
      });
    }

    // Map DB role names to canonical names
    const roleMap = {
      superadmin: "superadmin",
      admin: "admin",
      employee: "employee",
    };
    const normalizedRole =
      roleMap[user.RoleName.toLowerCase()] || user.RoleName.toLowerCase();

    const tokenPayload = {
      id: user.ID,
      role: normalizedRole,
      reportingId: user.ReportingID || 0,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user.ID,
        name: user.Name,
        email: user.Email,
        mobile: user.Mobile,
        roleId: user.RoleID,
        role: normalizedRole,
        reportingId: user.ReportingID,
      },
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(200).json({
      success: false,
      message: "Something went wrong on the server. Please try again later.",
    });
  }
};
//------ update mobile
exports.updateMobile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mobile } = req.body;
    // console.log("📥 updateMobile userId:", userId, "mobile:", mobile);

    if (!mobile) {
      return res
        .status(400)
        .json({ success: false, error: "Mobile number is required" });
    }

    const pool = await poolPromise;
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("Mobile", sql.NVarChar(15), mobile)
      .query(
        "UPDATE dbo.UserTaskMateApp SET Mobile = @Mobile WHERE ID = @UserID",
      );

    res.json({ success: true, message: "Mobile updated successfully" });
  } catch (error) {
    console.error("updateMobile error:", error);
    if (error.originalError && error.originalError.info) {
      return res.status(400).json({ error: error.originalError.info.message });
    }
    res.status(500).json({ success: false, error: "Failed to update mobile" });
  }
};
//------ UPLOAD AVATAR
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file || typeof req.file.path !== "string") {
      return res.status(400).json({ error: "Invalid file upload" });
    }

    const userId = req.user.id;
    const filePath = String(req.file.path);

    // 🔹 Define extension properly
    const ext = path.extname(req.file.originalname) || ".jpg";

    const filename = userId + ext;
    const outputPath = path.join("uploads", filename);
    const tempPath = filePath + "_resized" + ext;

    // Resize using sharp
    await sharp(filePath)
      .resize(300, 300, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toFile(tempPath);

    // Remove original
    fs.unlinkSync(filePath);

    // Ensure uploads folder exists
    if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

    // Remove previous file if exists
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // Rename resized file
    fs.renameSync(tempPath, outputPath);

    // Build URL
    const fileUrl = `${
      process.env.SERVER_URL || "http://192.168.1.117:5000"
    }/uploads/${filename}`;

    // Save URL in DB
    const pool = await poolPromise;
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProfileImage", sql.NVarChar(sql.MAX), fileUrl)
      .query(
        "UPDATE dbo.UserTaskMateApp SET ProfileImage = @ProfileImage WHERE ID = @UserID",
      );

    res.json({ success: true, url: fileUrl });
  } catch (err) {
    console.error("uploadAvatar error:", err);
    if (err.originalError && err.originalError.info) {
      return res.status(400).json({ error: err.originalError.info.message });
    }
    res.status(500).json({ error: "Failed to upload image" });
  }
};
//------ Request password reset (send email with reset link/token)
exports.forgotPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .query(
        "SELECT ID, Email, Name FROM UserTaskMateApp WHERE Email = @Email",
      );

    if (result.recordset.length === 0) {
      // Don't reveal if email exists for security
      return res.json({
        success: true,
        message: "If the email exists, a reset link has been sent",
      });
    }

    const user = result.recordset[0];
    // Generate reset token, send email, etc.
    // For now, just return success

    res.json({
      success: true,
      message: "If the email exists, a reset link has been sent",
    });
  } catch (err) {
    console.error("forgotPasswordRequest error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
//------ Reset password with token/email verification
exports.resetPasswordSelf = async (req, res) => {
  try {
    const { email, newPassword, resetToken } = req.body;

    // Validate inputs
    if (!email || !newPassword) {
      return res.json({
        success: false,
        error: "Email and password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.json({
        success: false,
        error: "Password must be at least 6 characters",
      });
    }

    const pool = await poolPromise;

    // Verify user exists
    const userResult = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .query("SELECT ID FROM UserTaskMateApp WHERE Email = @Email");

    if (userResult.recordset.length === 0) {
      return res.json({ success: false, error: "User not found" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .input("passwordHash", sql.NVarChar, hashedPassword)
      .query(
        "UPDATE UserTaskMateApp SET PasswordHash = @passwordHash WHERE Email = @Email",
      );

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (err) {
    console.error("resetPasswordSelf error:", err);
    res.status(500).json({ success: false, error: "Failed to reset password" });
  }
};
