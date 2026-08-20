const { poolPromise, sql } = require("../db");

/**
 * eSSL / ZKTeco AiFace-Mars (ADMS Push Data) Controller
 * The device hits /iclock endpoints to push biometric logs directly to the server.
 */

// Basic handshake required by ZKTeco devices
exports.handshake = (req, res) => {
  res.status(200).send("OK");
};

// Receives the actual punch data (cdata)
exports.receiveData = async (req, res) => {
  try {
    // The device sends data as raw text in the body.
    // Example: "101\t2026-08-20 09:00:00\t1\t1\t0\t0\t0\n102\t2026-08-20 09:05:00\t1\t1\t0\t0\t0"
    const rawData = req.body; 

    if (!rawData || typeof rawData !== "string") {
      return res.status(200).send("OK");
    }

    const lines = rawData.split("\n");
    const pool = await poolPromise;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Data is separated by Tabs (\t) or Spaces
      const cols = line.split(/\s+/);
      
      if (cols.length >= 2) {
        const empId = cols[0]; // Usually matches User ID or Employee Code
        const punchDateStr = cols[1]; // e.g., '2026-08-20'
        const punchTimeStr = cols[2]; // e.g., '09:00:00'
        
        // Combine date and time
        const punchDateTime = `${punchDateStr} ${punchTimeStr}`; 
        const dateOnly = punchDateStr; 

        // State: 0=Check-In, 1=Check-Out, 4=Overtime-In, 5=Overtime-Out (depends on machine)
        const state = cols[3] || '0';
        let punchType = "In";
        if (state === '1' || state === '5') punchType = "Out";

        // Check if user exists by EmployeeID in EmployeeDetailsTaskMateApp
        const userCheck = await pool
          .request()
          .input("empId", sql.VarChar, empId)
          .query("SELECT UserID AS ID FROM EmployeeDetailsTaskMateApp WHERE EmployeeID = @empId");

        if (userCheck.recordset.length > 0) {
          const userId = userCheck.recordset[0].ID;

          // Insert into TaskMate attendance logs
          await pool
            .request()
            .input("userId", sql.Int, userId)
            .input("attendanceDate", sql.Date, new Date(dateOnly))
            .input("punchType", sql.VarChar, punchType)
            .input("punchTime", sql.VarChar, punchDateTime)
            .query(
              `INSERT INTO AttendanceLogsTaskMateApp 
                (UserTaskMateAppId, AttendanceDate, PunchType, PunchTime) 
               VALUES (@userId, @attendanceDate, @punchType, @punchTime)`
            );
            
          console.log(`[eSSL] Log Saved: User ${userId} | ${punchType} | ${punchDateTime}`);
        } else {
          console.log(`[eSSL] Ignored: Unknown Employee ID ${empId}`);
        }
      }
    }

    // The server MUST reply with "OK" otherwise the device will keep resending the same logs
    res.status(200).send("OK");
  } catch (error) {
    console.error("[eSSL Error]:", error);
    res.status(200).send("OK");
  }
};
