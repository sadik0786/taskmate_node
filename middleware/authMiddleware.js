const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

// Middleware to verify JWT token
function authenticate(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res
      .status(401)
      .json({ success: false, error: "Authorization header missing" });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (!token) {
    return res.status(401).json({ error: "Token missing" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id || decoded.userId || decoded.UserId,
      role: (decoded.role || "").toString().toLowerCase(),
      reportingId: decoded.reportingId || 0,
    };
    next();
  } catch (err) {
    // console.error("JWT error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Middleware to check roles (case-insensitive)
function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userRole = (req.user.role || "").toLowerCase();
    const allowedRoles = roles.map((r) => (r || "").toLowerCase());
    if (!allowedRoles.includes(userRole)) {
      return res
        .status(403)
        .json({ error: "Forbidden: insufficient role permission" });
    }
    next();
  };
}

// Data filtering middleware for hierarchical access
function filterDataByRole(req, res, next) {
  const userRole = (req.user.role || "").toLowerCase();
  req.taskFilter = {};

  if (userRole === "superadmin") {
    req.taskFilter.condition = "1=1"; // see all tasks
  } else if (userRole === "admin" || userRole === "employee") {
    req.taskFilter.condition = "t.UserId = @userId";
    req.taskFilter.params = { userId: req.user.id };
  }

  next();
}

module.exports = { authenticate, authorize, filterDataByRole };
