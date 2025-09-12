const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors())
app.use(express.json())

app.post("/api/message", (req, res) => {
  const { message } = req.body
  
  res.json({
    reply: `Bot says: I received your message → "${message}"`,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});