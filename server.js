require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const { poolPromise, sql } = require("./db");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/user");
const taskRoutes = require("./routes/task");

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ---------------- Seed Admin User ---------------- //
async function seedAdmin() {
  const SuperAdminEmail = "deepak.kadam@5nance.com";
  try {
    const pool = await poolPromise;
    // check if exists
    const check = await pool
      .request()
      .input("email", sql.NVarChar, SuperAdminEmail)
      .query("SELECT * FROM UserTaskMateApp WHERE Email = @email");

    if (check.recordset.length === 0) {
      const hashed = await bcrypt.hash("admin$123", 10);
      await pool
        .request()
        .input("name", sql.NVarChar, "Deepak Kadam")
        .input("email", sql.NVarChar, SuperAdminEmail)
        .input("mobile", sql.VarChar, "9967585171")
        .input("password", sql.NVarChar, hashed)
        .input("roleId", sql.Int, 1)
        .input("reportingId", sql.Int, 0)
        .query(
          `INSERT INTO UserTaskMateApp 
            (Name, Email, Mobile, PasswordHash, RoleID,ReportingID, CreatedBy, UpdatedBy) 
           VALUES (@name, @email, @mobile, @password, @roleId, 0,0, 0)`
        );
      console.log("✅ Super Admin created:", SuperAdminEmail);
    } else {
      console.log("ℹ️ Super Admin already exists");
    }
  } catch (error) {
    console.error("❌ seedAdmin error:", error);
  }
}

// Routes
app.get("/", async (req, res) => res.json("working"));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/task", taskRoutes);

// Start server
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  await seedAdmin(); // ✅ run after server starts
});
