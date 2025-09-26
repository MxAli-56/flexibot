// backend/server.js
const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const adminRoutes = require("./routes/admin");
require("dotenv").config();
const chatRoutes = require("./routes/chat"); // ✅ import chat routes

const PORT = process.env.PORT || 5000;
const app = express();

// 🟢 Connect MongoDB
connectDB();

// 🟢 Middlewares
app.use(cors());
app.use(express.json());

const path = require("path");

// Serve the frontend folder so embed.js (and css etc.) can be accessed
app.use(express.static(path.join(__dirname, "../frontend")));

// 🟢 Routes
app.use("/admin", adminRoutes);
app.use("/api", chatRoutes); // ✅ mount chat routes

// 🟢 Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});