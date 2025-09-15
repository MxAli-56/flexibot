const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./db");
const { chatWithGemini } = require("./providers/gemini");

const app = express();
const PORT = process.env.PORT || 5000;
connectDB()

app.use(cors())
app.use(express.json())

app.post("/api/message", async (req, res) => {
  const { message } = req.body;

  const reply = await chatWithGemini(message);

  res.json({ reply });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});