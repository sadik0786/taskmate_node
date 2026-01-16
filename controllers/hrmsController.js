const { poolPromise, sql } = require("../db");

// get all leave type
exports.getAllLeaveType = async (req, res) => {
  try {
    const pool = await poolPromise;

    // Get the task
    const result = await pool.request().query(`
      SELECT 
        Id,
        LeaveName,
        LeaveCount
      FROM LeaveTypeTaskMateApp
      WHERE IsActive = 1
      ORDER BY LeaveName
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
    if (!["hr", "superadmin"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        A.Id,
        A.UserTaskMateAppId,
        U.Name AS EmployeeName,
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
      WHERE A.UserTaskMateAppId <> ${id}
      AND A.Status = 'PENDING'
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

// update leave by hr / super admin
exports.updateLeaves = async (req, res) => {
  try {
    const { leaveId, status, hrReason } = req.body;
    const { role, id } = req.user;

    // role check
    if (!["hr", "superadmin"].includes(role)) {
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

    if (!["hr", "superadmin"].includes(role)) {
      return res.status(403).json({ success: false });
    }

    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        A.Id,
        U.Name AS EmployeeName,
        L.LeaveName,
        A.FromDate,
        A.ToDate,
        A.TotalDays,
        A.Reason,
        A.Status
      FROM ApplyLeaveTaskMateApp A
      JOIN UserTaskMateApp U ON A.UserTaskMateAppId = U.ID
      JOIN LeaveTypeTaskMateApp L ON A.LeaveTypeTaskMateAppId = L.Id
      WHERE A.Status = 'PENDING'
      ORDER BY A.Id DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};
