const { poolPromise, sql } = require("../../db");

// get all employee
exports.getAllEmployee = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        U.ID,
        U.ProfileImage,
        U.Name,
        U.Email,
        U.Mobile,
        U.RoleID,
        R.RoleName,
        U.ReportingID,
        ED.Department,
        U.CreatedAt,
        U.CreatedBy,
        U.UpdatedAt,
        U.UpdatedBy
      FROM UserTaskMateApp U
      LEFT JOIN RoleTaskMateApp R ON U.RoleID = R.RoleID
      LEFT JOIN EmployeeDetailsTaskMateApp ED ON U.ID = ED.UserID
      ORDER BY U.Name;
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

// Get Current Month Events (Birthdays and Work Anniversaries)
exports.getMonthEvents = async (req, res) => {
  try {
    const pool = await poolPromise;
    const currentYear = new Date().getFullYear();

    const result = await pool.request().query(`
      SELECT 
        U.ID as UserId,
        U.Name,
        U.ProfileImage,
        ED.DateOfBirth,
        ED.DateOfJoining
      FROM UserTaskMateApp U
      INNER JOIN EmployeeDetailsTaskMateApp ED ON U.ID = ED.UserID
      WHERE 
        MONTH(ED.DateOfBirth) = MONTH(GETDATE())
        OR 
        MONTH(ED.DateOfJoining) = MONTH(GETDATE())
    `);

    // Fetch all interactions for the current year
    const interactionsResult = await pool.request()
      .input("EventYear", sql.Int, currentYear)
      .query(`
        SELECT EventType, EventUserId, InteractionType, InteractionByUserId, CommentText, 
               (SELECT Name FROM UserTaskMateApp WHERE ID = InteractionByUserId) as CommenterName
        FROM EventInteractionsTaskMateApp
        WHERE EventYear = @EventYear
      `);

    const interactions = interactionsResult.recordset;

    const events = [];
    const todayMonth = new Date().getMonth();

    result.recordset.forEach(user => {
      // Birthday Check
      if (user.DateOfBirth) {
        const dob = new Date(user.DateOfBirth);
        if (dob.getMonth() === todayMonth) {
          // get likes and comments for this event
          const eventLikes = interactions.filter(i => i.EventType === 'Birthday' && i.EventUserId === user.UserId && i.InteractionType === 'LIKE');
          const eventComments = interactions.filter(i => i.EventType === 'Birthday' && i.EventUserId === user.UserId && i.InteractionType === 'COMMENT');

          events.push({
            type: "Birthday",
            userId: user.UserId,
            name: user.Name,
            image: user.ProfileImage,
            date: dob.getDate(),
            likes: eventLikes.map(l => l.InteractionByUserId),
            comments: eventComments.map(c => ({
              userId: c.InteractionByUserId,
              name: c.CommenterName,
              text: c.CommentText
            }))
          });
        }
      }

      // Work Anniversary Check
      if (user.DateOfJoining) {
        const doj = new Date(user.DateOfJoining);
        if (doj.getMonth() === todayMonth) {
          const years = currentYear - doj.getFullYear();
          if (years > 0) {
            const eventLikes = interactions.filter(i => i.EventType === 'Work Anniversary' && i.EventUserId === user.UserId && i.InteractionType === 'LIKE');
            const eventComments = interactions.filter(i => i.EventType === 'Work Anniversary' && i.EventUserId === user.UserId && i.InteractionType === 'COMMENT');

            events.push({
              type: "Work Anniversary",
              userId: user.UserId,
              name: user.Name,
              image: user.ProfileImage,
              years: years,
              date: doj.getDate(),
              likes: eventLikes.map(l => l.InteractionByUserId),
              comments: eventComments.map(c => ({
                userId: c.InteractionByUserId,
                name: c.CommenterName,
                text: c.CommentText
              }))
            });
          }
        }
      }
    });

    // Sort events by date ascending
    events.sort((a, b) => a.date - b.date);

    res.json({ success: true, data: events });
  } catch (err) {
    console.error("Get Month Events Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Toggle Event Like
exports.toggleEventLike = async (req, res) => {
  try {
    const { eventType, eventUserId, year } = req.body;
    const userId = req.user.id;
    const pool = await poolPromise;

    // Check if like exists
    const checkResult = await pool.request()
      .input("EventType", sql.NVarChar, eventType)
      .input("EventUserId", sql.Int, eventUserId)
      .input("InteractionType", sql.NVarChar, 'LIKE')
      .input("InteractionByUserId", sql.Int, userId)
      .input("EventYear", sql.Int, year)
      .query(`
        SELECT Id FROM EventInteractionsTaskMateApp 
        WHERE EventType = @EventType AND EventUserId = @EventUserId 
          AND InteractionType = @InteractionType AND InteractionByUserId = @InteractionByUserId 
          AND EventYear = @EventYear
      `);

    if (checkResult.recordset.length > 0) {
      // Unlike
      await pool.request()
        .input("Id", sql.Int, checkResult.recordset[0].Id)
        .query(`DELETE FROM EventInteractionsTaskMateApp WHERE Id = @Id`);
      res.json({ success: true, message: "Unliked", liked: false });
    } else {
      // Like
      await pool.request()
        .input("EventType", sql.NVarChar, eventType)
        .input("EventUserId", sql.Int, eventUserId)
        .input("InteractionType", sql.NVarChar, 'LIKE')
        .input("InteractionByUserId", sql.Int, userId)
        .input("EventYear", sql.Int, year)
        .query(`
          INSERT INTO EventInteractionsTaskMateApp (EventType, EventUserId, InteractionType, InteractionByUserId, EventYear)
          VALUES (@EventType, @EventUserId, @InteractionType, @InteractionByUserId, @EventYear)
        `);
      res.json({ success: true, message: "Liked", liked: true });
    }
  } catch (err) {
    console.error("Toggle Like Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Add Event Comment
exports.addEventComment = async (req, res) => {
  try {
    const { eventType, eventUserId, year, commentText } = req.body;
    const userId = req.user.id;
    const pool = await poolPromise;

    await pool.request()
      .input("EventType", sql.NVarChar, eventType)
      .input("EventUserId", sql.Int, eventUserId)
      .input("InteractionType", sql.NVarChar, 'COMMENT')
      .input("InteractionByUserId", sql.Int, userId)
      .input("CommentText", sql.NVarChar, commentText)
      .input("EventYear", sql.Int, year)
      .query(`
        INSERT INTO EventInteractionsTaskMateApp (EventType, EventUserId, InteractionType, InteractionByUserId, CommentText, EventYear)
        VALUES (@EventType, @EventUserId, @InteractionType, @InteractionByUserId, @CommentText, @EventYear)
      `);

    // Fetch commenter name to return
    const userResult = await pool.request()
      .input("UserId", sql.Int, userId)
      .query(`SELECT Name FROM UserTaskMateApp WHERE ID = @UserId`);

    res.json({
      success: true,
      message: "Comment added",
      comment: {
        userId: userId,
        name: userResult.recordset[0].Name,
        text: commentText
      }
    });
  } catch (err) {
    console.error("Add Comment Error:", err);
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
