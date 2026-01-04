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

function normalizeBool(v) {
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

async function fetchVideoMeta(videoId) {
  // YouTube oEmbed: no API key required
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;

  const res = await fetch(oembedUrl, {
    headers: {
      // Some hosting environments benefit from an explicit UA
      "User-Agent": "transcript-service/1.0",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`oembed_failed_${res.status}`);
  }

  const data = await res.json();

  return {
    title: typeof data?.title === "string" ? data.title : null,
    channel: typeof data?.author_name === "string" ? data.author_name : null,
    channel_url: typeof data?.author_url === "string" ? data.author_url : null,
    thumbnail_url:
      typeof data?.thumbnail_url === "string" ? data.thumbnail_url : null,
  };
}

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/transcript", async (req, res) => {
  const input = req.query.url || req.query.video_id;
  const lang = req.query.lang;
  const includeSegments = normalizeBool(req.query.segments);

  if (!input) return res.status(400).json({ error: "missing_url_or_video_id" });

  const videoId = extractVideoId(input);
  if (!videoId) return res.status(400).json({ error: "invalid_video_id" });

  let meta = {
    title: null,
    channel: null,
    channel_url: null,
    thumbnail_url: null,
  };
  let meta_warning = null;

  try {
    meta = await fetchVideoMeta(videoId);
  } catch (e) {
    meta_warning = String(e?.message || e);
  }

  try {
    const segments = await YoutubeTranscript.fetchTranscript(
      videoId,
      lang ? { lang } : undefined
    );

    if (!segments?.length) {
      return res.json({
        video_id: videoId,
        title: meta.title,
        channel: meta.channel,
        channel_url: meta.channel_url,
        thumbnail_url: meta.thumbnail_url,
        transcript: "",
        warning: "no_captions_found",
        ...(meta_warning ? { meta_warning } : {}),
      });
    }

    const transcript = segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const payload = {
      video_id: videoId,
      title: meta.title,
      channel: meta.channel,
      channel_url: meta.channel_url,
      thumbnail_url: meta.thumbnail_url,
      transcript,
      ...(meta_warning ? { meta_warning } : {}),
    };

    if (includeSegments) payload.segments = segments;

    return res.json(payload);
  } catch (e) {
    return res.status(502).json({
      video_id: videoId,
      title: meta.title,
      channel: meta.channel,
      channel_url: meta.channel_url,
      thumbnail_url: meta.thumbnail_url,
      error: "transcript_fetch_failed",
      detail: String(e?.message || e),
      ...(meta_warning ? { meta_warning } : {}),
    });
  }
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
