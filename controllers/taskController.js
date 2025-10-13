const { poolPromise, sql } = require("../db");

// ------------------ GET TASKS (Alias for getTasksByHierarchy) ------------------//
exports.getTasks = async (req, res) => {
  // Simply call the hierarchical function
  await exports.getTasksByHierarchy(req, res);
};

// ------------------ GET TASKS BY HIERARCHY ------------------//
exports.getTasksByHierarchy = async (req, res) => {
  try {
    const user = req.user;
    const userRole = user.role.toLowerCase();
    const pool = await poolPromise;
    // 🔍 Check ALL tables in the database
    const allTables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    // console.log("📋 ALL TABLES in database:");
    // allTables.recordset.forEach((table) => {
    //   console.log(`  ${table.TABLE_NAME}`);
    // });
    let query = `
      SELECT 
        t.TaskId as id,
        t.Title as title,
        t.TaskDetails as description,
        t.Mode as mode,
        t.Status as status,
        t.StartDate as startTime,
        t.EndDate as endTime,
        t.CreatedAt as createdAt,
        t.UpdatedAt as updatedAt,
        t.UserTaskMateAppID as userId,
        t.ProjectID as projectId,
        t.SubProjectID as subProjectId,
        u.Name as userName,
        u.Email as userEmail,
        creator.Name as createdByName,
        p.ProjectName as project,
        sp.SubProjectName as subProject
      FROM DailyTaskMateApp t
      LEFT JOIN UserTaskMateApp u ON t.UserTaskMateAppID = u.ID
      LEFT JOIN UserTaskMateApp creator ON t.CreatedBy = creator.ID
      LEFT JOIN ProjectTaskMateApp p ON t.ProjectID = p.ProjectId  
      LEFT JOIN SubProjectTaskMateApp sp ON t.SubProjectID = sp.SubProjectId
      WHERE 1=1
    `;

    let request = pool.request();

    // ✅ Apply role-based hierarchical filtering
    if (userRole === "superadmin") {
      // Superadmin sees all tasks
      query += ` AND 1=1`;
    } else if (userRole === "admin") {
      // Admin sees: their own tasks + tasks of employees they created
      query += ` AND (t.UserTaskMateAppID = @userId OR t.CreatedBy = @userId OR u.ReportingID = @userId)`;
      request.input("userId", sql.Int, user.id);
    } else if (userRole === "employee") {
      // Employee sees only their own tasks
      query += ` AND t.UserTaskMateAppID = @userId`;
      request.input("userId", sql.Int, user.id);
    }

    query += ` ORDER BY t.CreatedAt DESC`;

    const result = await request.query(query);

    // console.log(
    //   `✅ Retrieved ${result.recordset.length} tasks for ${userRole}: ${user.id}`
    // );

    res.json({
      success: true,
      tasks: result.recordset,
      count: result.recordset.length,
    });
  } catch (err) {
    console.error("getTasksByHierarchy error:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error: " + err.message });
  }
};

// ------------------ GET TASK BY ID ------------------//
exports.getTaskById = async (req, res) => {
  try {
    const taskId = req.params.id;
    const currentUser = req.user;
    const pool = await poolPromise;

    // Get the task
    const taskResult = await pool.request().input("taskId", sql.Int, taskId)
      .query(`
        SELECT t.*, u.Name as UserName
        FROM DailyTaskMateApp t
        LEFT JOIN UserTaskMateApp u ON t.UserTaskMateAppID = u.ID
        WHERE t.TaskId = @taskId
      `);

    if (taskResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const task = taskResult.recordset[0];

    // ✅ Check hierarchical access
    const hasAccess = await checkTaskAccess(currentUser, task, pool);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (err) {
    console.error("getTaskById error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ------------------ CREATE TASK ------------------//
exports.createTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      ProjectID,
      SubProjectID,
      title,
      taskDetails,
      mode,
      status,
      startDate,
      endDate,
      CreatedBy,
    } = req.body;

    // console.log("🔍 Received task data:", req.body);
    // console.log("🔍 CreatedBy value:", CreatedBy); // Add this log
    // console.log("🔍 User ID from token:", userId);

    const pool = await poolPromise;
    await pool
      .request()
      .input("UserTaskMateAppID", sql.Int, userId)
      .input("ProjectID", sql.Int, ProjectID) // Use the destructured variable
      .input("SubProjectID", sql.Int, SubProjectID)
      .input("Title", sql.NVarChar(500), title)
      .input("Mode", sql.VarChar(50), mode)
      .input("TaskDetails", sql.NVarChar(sql.MAX), taskDetails)
      .input("Status", sql.VarChar(50), status)
      .input("StartDate", sql.DateTime, new Date(startDate))
      .input("EndDate", sql.DateTime, new Date(endDate))
      .input("CreatedBy", sql.Int, CreatedBy).query(`
        INSERT INTO dbo.DailyTaskMateApp
          (UserTaskMateAppID, ProjectID, SubProjectID, Title, Mode, TaskDetails, Status, StartDate, EndDate, CreatedBy)
        VALUES
          (@UserTaskMateAppID, @ProjectID, @SubProjectID, @Title, @Mode, @TaskDetails, @Status, @StartDate, @EndDate, @CreatedBy)
      `);
    res.json({ success: true, message: "Task added successfully" });
  } catch (error) {
    console.error("addTask error:", error);
    res.status(500).json({ success: false, error: "Failed to add task" });
  }
};

// ------------------ UPDATE TASK ------------------//
exports.updateTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id);
    const {
      ProjectID,
      SubProjectID,
      title,
      taskDetails,
      mode,
      status,
      startDate,
      endDate,
    } = req.body;

    const pool = await poolPromise;

    await pool
      .request()
      .input("TaskID", sql.Int, taskId)
      .input("ProjectID", sql.Int, ProjectID)
      .input("SubProjectID", sql.Int, SubProjectID)
      .input("Title", sql.NVarChar(500), title)
      .input("TaskDetails", sql.NVarChar(sql.MAX), taskDetails)
      .input("Mode", sql.VarChar(50), mode)
      .input("Status", sql.VarChar(50), status)
      .input("StartDate", sql.DateTime, new Date(startDate))
      .input("EndDate", sql.DateTime, new Date(endDate))
      .input("UpdatedBy", sql.Int, userId)
      .query(
        `UPDATE dbo.DailyTaskMateApp
         SET ProjectID = @ProjectID,
             SubProjectID = @SubProjectID,
             Title = @Title,
             TaskDetails = @TaskDetails,
             Mode = @Mode,
             Status = @Status,
             StartDate = @StartDate,
             EndDate = @EndDate,
             UpdatedAt = GETDATE(),
             UpdatedBy = @UpdatedBy
         WHERE TaskID = @TaskID`
      );

    res.json({ success: true, message: "Task updated successfully" });
  } catch (error) {
    console.error("updateTask error:", error);
    res.status(500).json({ success: false, error: "Failed to update task" });
  }
};

// ------------------ DELETE TASK ------------------//
exports.deleteTask = async (req, res) => {
  const taskId = req.params.id;

  if (isNaN(taskId)) {
    return res.status(400).json({ success: false, error: "Invalid task ID" });
  }

  try {
    const currentUser = req.user;
    const pool = await poolPromise;

    // First, check if task exists and get task details
    const taskResult = await pool
      .request()
      .input("taskId", sql.Int, taskId)
      .query("SELECT * FROM dbo.DailyTaskMateApp WHERE TaskId = @taskId");

    if (taskResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const task = taskResult.recordset[0];

    // ✅ Check access rights based on user role
    if (currentUser.role.toLowerCase() === "employee") {
      // Employee can only delete their own tasks
      if (task.UserTaskMateAppID !== currentUser.id) {
        return res.status(403).json({
          success: false,
          error: "You can only delete your own tasks",
        });
      }
    } else if (currentUser.role.toLowerCase() === "admin") {
      // Admin can delete their own tasks + tasks of employees under them
      if (task.UserTaskMateAppID !== currentUser.id) {
        // Check if the task belongs to an employee under this admin
        const employeeCheck = await pool
          .request()
          .input("employeeId", sql.Int, task.UserTaskMateAppID)
          .input("adminId", sql.Int, currentUser.id).query(`
            SELECT ID FROM UserTaskMateApp 
            WHERE ID = @employeeId AND ReportingID = @adminId AND RoleID = 3
          `);

        if (employeeCheck.recordset.length === 0) {
          return res.status(403).json({
            success: false,
            error: "You can only delete tasks of employees under you",
          });
        }
      }
    }

    // Delete the task
    const deleteResult = await pool
      .request()
      .input("taskId", sql.Int, taskId)
      .query("DELETE FROM dbo.DailyTaskMateApp WHERE TaskId = @taskId");

    if (deleteResult.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (err) {
    console.error("deleteTask error:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error: " + err.message });
  }
};

// ✅ HELPER: Check task access rights hierarchically
async function checkTaskAccess(currentUser, task, pool) {
  const currentRole = currentUser.role.toLowerCase();

  if (currentRole === "superadmin") {
    return true; // Superadmin can access all tasks
  } else if (currentRole === "admin") {
    // Admin can access: their tasks + tasks of their employees
    if (task.UserId === currentUser.id) return true; // Own task
    if (task.CreatedBy === currentUser.id) return true; // Task created by admin

    // Check if task user was created by this admin
    const userResult = await pool
      .request()
      .input("userId", sql.Int, task.UserId)
      .query("SELECT CreatedBy FROM UserTaskMateApp WHERE ID = @userId");

    if (userResult.recordset.length > 0) {
      const taskUser = userResult.recordset[0];
      return taskUser.CreatedBy === currentUser.id;
    }

    return false;
  } else if (currentRole === "employee") {
    // Employee can only access their own tasks
    return task.UserId === currentUser.id;
  }

  return false;
}
