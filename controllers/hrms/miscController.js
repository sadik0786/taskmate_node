const { poolPromise, sql } = require("../../db");

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

// Get Financial Years
exports.getFinancialYears = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Id, YearString, StartDate, EndDate, IsCurrent
      FROM FinancialYearTaskMateApp
      ORDER BY StartDate DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("Get Financial Years Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= PHASE 3: ADMIN REPORT & REGULARIZATION =================
