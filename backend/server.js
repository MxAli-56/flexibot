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
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

// 🟢 Routes
app.use("/api/admin", adminRoutes);
app.use("/api", chatRoutes);

// 🩺 Health check endpoint (for UptimeRobot)
app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// 🧱 Serve frontend files (embed.js, styles, etc.)
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/themes", express.static(path.join(__dirname, "themes")));

// 🟢 Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});