const bcrypt = require("bcryptjs");
const { poolPromise, sql } = require("../db");

// ------------------ GET USERS BY HIERARCHY ------------------//
exports.getUsersByHierarchy = async (req, res) => {
  try {
    const user = req.user;
    const userRole = user.role.toLowerCase();
    const pool = await poolPromise;

    let query = `
      SELECT 
        u.ID, u.Name, u.Email, u.Mobile, u.RoleID, 
        u.ReportingID, u.CreatedAt,
        r.RoleName
      FROM UserTaskMateApp u
      LEFT JOIN RoleTaskMateApp r ON u.RoleID = r.RoleId
      WHERE r.IsActive = 1
    `;

    let request = pool.request();

    // ✅ Apply role-based filtering
    if (userRole === "superadmin") {
      // Superadmin sees all users
      query += ` AND u.ID != @currentUserId`; // Optional: exclude self
      request.input("currentUserId", sql.Int, user.id);
    } else if (userRole === "admin") {
      // Admin sees themselves + users they created
      query += ` AND`;
    } else if (userRole === "employee") {
      // Employee sees only themselves
      query += ` AND u.ID = @userId`;
      request.input("userId", sql.Int, user.id);
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    query += ` ORDER BY u.CreatedAt DESC`;

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (err) {
    console.error("getUsersByHierarchy error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ------------------ GET USER BY ID ------------------//
exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUser = req.user;
    const pool = await poolPromise;

    // First get the target user
    const userResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT u.*, r.RoleName 
        FROM UserTaskMateApp u 
        LEFT JOIN RoleTaskMateApp r ON u.RoleID = r.RoleId 
        WHERE u.ID = @userId
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const targetUser = userResult.recordset[0];

    // ✅ Check hierarchical access
    const hasAccess = await checkUserAccess(currentUser, targetUser, pool);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    res.json({
      success: true,
      data: targetUser,
    });
  } catch (err) {
    console.error("getUserById error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ------------------ CREATE USER (Admin/Superadmin only) ------------------//
exports.createUser = async (req, res) => {
  const { name, email, mobile, password, roleId } = req.body;

  try {
    const creatorRole = req.user.role.toLowerCase();
    const creatorId = req.user.id;

    // Validation
    if (!name || !email || !password || !roleId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
    }

    if (!email.endsWith("@5nance.com")) {
      return res
        .status(400)
        .json({ success: false, error: "Only @5nance.com emails allowed" });
    }

    const pool = await poolPromise;

    // Check duplicate email
    const existing = await pool
      .request()
      .input("Email", sql.NVarChar(150), email)
      .query("SELECT 1 FROM UserTaskMateApp WHERE Email = @Email");

    if (existing.recordset.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine hierarchy
    const createdBy = creatorId;
    let reportingId = creatorId;

    // Insert user
    const result = await pool
      .request()
      .input("Name", sql.NVarChar(100), name)
      .input("Email", sql.NVarChar(150), email)
      .input("Mobile", sql.VarChar(15), mobile || null)
      .input("PasswordHash", sql.NVarChar(255), hashedPassword)
      .input("RoleID", sql.Int, roleId)
      .input("ReportingID", sql.Int, reportingId).query(`
        INSERT INTO UserTaskMateApp 
        (Name, Email, Mobile, PasswordHash, RoleID, ReportingID)
        OUTPUT INSERTED.*
        VALUES (@Name, @Email, @Mobile, @PasswordHash, @RoleID, @ReportingID)
      `);

    const newUser = result.recordset[0];

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: newUser.ID,
        name: newUser.Name,
        email: newUser.Email,
        roleId: newUser.RoleID,
      },
    });
  } catch (err) {
    console.error("createUser error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ------------------ UPDATE USER ------------------//
exports.updateUser = async (req, res) => {
  const userId = req.params.id;
  const { name, email, mobile } = req.body;

  try {
    const currentUser = req.user;
    const pool = await poolPromise;

    // First check if target user exists and current user has access
    const targetUserResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query("SELECT * FROM UserTaskMateApp WHERE ID = @userId");

    if (targetUserResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const targetUser = targetUserResult.recordset[0];

    // Check access rights
    const hasAccess = await checkUserAccess(currentUser, targetUser, pool);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    // Update user
    const result = await pool
      .request()
      .input("id", sql.Int, userId)
      .input("name", sql.NVarChar(100), name)
      .input("email", sql.NVarChar(150), email)
      .input("mobile", sql.VarChar(15), mobile).query(`
        UPDATE UserTaskMateApp 
        SET Name = @name, Email = @email, Mobile = @mobile, UpdatedAt = GETDATE()
        WHERE ID = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ------------------ DELETE USER (Superadmin only) ------------------//
exports.deleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    const pool = await poolPromise;

    // Check if user exists
    const userResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query("SELECT * FROM UserTaskMateApp WHERE ID = @userId");

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Delete user
    const result = await pool
      .request()
      .input("id", sql.Int, userId)
      .query("DELETE FROM UserTaskMateApp WHERE ID = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ HELPER: Check hierarchical access rights
async function checkUserAccess(currentUser, targetUser, pool) {
  const currentRole = currentUser.role.toLowerCase();

  if (currentRole === "superadmin") {
    return true; // Superadmin can access all users
  } else if (currentRole === "admin") {
    // Admin can access themselves and users they created
    return (
      targetUser.ID === currentUser.id ||
      targetUser.CreatedBy === currentUser.id
    );
  } else if (currentRole === "employee") {
    // Employee can only access themselves
    return targetUser.ID === currentUser.id;
  }

  return false;
}
