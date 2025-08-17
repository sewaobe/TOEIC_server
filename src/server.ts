import express from 'express';
import dotenv from 'dotenv';
import { connectDB } from './configs/db';
const app = express();

dotenv.config();
connectDB();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Hello TOEIC Server!');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
