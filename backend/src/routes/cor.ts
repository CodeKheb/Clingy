import { Router } from "express";
import { ApiError, GoogleGenAI, Type } from "@google/genai";

export const corRouter = Router();

const MAX_BASE64_CHARS = 4_000_000; // Vercel rejects bodies over ~4.5 MB
const MAX_CLASSES = 30;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const PROMPT = `This is a university Certificate of Registration (COR) or an enrolled-subjects table.
Extract only the class schedule rows: subject code or name, meeting days, start and end time, and room.
- Return days exactly as printed (for example "MWF", "TTh", "Sat"). Do not interpret them.
- Return times in 24-hour HH:MM. Convert AM/PM.
- If a subject has several meeting rows (lecture and lab), return each as its own entry.
- Ignore the student's name, ID, fees, signatures and anything that is not a class meeting.
- If a field is unreadable, use null. Never guess.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    classes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, nullable: true },
          days: { type: Type.STRING, nullable: true },
          start: { type: Type.STRING, nullable: true },
          end: { type: Type.STRING, nullable: true },
          room: { type: Type.STRING, nullable: true },
        },
        required: ["subject", "days", "start", "end", "room"],
      },
    },
  },
  required: ["classes"],
};

export type ParsedClass = { subject: string; days: string; start: string; end: string; room: string | null };

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function minutesOf(value: unknown): number | null {
  const match = typeof value === "string" ? TIME.exec(value.trim()) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Drops rows we can't use and trims/caps the rest. The model output is untrusted. */
export function sanitizeClasses(raw: unknown): ParsedClass[] {
  const rows = Array.isArray((raw as { classes?: unknown })?.classes) ? ((raw as { classes: unknown[] }).classes) : [];
  const out: ParsedClass[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const subject = typeof r?.subject === "string" ? r.subject.trim().slice(0, 60) : "";
    const start = minutesOf(r?.start);
    const end = minutesOf(r?.end);
    if (!subject || start === null || end === null || end <= start) continue;
    out.push({
      subject,
      days: typeof r.days === "string" ? r.days.trim().slice(0, 30) : "",
      start: hhmm(start),
      end: hhmm(end),
      room: typeof r.room === "string" && r.room.trim() ? r.room.trim().slice(0, 40) : null,
    });
    if (out.length >= MAX_CLASSES) break;
  }
  return out;
}

// Same stateless pattern as the other routes: the app sends its Google access token. It is checked
// here so strangers can't spend our Gemini quota.
async function isValidGoogleToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    return res.ok;
  } catch {
    return false;
  }
}

corRouter.post("/parse", async (req, res) => {
  const accessToken = req.headers.authorization?.replace("Bearer ", "");
  if (!accessToken) {
    res.status(401).json({ error: "missing access token" });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("[cor] GEMINI_API_KEY is not set");
    res.status(500).json({ error: "Scanning isn't available right now. Add your classes manually." });
    return;
  }

  const { imageBase64, mimeType } = (req.body ?? {}) as { imageBase64?: unknown; mimeType?: unknown };
  if (typeof imageBase64 !== "string" || !imageBase64 || typeof mimeType !== "string" || !ALLOWED_MIME.has(mimeType)) {
    res.status(400).json({ error: "Send a JPEG, PNG or WebP image." });
    return;
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    res.status(413).json({ error: "That photo is too large. Try a smaller one." });
    return;
  }
  if (!(await isValidGoogleToken(accessToken))) {
    res.status(401).json({ error: "invalid access token" });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: PROMPT }] }],
      config: { responseMimeType: "application/json", responseSchema, temperature: 0 },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text ?? "");
    } catch {
      res.status(502).json({ error: "Couldn't read that photo. Try a clearer one, or add your classes manually." });
      return;
    }

    const classes = sanitizeClasses(parsed);
    if (classes.length === 0) {
      res.status(422).json({ error: "No classes found in that photo. Try a clearer one, or add your classes manually." });
      return;
    }
    res.json({ classes });
  } catch (error) {
    // Status only: never log the image or what the model said (it holds a student's name and ID).
    const status = error instanceof ApiError ? error.status : 0;
    console.error("[cor] Gemini call failed, status:", status || "unknown");
    if (status === 429) {
      res.status(429).json({ error: "Cling is busy reading other photos. Try again in a minute." });
    } else if (status === 400) {
      res.status(422).json({ error: "Couldn't read that photo. Try a clearer one, or add your classes manually." });
    } else {
      res.status(502).json({ error: "Couldn't read that photo. Try again, or add your classes manually." });
    }
  }
});
