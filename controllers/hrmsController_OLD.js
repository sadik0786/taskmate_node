const { poolPromise, sql } = require("../db");
// get all employee
exports.getAllEmployee = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        ID,
        ProfileImage,
        Name,
        Email,
        Mobile,
        RoleID,
        ReportingID,
        CreatedAt,
        CreatedBy,
        UpdatedAt,
        UpdatedBy
      FROM UserTaskMateApp
      ORDER BY Name;
    `);

    res.status(200).json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (err) {
    console.error("Get All Employees Error:", err);
    res.status(500).json({
      success: false,
      error: "Server error while fetching employees",
    });
  }
};
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
    const allowedRoles = ["hr", "superadmin", "ceo", "manager"];
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
    const allowedRoles = ["hr", "superadmin", "ceo", "manager"];

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
    if (role !== "superadmin") {
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
    const allowedRoles = ["hr", "superadmin", "ceo", "manager"];

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
    const allowedRoles = ["hr", "superadmin", "ceo", "manager"];

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
    const allowedRoles = ["hr", "superadmin", "ceo", "manager"];

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

// Get Holidays
exports.getHolidays = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Id, Title, HolidayDate, DayOfWeek
      FROM HolidayTaskMateApp
      WHERE IsActive = 1
      ORDER BY HolidayDate ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get Holidays Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Punch In
exports.punchIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    // Check if last punch was already IN
    const lastLogResult = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT TOP 1 PunchType FROM AttendanceLogsTaskMateApp 
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
        ORDER BY PunchTime DESC
      `);

    if (lastLogResult.recordset.length > 0 && lastLogResult.recordset[0].PunchType === 'IN') {
      return res.status(400).json({ success: false, message: "Already punched in. Please punch out first." });
    }

    // Insert IN log
    await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        INSERT INTO AttendanceLogsTaskMateApp (UserTaskMateAppId, AttendanceDate, PunchType, PunchTime)
        VALUES (@UserId, CAST(GETDATE() AS DATE), 'IN', GETDATE())
      `);

    // Check if AttendanceTaskMateApp exists for today
    const attendanceResult = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT Id FROM AttendanceTaskMateApp 
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
      `);

    if (attendanceResult.recordset.length === 0) {
      // First punch of the day: create row and mark LATE if after 9:30 AM
      await pool.request()
        .input("UserId", sql.Int, userId)
        .query(`
          INSERT INTO AttendanceTaskMateApp (UserTaskMateAppId, AttendanceDate, CheckInTime, Status)
          VALUES (@UserId, CAST(GETDATE() AS DATE), GETDATE(), 
            CASE WHEN CAST(GETDATE() AS TIME) > '09:30:00' THEN 'LATE' ELSE 'PRESENT' END
          )
        `);
    }

    res.json({ success: true, message: "Punched in successfully" });
  } catch (err) {
    console.error("Punch In Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Punch Out
exports.punchOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    // Check if last punch was IN
    const lastLogResult = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT TOP 1 PunchType, PunchTime FROM AttendanceLogsTaskMateApp 
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
        ORDER BY PunchTime DESC
      `);

    if (lastLogResult.recordset.length === 0 || lastLogResult.recordset[0].PunchType === 'OUT' || lastLogResult.recordset[0].PunchType === 'BREAK_START') {
      return res.status(400).json({ success: false, message: "No active punch in found for today, already punched out, or on break" });
    }

    const lastInTime = lastLogResult.recordset[0].PunchTime;

    // Insert OUT log
    await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        INSERT INTO AttendanceLogsTaskMateApp (UserTaskMateAppId, AttendanceDate, PunchType, PunchTime)
        VALUES (@UserId, CAST(GETDATE() AS DATE), 'OUT', GETDATE())
      `);

    // Update CheckOutTime and calculate worked minutes
    const result = await pool.request()
      .input("UserId", sql.Int, userId)
      .input("LastInTime", sql.DateTime, lastInTime)
      .query(`
        UPDATE AttendanceTaskMateApp
        SET CheckOutTime = GETDATE(),
            TotalWorkedMinutes = ISNULL(TotalWorkedMinutes, 0) + DATEDIFF(minute, @LastInTime, GETDATE())
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(400).json({ success: false, message: "Failed to update attendance record" });
    }

    res.json({ success: true, message: "Punched out successfully" });
  } catch (err) {
    console.error("Punch Out Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Take Break
exports.takeBreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const lastLogResult = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT TOP 1 PunchType, PunchTime FROM AttendanceLogsTaskMateApp 
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
        ORDER BY PunchTime DESC
      `);

    if (lastLogResult.recordset.length === 0 || lastLogResult.recordset[0].PunchType === 'OUT' || lastLogResult.recordset[0].PunchType === 'BREAK_START') {
      return res.status(400).json({ success: false, message: "Cannot take break right now" });
    }

    const lastInTime = lastLogResult.recordset[0].PunchTime;

    // Insert BREAK_START log
    await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        INSERT INTO AttendanceLogsTaskMateApp (UserTaskMateAppId, AttendanceDate, PunchType, PunchTime)
        VALUES (@UserId, CAST(GETDATE() AS DATE), 'BREAK_START', GETDATE())
      `);

    // Update TotalWorkedMinutes up to this break
    await pool.request()
      .input("UserId", sql.Int, userId)
      .input("LastInTime", sql.DateTime, lastInTime)
      .query(`
        UPDATE AttendanceTaskMateApp
        SET TotalWorkedMinutes = ISNULL(TotalWorkedMinutes, 0) + DATEDIFF(minute, @LastInTime, GETDATE())
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
      `);

    res.json({ success: true, message: "Break started successfully" });
  } catch (err) {
    console.error("Take Break Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// End Break
exports.endBreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const lastLogResult = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT TOP 1 PunchType, PunchTime FROM AttendanceLogsTaskMateApp 
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
        ORDER BY PunchTime DESC
      `);

    if (lastLogResult.recordset.length === 0 || lastLogResult.recordset[0].PunchType !== 'BREAK_START') {
      return res.status(400).json({ success: false, message: "Not currently on break" });
    }

    const breakStartTime = lastLogResult.recordset[0].PunchTime;

    // Insert BREAK_END log
    await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        INSERT INTO AttendanceLogsTaskMateApp (UserTaskMateAppId, AttendanceDate, PunchType, PunchTime)
        VALUES (@UserId, CAST(GETDATE() AS DATE), 'BREAK_END', GETDATE())
      `);

    // Update TotalBreakMinutes
    await pool.request()
      .input("UserId", sql.Int, userId)
      .input("BreakStartTime", sql.DateTime, breakStartTime)
      .query(`
        UPDATE AttendanceTaskMateApp
        SET TotalBreakMinutes = ISNULL(TotalBreakMinutes, 0) + DATEDIFF(minute, @BreakStartTime, GETDATE())
        WHERE UserTaskMateAppId = @UserId 
        AND AttendanceDate = CAST(GETDATE() AS DATE)
      `);

    res.json({ success: true, message: "Break ended successfully" });
  } catch (err) {
    console.error("End Break Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Today's Attendance
exports.getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const result = await pool.request().input("UserId", sql.Int, userId).query(`
        SELECT Id, CheckInTime, CheckOutTime, Status, TotalWorkedMinutes, TotalBreakMinutes,
          (SELECT TOP 1 PunchType FROM AttendanceLogsTaskMateApp 
           WHERE UserTaskMateAppId = @UserId AND AttendanceDate = CAST(GETDATE() AS DATE) 
           ORDER BY PunchTime DESC) AS CurrentPunchState
        FROM AttendanceTaskMateApp
        WHERE UserTaskMateAppId = @UserId
        AND AttendanceDate = CAST(GETDATE() AS DATE)
      `);

    let data = result.recordset.length > 0 ? result.recordset[0] : null;
    if (data) {
      data.isOnBreak = data.CurrentPunchState === 'BREAK_START';
      // Treat BREAK_END as IN so frontend sees it as punched in
      if (data.CurrentPunchState === 'BREAK_END') {
        data.CurrentPunchState = 'IN';
      }
    }

    res.json({
      success: true,
      data: data
    });
  } catch (err) {
    console.error("Get Today Attendance Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Attendance History (with Date Filter)
exports.getAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;
    const pool = await poolPromise;

    let dateFilter = "";
    if (startDate && endDate) {
      dateFilter = `AND AttendanceDate BETWEEN @StartDate AND @EndDate`;
    } else {
      // default to last 30 days
      dateFilter = `AND AttendanceDate >= DATEADD(day, -30, CAST(GETDATE() AS DATE))`;
    }

    const request = pool.request().input("UserId", sql.Int, userId);

    if (startDate && endDate) {
      request.input("StartDate", sql.Date, startDate);
      request.input("EndDate", sql.Date, endDate);
    }

    const result = await request.query(`
        SELECT 
          AttendanceDate,
          CheckInTime,
          CheckOutTime,
          Status,
          TotalWorkedMinutes
        FROM AttendanceTaskMateApp
      WHERE UserTaskMateAppId = @UserId
      ${dateFilter}
      ORDER BY AttendanceDate DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get Attendance History Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get My Payslips
exports.getMyPayslips = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT Id, Month, Year, BasicSalary, NetPay, PdfUrl
        FROM PayslipTaskMateApp
        WHERE UserTaskMateAppId = @UserId
        ORDER BY Year DESC, Month DESC
      `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get Payslips Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Today's Events (Birthdays and Work Anniversaries)
exports.getTodayEvents = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        U.Name,
        U.ProfileImage,
        ED.DateOfBirth,
        ED.DateOfJoining
      FROM UserTaskMateApp U
      INNER JOIN EmployeeDetailsTaskMateApp ED ON U.ID = ED.UserID
      WHERE 
        (MONTH(ED.DateOfBirth) = MONTH(GETDATE()) AND DAY(ED.DateOfBirth) = DAY(GETDATE()))
        OR 
        (MONTH(ED.DateOfJoining) = MONTH(GETDATE()) AND DAY(ED.DateOfJoining) = DAY(GETDATE()))
    `);

    const events = [];
    const todayMonth = new Date().getMonth();
    const todayDate = new Date().getDate();

    result.recordset.forEach(user => {
      if (user.DateOfBirth) {
        const dob = new Date(user.DateOfBirth);
        if (dob.getMonth() === todayMonth && dob.getDate() === todayDate) {
          events.push({
            type: "Birthday",
            name: user.Name,
            image: user.ProfileImage,
          });
        }
      }
      if (user.DateOfJoining) {
        const doj = new Date(user.DateOfJoining);
        if (doj.getMonth() === todayMonth && doj.getDate() === todayDate) {
          const years = new Date().getFullYear() - doj.getFullYear();
          if (years > 0) {
            events.push({
              type: "Work Anniversary",
              name: user.Name,
              image: user.ProfileImage,
              years: years
            });
          }
        }
      }
    });

    res.json({ success: true, data: events });
  } catch (err) {
    console.error("Get Today Events Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= PHASE 3: ADMIN REPORT & REGULARIZATION =================

// Admin Attendance Report
exports.getAdminAttendanceReport = async (req, res) => {
  try {
    const { date } = req.query; // Format: YYYY-MM-DD
    const pool = await poolPromise;
    
    // If no date provided, default to today
    const filterDate = date ? new Date(date) : new Date();

    const result = await pool.request()
      .input("FilterDate", sql.Date, filterDate)
      .query(`
        SELECT 
          U.ID as UserId,
          U.Name,
          U.Email,
          U.RoleID,
          A.CheckInTime,
          A.CheckOutTime,
          A.Status,
          A.TotalWorkedMinutes
        FROM UserTaskMateApp U
        LEFT JOIN AttendanceTaskMateApp A 
          ON U.ID = A.UserTaskMateAppId 
          AND A.AttendanceDate = CAST(@FilterDate AS DATE)
        WHERE U.ID != 1 -- Assuming 1 is superadmin, optional
        ORDER BY U.Name ASC
      `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Admin Attendance Report Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Apply Regularization (User)
exports.applyRegularization = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetDate, reason, requestedCheckIn, requestedCheckOut } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("UserId", sql.Int, userId)
      .input("TargetDate", sql.Date, new Date(targetDate))
      .input("Reason", sql.NVarChar, reason)
      .input("ReqCheckIn", sql.DateTime, requestedCheckIn ? new Date(requestedCheckIn) : null)
      .input("ReqCheckOut", sql.DateTime, requestedCheckOut ? new Date(requestedCheckOut) : null)
      .query(`
        INSERT INTO AttendanceRegularizationTaskMateApp 
        (UserTaskMateAppId, TargetDate, Reason, RequestedCheckInTime, RequestedCheckOutTime)
        VALUES (@UserId, @TargetDate, @Reason, @ReqCheckIn, @ReqCheckOut)
      `);

    res.json({ success: true, message: "Regularization request submitted successfully" });
  } catch (err) {
    console.error("Apply Regularization Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get My Regularizations (User)
exports.getMyRegularizations = async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`
        SELECT * FROM AttendanceRegularizationTaskMateApp
        WHERE UserTaskMateAppId = @UserId
        ORDER BY EntryTimeStamp DESC
      `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get My Regularizations Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Pending Regularizations (Admin)
exports.getPendingRegularizations = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT R.*, U.Name as EmployeeName
      FROM AttendanceRegularizationTaskMateApp R
      JOIN UserTaskMateApp U ON R.UserTaskMateAppId = U.ID
      WHERE R.Status = 'Pending'
      ORDER BY R.EntryTimeStamp DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get Pending Regularizations Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update Regularization Status (Admin)
exports.updateRegularizationStatus = async (req, res) => {
  try {
    const { reqId, status, hrReason } = req.body;
    const pool = await poolPromise;

    // Get the request details first
    const reqResult = await pool.request()
      .input("ReqId", sql.Int, reqId)
      .query(`SELECT * FROM AttendanceRegularizationTaskMateApp WHERE Id = @ReqId`);

    if (reqResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    const requestData = reqResult.recordset[0];

    // Update status
    await pool.request()
      .input("ReqId", sql.Int, reqId)
      .input("Status", sql.NVarChar, status)
      .input("HrReason", sql.NVarChar, hrReason || "")
      .query(`
        UPDATE AttendanceRegularizationTaskMateApp
        SET Status = @Status, HrReason = @HrReason
        WHERE Id = @ReqId
      `);

    // If approved, update AttendanceTaskMateApp
    if (status === 'Approved') {
      const userId = requestData.UserTaskMateAppId;
      const targetDate = requestData.TargetDate;
      const checkIn = requestData.RequestedCheckInTime;
      const checkOut = requestData.RequestedCheckOutTime;
      
      // Calculate minutes if both are provided
      let minutes = 0;
      if (checkIn && checkOut) {
        minutes = Math.round((new Date(checkOut) - new Date(checkIn)) / 60000);
      }

      const existAtt = await pool.request()
        .input("UserId", sql.Int, userId)
        .input("TargetDate", sql.Date, targetDate)
        .query(`SELECT Id FROM AttendanceTaskMateApp WHERE UserTaskMateAppId = @UserId AND AttendanceDate = @TargetDate`);

      if (existAtt.recordset.length > 0) {
        // Update existing
        await pool.request()
          .input("UserId", sql.Int, userId)
          .input("TargetDate", sql.Date, targetDate)
          .input("CheckIn", sql.DateTime, checkIn)
          .input("CheckOut", sql.DateTime, checkOut)
          .input("Mins", sql.Int, minutes)
          .query(`
            UPDATE AttendanceTaskMateApp
            SET CheckInTime = ISNULL(@CheckIn, CheckInTime),
                CheckOutTime = ISNULL(@CheckOut, CheckOutTime),
                TotalWorkedMinutes = @Mins
            WHERE UserTaskMateAppId = @UserId AND AttendanceDate = @TargetDate
          `);
      } else {
        // Insert new
        await pool.request()
          .input("UserId", sql.Int, userId)
          .input("TargetDate", sql.Date, targetDate)
          .input("CheckIn", sql.DateTime, checkIn)
          .input("CheckOut", sql.DateTime, checkOut)
          .input("Mins", sql.Int, minutes)
          .query(`
            INSERT INTO AttendanceTaskMateApp (UserTaskMateAppId, AttendanceDate, CheckInTime, CheckOutTime, TotalWorkedMinutes, Status)
            VALUES (@UserId, @TargetDate, @CheckIn, @CheckOut, @Mins, 'PRESENT')
          `);
      }
    }

    res.json({ success: true, message: `Regularization ${status}` });
  } catch (err) {
    console.error("Update Regularization Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
