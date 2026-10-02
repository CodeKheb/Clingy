import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { classroomRouter } from "./routes/classroom";
import { calendarRouter } from "./routes/calendar";
import { scheduleRouter } from "./routes/schedule";

const app = express();
app.use(cors());
// Photos arrive as base64 JSON, so these need a bigger body limit; they must be mounted before the default parser.
app.use("/schedule", express.json({ limit: "6mb" }), scheduleRouter);
// Earlier app releases call this path; keep it working.
app.use("/cor", express.json({ limit: "6mb" }), scheduleRouter);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/classroom", classroomRouter);
app.use("/calendar", calendarRouter);

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const port = process.env.PORT ?? 4000;
  app.listen(port, () => {
    console.log(`backend listening on :${port}`);
  });
}

export default app;

