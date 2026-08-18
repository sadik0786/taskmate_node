require('dotenv').config();
const { poolPromise, sql } = require("./db");

async function createTables() {
  try {
    const pool = await poolPromise;

    console.log("Creating HolidayTaskMateApp table...");
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='HolidayTaskMateApp' and xtype='U')
      CREATE TABLE HolidayTaskMateApp (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          Title NVARCHAR(255) NOT NULL,
          HolidayDate DATE NOT NULL,
          DayOfWeek NVARCHAR(50),
          IsActive BIT DEFAULT 1,
          EntryTimeStamp DATETIME DEFAULT GETDATE()
      );
    `);

    console.log("Creating AttendanceTaskMateApp table...");
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AttendanceTaskMateApp' and xtype='U')
      CREATE TABLE AttendanceTaskMateApp (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          UserTaskMateAppId INT NOT NULL,
          AttendanceDate DATE NOT NULL,
          CheckInTime DATETIME,
          CheckOutTime DATETIME,
          Status NVARCHAR(50) DEFAULT 'PRESENT',
          TotalWorkedMinutes INT DEFAULT 0,
          TotalBreakMinutes INT DEFAULT 0,
          EntryTimeStamp DATETIME DEFAULT GETDATE()
      );
    `);

    console.log("Checking for missing columns in AttendanceTaskMateApp...");
    await pool.request().query(`
      IF NOT EXISTS(SELECT * FROM sys.columns 
        WHERE Name = N'TotalBreakMinutes' AND Object_ID = Object_ID(N'AttendanceTaskMateApp'))
      BEGIN
          ALTER TABLE AttendanceTaskMateApp ADD TotalBreakMinutes INT DEFAULT 0;
      END
      IF NOT EXISTS(SELECT * FROM sys.columns 
        WHERE Name = N'TotalWorkedMinutes' AND Object_ID = Object_ID(N'AttendanceTaskMateApp'))
      BEGIN
          ALTER TABLE AttendanceTaskMateApp ADD TotalWorkedMinutes INT DEFAULT 0;
      END
    `);

    console.log("Creating PayslipTaskMateApp table...");
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PayslipTaskMateApp' and xtype='U')
      CREATE TABLE PayslipTaskMateApp (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          UserTaskMateAppId INT NOT NULL,
          Month INT NOT NULL,
          Year INT NOT NULL,
          BasicSalary DECIMAL(18, 2),
          NetPay DECIMAL(18, 2),
          PdfUrl NVARCHAR(500),
          EntryTimeStamp DATETIME DEFAULT GETDATE()
      );
    `);

    console.log("Inserting mock holidays...");
    // Insert mock holidays if empty
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM HolidayTaskMateApp)
      BEGIN
        INSERT INTO HolidayTaskMateApp (Title, HolidayDate, DayOfWeek) VALUES
        ('New Year Day', '2026-01-01', 'Thursday'),
        ('Republic Day', '2026-01-26', 'Monday'),
        ('Holi', '2026-03-03', 'Tuesday'),
        ('Independence Day', '2026-08-15', 'Saturday'),
        ('Diwali', '2026-11-08', 'Sunday'),
        ('Christmas', '2026-12-25', 'Friday');
      END
    `);

    console.log("Inserting mock payslips...");
    // Insert mock payslip for testing (User 1)
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM PayslipTaskMateApp)
      BEGIN
        INSERT INTO PayslipTaskMateApp (UserTaskMateAppId, Month, Year, BasicSalary, NetPay) VALUES
        (1, 6, 2026, 50000, 48000),
        (1, 7, 2026, 50000, 48000);
      END
    `);

    console.log("All tables and mock data created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error creating tables:", error);
    process.exit(1);
  }
}

createTables();
