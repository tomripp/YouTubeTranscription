import express from "express";
import { YoutubeTranscript } from "@danielxceron/youtube-transcript";

const app = express();
const PORT = process.env.PORT || 3000;

function extractVideoId(input) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v");
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
  } catch {}
  return null;
}

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/transcript", async (req, res) => {
  const input = req.query.url || req.query.video_id;
  const lang = req.query.lang;

  if (!input) return res.status(400).json({ error: "missing_url_or_video_id" });

  const videoId = extractVideoId(input);
  if (!videoId) return res.status(400).json({ error: "invalid_video_id" });

  try {
    const segments = await YoutubeTranscript.fetchTranscript(
      videoId,
      lang ? { lang } : undefined
    );

    if (!segments?.length) {
      return res.json({ video_id: videoId, transcript: "", segments: [], warning: "no_captions_found" });
    }

    const transcript = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
    return res.json({ video_id: videoId, transcript, segments });
  } catch (e) {
    return res.status(502).json({
      video_id: videoId,
      error: "transcript_fetch_failed",
      detail: String(e?.message || e)
    });
  }
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
