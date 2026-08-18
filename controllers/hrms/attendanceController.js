const { poolPromise, sql } = require("../../db");

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
          TotalWorkedMinutes,
          TotalBreakMinutes
        FROM AttendanceTaskMateApp
      WHERE UserTaskMateAppId = @UserId
      ${dateFilter}
      ORDER BY AttendanceDate DESC
    `);
    // Fetch Holidays
    const holidaysResult = await pool.request().query(`
      SELECT HolidayDate 
      FROM HolidayTaskMateApp 
      WHERE IsActive = 1
    `);
    const holidayDates = holidaysResult.recordset.map(r => {
      const d = new Date(r.HolidayDate);
      return d.toISOString().split('T')[0];
    });

    // Fetch Approved Leaves for this user
    const leavesResult = await pool.request().input("UserId", sql.Int, userId).query(`
      SELECT FromDate, ToDate 
      FROM ApplyLeaveTaskMateApp 
      WHERE UserTaskMateAppId = @UserId 
        AND Status = 'APPROVED'
    `);
    
    let leaveDates = [];
    leavesResult.recordset.forEach(r => {
      let curr = new Date(r.FromDate);
      let end = new Date(r.ToDate);
      while(curr <= end) {
        leaveDates.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
      }
    });

    res.json({ 
      success: true, 
      data: result.recordset,
      summary: {
        leaveDates,
        holidayDates
      }
    });
  } catch (err) {
    console.error("Get Attendance History Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

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

