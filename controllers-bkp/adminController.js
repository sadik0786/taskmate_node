const bcrypt = require("bcryptjs");
const { poolPromise, sql } = require("../db");

exports.getEmployees = async (req, res) => {
  try {
    const user = req.user;
    const pool = await poolPromise;

    // let query = `
    //   SELECT U.ID, U.ProfileImage, U.Name, U.Email, U.Mobile, R.RoleName, U.ReportingID
    //   FROM dbo.UserTaskMateApp U
    //   INNER JOIN dbo.RoleTaskMateApp R ON U.RoleID = R.RoleID
    // `;

    let query = `
      SELECT 
        U.ID, 
        U.ProfileImage, 
        U.Name, 
        U.Email, 
        U.Mobile, 
        R.RoleName, 
        U.ReportingID,
        R2.RoleName AS ReportingRole,
        U2.Name AS AddedByName
      FROM dbo.UserTaskMateApp U
      INNER JOIN dbo.RoleTaskMateApp R ON U.RoleID = R.RoleID
      LEFT JOIN dbo.UserTaskMateApp U2 ON U.ReportingID = U2.ID
      LEFT JOIN dbo.RoleTaskMateApp R2 ON U2.RoleID = R2.RoleID
    `;

    if (user.role.toLowerCase() === "admin") {
      // Admin sees only employees reporting to admin
      query += ` WHERE U.ReportingID = @userId AND R.RoleName = 'employee'`;
    } else if (user.role.toLowerCase() === "superadmin") {
      // Superadmin sees all users they created (admins + employees)
      query += ` WHERE R.RoleName IN ('admin', 'employee')`;
    } else {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const result = await pool
      .request()
      .input("userId", sql.Int, user.id)
      .query(query);

    res.json({
      success: true,
      employees: result.recordset,
    });
  } catch (err) {
    console.error("getEmployees error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
// Superadmin  can delete admin / employee
// admin delete only they added
exports.deleteEmployees = async (req, res) => {
  try {
    const { id } = req.params; // target employee/admin id
    const userRole = req.user.role.toLowerCase();
    const userId = req.user.id;

    const pool = await poolPromise;

    // First, fetch the target employee
    const targetUserResult = await pool
      .request()
      .input("ID", sql.Int, id)
      .query(
        "SELECT ID, RoleID, CreatedBy FROM dbo.UserTaskMateApp WHERE ID = @ID"
      );

    if (targetUserResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const targetUser = targetUserResult.recordset[0];

    // Check permissions
    if (userRole === "superadmin") {
      // superadmin can delete anyone
    } else if (userRole === "admin") {
      if (!(targetUser.RoleID === 3 && targetUser.CreatedBy === userId)) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }
    } else {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    // Delete the user
    const result = await pool
      .request()
      .input("ID", sql.Int, id)
      .query("DELETE FROM dbo.UserTaskMateApp WHERE ID = @ID");

    if (result.rowsAffected[0] > 0) {
      return res.json({ success: true });
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Failed to delete user" });
    }
  } catch (err) {
    console.error("deleteEmployees error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// Superadmin  can see admin / employee tasks
exports.getEmployeeTasks = async (req, res) => {
  try {
    const { empId } = req.params;
    const userRole = req.user.role.toLowerCase();
    const userId = req.user.id;

    const pool = await poolPromise;

    let query = `
      SELECT 
        T.TaskId as id,
        T.Title as title,
        T.TaskDetails as description,
        T.Mode as mode,
        T.Status as status,
        T.StartDate as startTime,
        T.EndDate as endTime,
        T.CreatedAt as createdAt,
        T.ProjectID as projectId,
        T.SubProjectID as subProjectId,
        T.UserTaskMateAppID as userId,
        U.Name as userName,
        P.ProjectName as project,
        SP.SubProjectName as subProject
      FROM dbo.DailyTaskMateApp T
      INNER JOIN dbo.UserTaskMateApp U ON T.UserTaskMateAppID = U.ID
      LEFT JOIN dbo.ProjectTaskMateApp P ON T.ProjectID = P.ProjectId
      LEFT JOIN dbo.SubProjectTaskMateApp SP ON T.SubProjectID = SP.SubProjectId
      WHERE T.UserTaskMateAppID = @EmpId
    `;

    // Restrict admin → only tasks of their own employees (RoleID = 3)
    if (userRole === "admin") {
      query += " AND U.ReportingID = @UserId AND U.RoleID = 3";
    }
    query += " ORDER BY T.CreatedAt DESC";

    const result = await pool
      .request()
      .input("EmpId", sql.Int, empId)
      .input("UserId", sql.Int, userId)
      .query(query);

    res.json({ success: true, tasks: result.recordset });
  } catch (err) {
    console.error("getEmployeeTasks error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

exports.getAllEmployeeTasks = async (req, res) => {
  try {
    const userRole = req.user.role.toLowerCase();
    const userId = req.user.id;

    const pool = await poolPromise;

    let query = `
      SELECT 
        T.TaskId as id,
        T.Title as title,
        T.TaskDetails as description,
        T.Mode as mode,
        T.Status as status,
        T.StartDate as startTime,
        T.EndDate as endTime,
        T.CreatedAt as createdAt,
        T.ProjectID as projectId,
        T.SubProjectID as subProjectId,
        T.UserTaskMateAppID as userId,
        U.Name as userName,
        U.RoleID as roleId,
        U.ReportingID as reportingId,
        P.ProjectName as project,
        SP.SubProjectName as subProject
      FROM dbo.DailyTaskMateApp T
      INNER JOIN dbo.UserTaskMateApp U ON T.UserTaskMateAppID = U.ID
      LEFT JOIN dbo.ProjectTaskMateApp P ON T.ProjectID = P.ProjectId
      LEFT JOIN dbo.SubProjectTaskMateApp SP ON T.SubProjectID = SP.SubProjectId
      WHERE 1=1
    `;

    // Restrict admin → only employees under him (RoleID = 3 for employees)
    if (userRole === "admin") {
      query += " AND U.ReportingID = @UserId AND U.RoleID = 3";
    }
    // Superadmin sees all tasks (no additional filter)
    query += " ORDER BY T.CreatedAt DESC";

    const result = await pool
      .request()
      .input("UserId", sql.Int, userId)
      .query(query);

    res.json({ success: true, tasks: result.recordset });
  } catch (err) {
    console.error("getAllEmployeeTasks error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

exports.getAllAdminTasks = async (req, res) => {
  try {
    const pool = await poolPromise;
    // Superadmin → fetch tasks of Admins (RoleID = 2)
    const query = `
      SELECT 
        T.TaskId,
        T.Title,
        T.TaskDetails,
        T.Status,
        T.CreatedAt,
        U.Name AS AdminName
      FROM dbo.DailyTaskMateApp T
      INNER JOIN dbo.UserTaskMateApp U 
        ON T.UserTaskMateAppID = U.ID
      WHERE U.RoleID = 2
    `;

    const result = await pool.request().query(query);

    res.json({ success: true, tasks: result.recordset });
  } catch (err) {
    console.error("getAllAdminTasks error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// add project
exports.addProject = async (req, res) => {
  try {
    const { projectName } = req.body;
    const userId = req.user.id;
    if (!projectName) {
      return res
        .status(400)
        .json({ success: false, error: "Project name is required" });
    }
    const pool = await poolPromise;
    await pool
      .request()
      .input("ProjectName", sql.NVarChar(256), projectName)
      .input("CreatedBy", sql.Int, userId).query(`
        INSERT INTO dbo.ProjectTaskMateApp (ProjectName, CreatedBy)
        VALUES (@ProjectName, @CreatedBy)
      `);

    res.json({ success: true, message: "Project added successfully" });
  } catch (error) {
    console.error("addProject error:", error);
    res.status(500).json({ success: false, error: "Failed to add project" });
  }
};
exports.listProjects = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        p.ProjectId,
        p.ProjectName,
        p.EntryTimeStamp AS createdAt,
        u.ID AS userId,
        u.Name AS creatorName
      FROM dbo.ProjectTaskMateApp p
      INNER JOIN dbo.UserTaskMateApp u ON p.CreatedBy = u.ID
      WHERE p.IsActive = 1
      ORDER BY p.EntryTimeStamp DESC
    `);

    res.json({
      success: true,
      projects: result.recordset,
    });
  } catch (error) {
    console.error("getProjects error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch projects" });
  }
};
// add sub project
exports.addSubProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId, subProjectName } = req.body;

    if (!projectId || !subProjectName) {
      return res.status(400).json({
        success: false,
        error: "Project ID and Sub Project name are required",
      });
    }
    const pool = await poolPromise;
    // Validate project exists
    const projectCheck = await pool
      .request()
      .input("ProjectId", sql.Int, projectId)
      .query(
        `SELECT ProjectId FROM dbo.ProjectTaskMateApp WHERE ProjectId = @ProjectId AND IsActive = 1`
      );

    if (projectCheck.recordset.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid Project selected" });
    }
    // Insert sub project
    await pool
      .request()
      .input("ProjectId", sql.Int, projectId)
      .input("SubProjectName", sql.NVarChar(256), subProjectName)
      .input("CreatedBy", sql.Int, userId).query(`
        INSERT INTO dbo.SubProjectTaskMateApp (ProjectId, SubProjectName, CreatedBy)
        VALUES (@ProjectId, @SubProjectName, @CreatedBy)
      `);
    res.json({ success: true, message: "Sub Project added successfully" });
  } catch (error) {
    console.error("addsubProject error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to add sub project" });
  }
};
exports.listSubProjects = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        sp.SubProjectId,
        sp.SubProjectName,
        sp.ProjectId,
        p.ProjectName,
        sp.EntryTimeStamp AS createdAt,
        u.ID AS userId,
        u.Name AS creatorName
      FROM dbo.SubProjectTaskMateApp sp
      INNER JOIN dbo.ProjectTaskMateApp p ON sp.ProjectId = p.ProjectId
      INNER JOIN dbo.UserTaskMateApp u ON sp.CreatedBy = u.ID
      WHERE sp.IsActive = 1
      ORDER BY sp.EntryTimeStamp DESC
    `);

    res.json({
      success: true,
      subProjects: result.recordset,
    });
  } catch (error) {
    console.error("listSubProjects error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch sub projects" });
  }
};
exports.listSubProjectsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const pool = await poolPromise;

    const result = await pool.request().input("ProjectId", sql.Int, projectId)
      .query(`
        SELECT 
          sp.SubProjectId,
          sp.SubProjectName,
          sp.ProjectId,
          sp.EntryTimeStamp AS createdAt,
          u.ID AS userId,
          u.Name AS creatorName
        FROM dbo.SubProjectTaskMateApp sp
        INNER JOIN dbo.UserTaskMateApp u ON sp.CreatedBy = u.ID
        WHERE sp.ProjectId = @ProjectId AND sp.IsActive = 1
        ORDER BY sp.EntryTimeStamp DESC
      `);

    res.json({ success: true, subProjects: result.recordset });
  } catch (error) {
    console.error("listSubProjectsByProject error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch sub projects" });
  }
};
//reset password
exports.checkEmailExists = async (req, res) => {
  try {
    const { email } = req.body;
    const userRole = req.user.role.toLowerCase();
    const userId = req.user.id;

    const pool = await poolPromise;

    let query = `
      SELECT U.ID, U.Email, U.RoleID, U.ReportingID, R.RoleName
      FROM dbo.UserTaskMateApp U
      INNER JOIN dbo.RoleTaskMateApp R ON U.RoleID = R.RoleId
      WHERE U.Email = @Email
    `;

    const result = await pool
      .request()
      .input("email", sql.NVarChar, email)
      .query(query);

    if (result.recordset.length === 0) {
      return res.json({ success: true, exists: false });
    }

    const user = result.recordset[0];

    // Authorization checks
    if (userRole === "admin") {
      // Admin can only reset passwords for employees under them
      if (user.RoleID !== 3 || user.ReportingID !== userId) {
        return res.json({
          success: false,
          exists: false,
          error: "You can only reset passwords for employees under you",
        });
      }
    }
    // Superadmin can reset passwords for anyone (admins and employees)

    res.json({
      success: true,
      exists: true,
      user: {
        id: user.ID,
        email: user.Email,
        role: user.RoleName,
        roleId: user.RoleID,
      },
    });
  } catch (err) {
    console.error("checkEmailExists error:", err);
    res
      .status(500)
      .json({ success: false, exists: false, error: "Server error" });
  }
};
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const userRole = req.user.role.toLowerCase();
    const userId = req.user.id;

    if (!email || !newPassword) {
      return res.json({
        success: false,
        error: "Email and new password are required",
      });
    }

    const pool = await poolPromise;

    // First, verify the user exists and check permissions
    let checkQuery = `
      SELECT U.ID, U.RoleID, U.ReportingID
      FROM dbo.UserTaskMateApp U
      WHERE U.Email = @Email
    `;

    const checkResult = await pool
      .request()
      .input("email", sql.NVarChar, email)
      .query(checkQuery);

    if (checkResult.recordset.length === 0) {
      return res.json({ success: false, error: "User not found" });
    }

    const targetUser = checkResult.recordset[0];

    // Authorization checks
    if (userRole === "admin") {
      // Admin can only reset passwords for employees under them
      if (targetUser.RoleID !== 3 || targetUser.ReportingID !== userId) {
        return res.json({
          success: false,
          error: "You are not authorized to reset this user's password",
        });
      }
    }
    // Superadmin can reset anyone's password

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password
    const updateQuery = `
      UPDATE dbo.UserTaskMateApp 
      SET PasswordHash = @newPassword, 
          UpdatedAt = GETDATE(),
          UpdatedBy = @UpdatedBy
      WHERE Email = @Email
    `;

    await pool
      .request()
      .input("newPassword", sql.NVarChar(255), hashedPassword)
      .input("UpdatedBy", sql.Int, userId)
      .input("Email", sql.NVarChar, email)
      .query(updateQuery);

    // console.log(
    //   `✅ Password reset for ${email} by ${userRole} (ID: ${userId})`
    // );

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("resetPassword error:", err);
    res.status(500).json({ success: false, error: "Failed to reset password" });
  }
};
