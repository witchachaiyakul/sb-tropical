const express = require('express');
const path = require('path');
const { checkLogin } = require('./firestore'); // ดึงฟังก์ชันมาจาก firestore.js

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Router หลักสำหรับรับ API Request
app.post('/api/call', async (req, res) => {
  try {
    const { method, args } = req.body;

    if (method === 'checkLogin') {
      const [username, password] = args || [];
      const result = await checkLogin(username, password);
      return res.json(result);
    }

    return res.status(400).json({ success: false, message: `Method '${method}' not found` });
  } catch (error) {
    console.error('❌ Server API Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});