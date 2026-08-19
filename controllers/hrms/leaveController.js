const { poolPromise, sql } = require("../../db");

// get all leave type
exports.getAllLeaveType = async (req, res) => {
  try {
    const pool = await poolPromise;

    const userId = req.user.id;
    // Get the task
    const result = await pool.request().input("UserId", sql.Int, userId).query(`
      SELECT 
        L.Id,
        L.LeaveName,
        L.LeaveCount - ISNULL(SUM(A.TotalDays), 0) AS LeaveCount
      FROM LeaveTypeTaskMateApp L
      LEFT JOIN ApplyLeaveTaskMateApp A 
        ON L.Id = A.LeaveTypeTaskMateAppId 
        AND A.UserTaskMateAppId = @UserId
        AND A.Status IN ('Approved', 'Pending')
      WHERE L.IsActive = 1
      GROUP BY L.Id, L.LeaveName, L.LeaveCount
      ORDER BY L.LeaveName
    `);

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("getAllLeaveType error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// post-apply my leave
exports.applyLeave = async (req, res) => {
  try {
    const userId = req.user.id;
    const { leaveTypeId, fromDate, toDate, days, sessionDay, reason } =
      req.body;

    // console.log("AUTH USER:", req.user);
    // console.log("HEADERS:", req.headers.authorization);
    // console.log("BODY:", req.body);

    if (!leaveTypeId || !fromDate || !toDate || !days) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }
    const pool = await poolPromise;
    await pool
      .request()
      .input("UserTaskMateAppId", sql.Int, userId)
      .input("LeaveTypeTaskMateAppId", sql.Int, leaveTypeId)
      .input("FromDate", sql.Date, fromDate)
      .input("ToDate", sql.Date, toDate)
      .input("TotalDays", sql.Decimal(5, 2), days)
      .input("SessionDay", sql.Int, sessionDay)
      .input("Reason", sql.VarChar(150), reason)
      .input("Status", sql.VarChar(20), "PENDING").query(`
        INSERT INTO ApplyLeaveTaskMateApp
        (
          UserTaskMateAppId,
          LeaveTypeTaskMateAppId,
          FromDate,
          ToDate,
          TotalDays,
          SessionDay,
          Reason,
          Status)
        VALUES
        (   @UserTaskMateAppId,
          @LeaveTypeTaskMateAppId,
          @FromDate,
          @ToDate,
          @TotalDays,
          @SessionDay,
          @Reason,
          @Status)
      `);
    res.json({ success: true, message: "Leave applied successfully" });
  } catch (err) {
    console.error("Apply Leave Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// get my leave
exports.getMyLeaves = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const result = await pool.request().input("UserId", sql.Int, userId).query(`
        SELECT 
          A.Id,
          A.UserTaskMateAppId,
          A.LeaveTypeTaskMateAppId,
          L.LeaveName,
          A.FromDate,
          A.ToDate,
          A.TotalDays,
          A.SessionDay,
          A.Reason,
          A.Status,
          A.EntryTimeStamp
        FROM ApplyLeaveTaskMateApp A
        JOIN LeaveTypeTaskMateApp L
          ON A.LeaveTypeTaskMateAppId = L.Id
        WHERE A.UserTaskMateAppId = @UserId
        ORDER BY A.Id DESC
      `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("Get My Leaves Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// get all other leave request
exports.getOtherLeaveRequest = async (req, res) => {
  try {
    const { role, id } = req.user;
    const allowedRoles = ["hr", "manager", "ceo", "manager"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }
    const pool = await poolPromise;

    let roleFilter = "";
    if (role === "ceo") {
      roleFilter = "AND R.RoleName IN ('HR', 'Accountant', 'Manager')";
    } else if (role === "manager") {
      roleFilter = "AND R.RoleName IN ('Admin', 'Employee')";
    }

    const result = await pool.request().query(`
      SELECT 
        A.Id,
        A.UserTaskMateAppId,
        U.Name AS EmployeeName,
        R.RoleName AS EmployeeRole,
        L.LeaveName,
        A.FromDate,
        A.ToDate,
        A.TotalDays,
        A.SessionDay,
        A.Reason,
        A.Status,
        A.EntryTimeStamp
      FROM ApplyLeaveTaskMateApp A
      JOIN LeaveTypeTaskMateApp L
        ON A.LeaveTypeTaskMateAppId = L.Id
      JOIN UserTaskMateApp U
        ON A.UserTaskMateAppId = U.ID
      JOIN RoleTaskMateApp R
        ON U.RoleID = R.RoleId
      WHERE A.UserTaskMateAppId <> ${id}
      AND A.Status = 'PENDING'
      ${roleFilter}
      ORDER BY A.Id DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("Get Other Leaves Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// update leave by hr / super admin / ceo / manager
exports.updateLeaves = async (req, res) => {
  try {
    const { role, id } = req.user;
    const { leaveId, status, hrReason } = req.body;
    const allowedRoles = ["hr", "manager", "ceo", "manager"];

    // role check
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (!leaveId || !status) {
      return res.status(400).json({
        success: false,
        message: "leaveId and status required",
      });
    }

    const pool = await poolPromise;

    // Validate if the user is authorized to approve this specific leave
    if (role !== "manager") {
      const leaveRecord = await pool.request().query(`
        SELECT R.RoleName 
        FROM ApplyLeaveTaskMateApp A
        JOIN UserTaskMateApp U ON A.UserTaskMateAppId = U.ID
        JOIN RoleTaskMateApp R ON U.RoleID = R.RoleId
        WHERE A.Id = ${leaveId}
      `);

      if (leaveRecord.recordset.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Leave not found" });
      }

      const targetRole = leaveRecord.recordset[0].RoleName.toLowerCase();
      let authorized = false;

      if (
        role === "ceo" &&
        ["hr", "accountant", "manager"].includes(targetRole)
      )
        authorized = true;
      if (role === "hr" && ["officesupport"].includes(targetRole))
        authorized = true;
      if (role === "manager" && ["admin", "employee"].includes(targetRole))
        authorized = true;

      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to approve leave for this role",
        });
      }
    }

    const request = pool
      .request()
      .input("LeaveId", sql.Int, leaveId)
      .input("Status", sql.VarChar(20), status)
      .input("ApprovedBy", sql.Int, id);

    let query = "";

    if (status === "APPROVED") {
      query = `
        UPDATE ApplyLeaveTaskMateApp
        SET
          Status = @Status,
          ApprovedBy = @ApprovedBy,
          ApprovedOn = GETDATE(),
          RejectReason = NULL
        WHERE Id = @LeaveId
      `;
    } else if (status === "REJECTED") {
      request.input("RejectReason", sql.VarChar(200), hrReason || null);
      query = `
        UPDATE ApplyLeaveTaskMateApp
        SET
          Status = @Status,
          ApprovedBy = @ApprovedBy,
          ApprovedOn = GETDATE(),
          RejectReason = @RejectReason
        WHERE Id = @LeaveId
      `;
    }

    await request.query(query);

    res.json({
      success: true,
      message: `Leave ${status} successfully`,
    });
  } catch (err) {
    console.error("Update Leave Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.getPendingLeavesForHr = async (req, res) => {
  try {
    const { role } = req.user;
    const allowedRoles = ["hr", "manager", "ceo", "manager"];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ success: false });
    }

    let roleFilter = "";
    if (role === "ceo") {
      roleFilter = "AND R.RoleName IN ('HR', 'Accountant', 'Manager')";
    } else if (role === "manager") {
      roleFilter = "AND R.RoleName IN ('Admin', 'Employee')";
    }

    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        A.Id,
        U.Name AS EmployeeName,
        R.RoleName AS EmployeeRole,
        L.LeaveName,
        A.FromDate,
        A.ToDate,
        A.TotalDays,
        A.Reason,
        A.Status
      FROM ApplyLeaveTaskMateApp A
      JOIN UserTaskMateApp U ON A.UserTaskMateAppId = U.ID
      JOIN LeaveTypeTaskMateApp L ON A.LeaveTypeTaskMateAppId = L.Id
      JOIN RoleTaskMateApp R ON U.RoleID = R.RoleId
      WHERE A.Status = 'PENDING'
      ${roleFilter}
      ORDER BY A.Id DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// get all leaves report (Pending, Approved, Rejected) for HR/Admin
exports.getAllLeaveReport = async (req, res) => {
  try {
    const { role } = req.user;
    const allowedRoles = ["hr", "manager", "ceo", "manager"];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    // Optional: Filter by role if needed, or let HR see everyone. 
    // Usually HR sees all, manager sees their own dept (we can use same roleFilter).
    let roleFilter = "";
    if (role === "ceo") {
      roleFilter = "AND R.RoleName IN ('HR', 'Accountant', 'Manager')";
    } else if (role === "manager") {
      roleFilter = "AND R.RoleName IN ('Admin', 'Employee')";
    }

    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        A.Id,
        U.Name AS EmployeeName,
        R.RoleName AS EmployeeRole,
        L.LeaveName,
        A.FromDate,
        A.ToDate,
        A.TotalDays,
        A.SessionDay,
        A.Reason,
        A.Status,
        A.EntryTimeStamp
      FROM ApplyLeaveTaskMateApp A
      JOIN UserTaskMateApp U ON A.UserTaskMateAppId = U.ID
      JOIN LeaveTypeTaskMateApp L ON A.LeaveTypeTaskMateAppId = L.Id
      JOIN RoleTaskMateApp R ON U.RoleID = R.RoleId
      WHERE 1=1
      ${roleFilter}
      ORDER BY A.Id DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get All Leave Report Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Cancel Pending Leave (Employee Side)
exports.cancelLeave = async (req, res) => {
  try {
    const userId = req.user.id;
    const leaveId = req.params.id;

    if (!leaveId) {
      return res.status(400).json({ success: false, message: "leaveId is required" });
    }

    const pool = await poolPromise;
    // Check if leave exists, belongs to user, and is PENDING
    const checkResult = await pool.request()
      .input("LeaveId", sql.Int, leaveId)
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT Status FROM ApplyLeaveTaskMateApp 
        WHERE Id = @LeaveId AND UserTaskMateAppId = @UserId
      `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: "Leave not found or unauthorized" });
    }

    const currentStatus = checkResult.recordset[0].Status;
    if (currentStatus.toUpperCase() !== "PENDING") {
      return res.status(400).json({ success: false, message: "Only PENDING leaves can be cancelled" });
    }

    // Delete the leave record (or you can mark it as CANCELLED, but deleting is cleaner for pending)
    await pool.request()
      .input("LeaveId", sql.Int, leaveId)
      .query(`DELETE FROM ApplyLeaveTaskMateApp WHERE Id = @LeaveId`);

    res.json({ success: true, message: "Leave cancelled successfully" });
  } catch (err) {
    console.error("Cancel Leave Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get today's leaves for Manager/HR
exports.getTodayLeaves = async (req, res) => {
  try {
    const { role } = req.user;
    const allowedRoles = ["hr", "manager", "ceo", "manager"];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    let roleFilter = "";
    if (role === "ceo") {
      roleFilter = "AND R.RoleName IN ('HR', 'Accountant', 'Manager')";
    } else if (role === "manager") {
      roleFilter = "AND R.RoleName IN ('Admin', 'Employee')";
    }

    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        A.Id,
        U.Name AS EmployeeName,
        U.ProfileImage,
        R.RoleName AS EmployeeRole,
        L.LeaveName,
        A.FromDate,
        A.ToDate,
        A.TotalDays
      FROM ApplyLeaveTaskMateApp A
      JOIN UserTaskMateApp U ON A.UserTaskMateAppId = U.ID
      JOIN LeaveTypeTaskMateApp L ON A.LeaveTypeTaskMateAppId = L.Id
      JOIN RoleTaskMateApp R ON U.RoleID = R.RoleId
      WHERE A.Status = 'APPROVED'
      AND CAST(GETDATE() AS DATE) BETWEEN CAST(A.FromDate AS DATE) AND CAST(A.ToDate AS DATE)
      ${roleFilter}
      ORDER BY A.FromDate ASC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get Today Leaves Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ======================== PHASE 2 & 3 APIs ========================

