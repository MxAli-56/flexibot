// backend/server.js
const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const adminRoutes = require("./routes/admin");
const chatRoutes = require("./routes/chat");
require("dotenv").config();
const path = require("path");

const PORT = process.env.PORT || 5000;
const app = express();

// 🟢 Connect MongoDB
connectDB();

// 🟢 Middlewares

// --- SECURITY UPDATE: TASK 3 CORS ---
const allowedOrigins = [
  "https://smile-care-dental-lovat.vercel.app", // my own dummy website for testing
  "http://localhost:3000", // local development
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error("CORS Policy Blocked this request."), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  }),
);
// --- END SECURITY UPDATE ---

app.use(express.json());

// 🟢 Routes
app.use("/api/admin", adminRoutes);
app.use("/api", chatRoutes);

// 🩺 Health check endpoint (for UptimeRobot)
app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

// 🧱 Serve frontend files (embed.js, styles, etc.)
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/themes", express.static(path.join(__dirname, "themes")));

// 🟢 Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
