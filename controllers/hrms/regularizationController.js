const { poolPromise, sql } = require("../../db");

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

