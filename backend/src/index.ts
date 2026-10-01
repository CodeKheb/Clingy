import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { classroomRouter } from "./routes/classroom";
import { calendarRouter } from "./routes/calendar";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/classroom", classroomRouter);
app.use("/calendar", calendarRouter);

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`backend listening on :${port}`);
});
