import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import http from "http";
import { WebSocketServer } from "ws";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import downloadroutes from "./routes/download.js";
import paymentroutes from "./routes/payment.js";
import videoModal from "./Modals/video.js";
dotenv.config();
const app = express();
app.set("trust proxy", true);

// ── CORS: allow dev origins + any deployed frontend URL ──────────────────────
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use("/uploads", express.static(path.join("uploads")));
app.get("/", (req, res) => {
  res.send("You tube backend is working");
});
app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/like", likeroutes);
app.use("/watch", watchlaterroutes);
app.use("/history", historyrroutes);
app.use("/comment", commentroutes);
app.use("/download", downloadroutes);
app.use("/payment", paymentroutes);

// ── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Map: userId (string) → WebSocket client
const userSocketMap = new Map();

const send = (ws, data) => {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
};

wss.on("connection", (ws) => {
  let registeredUserId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      // Client tells server: "I am userId X"
      case "register": {
        registeredUserId = msg.userId;
        userSocketMap.set(msg.userId, ws);
        // Broadcast updated online list to all connected clients
        const onlineUsers = Array.from(userSocketMap.keys());
        wss.clients.forEach((client) => {
          if (client.readyState === client.OPEN) {
            send(client, { type: "online-users", users: onlineUsers });
          }
        });
        break;
      }

      // Caller → callee: send WebRTC offer + caller metadata
      case "call-user": {
        const targetWs = userSocketMap.get(msg.to);
        send(targetWs, {
          type: "incoming-call",
          from: msg.from,
          fromName: msg.fromName,
          fromImage: msg.fromImage,
          offer: msg.offer,
        });
        break;
      }

      // Callee → caller: send WebRTC answer
      case "accept-call": {
        const targetWs = userSocketMap.get(msg.to);
        send(targetWs, {
          type: "call-accepted",
          answer: msg.answer,
        });
        break;
      }

      // Callee → caller: decline
      case "decline-call": {
        const targetWs = userSocketMap.get(msg.to);
        send(targetWs, { type: "call-declined" });
        break;
      }

      // Relay ICE candidates between peers
      case "ice-candidate": {
        const targetWs = userSocketMap.get(msg.to);
        send(targetWs, {
          type: "ice-candidate",
          candidate: msg.candidate,
        });
        break;
      }

      // Either party ends the call
      case "hangup": {
        const targetWs = userSocketMap.get(msg.to);
        send(targetWs, { type: "call-ended" });
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    if (registeredUserId) {
      userSocketMap.delete(registeredUserId);
      // Notify remaining clients
      const onlineUsers = Array.from(userSocketMap.keys());
      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          send(client, { type: "online-users", users: onlineUsers });
        }
      });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
  console.log(`WebSocket signaling server active on ws://localhost:${PORT}`);
});

const DBURL = process.env.DB_URL;

// ── Auto-register files from uploads/ into MongoDB ──────────────────────────
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"]);

/** Derive a human-readable title from a raw filename */
const titleFromFilename = (filename) => {
  const name = path.basename(filename, path.extname(filename));
  // Replace separators with spaces and title-case
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Register a single file in MongoDB if it isn't already there */
const registerFile = async (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (!VIDEO_EXTS.has(ext)) return; // skip non-video files

  const filepath = path.join("uploads", filename);
  const existing = await videoModal.findOne({ filename });
  if (existing) return; // already registered

  const stats = fs.statSync(path.join(UPLOADS_DIR, filename));
  const mimeMap = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".m4v": "video/mp4",
  };

  const doc = new videoModal({
    videotitle: titleFromFilename(filename),
    filename,
    filepath,
    filetype: mimeMap[ext] || "video/mp4",
    filesize: String(stats.size),
    videochanel: "Local Uploads",
    uploader: "admin",
    views: 0,
    Like: 0,
  });

  await doc.save();
  console.log(`[AutoSync] Registered: ${filename}`);
};

/** Scan the entire uploads/ folder and register any missing files */
const syncUploadsToDb = async () => {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  const files = fs.readdirSync(UPLOADS_DIR);
  for (const filename of files) {
    try {
      await registerFile(filename);
    } catch (err) {
      console.error(`[AutoSync] Failed to register ${filename}:`, err.message);
    }
  }
  console.log(`[AutoSync] Scan complete — ${files.length} file(s) checked.`);
};

/** Poll uploads/ every 5 seconds and register any new files (reliable on all OS) */
const watchUploads = () => {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  setInterval(async () => {
    try {
      const files = fs.readdirSync(UPLOADS_DIR);
      for (const filename of files) {
        const ext = path.extname(filename).toLowerCase();
        if (!VIDEO_EXTS.has(ext)) continue;
        const exists = await videoModal.findOne({ filename });
        if (!exists) {
          await registerFile(filename);
        }
      }
    } catch (err) {
      console.error("[AutoSync] Poll error:", err.message);
    }
  }, 5000); // check every 5 seconds

  console.log(`[AutoSync] Polling uploads/ every 5s for new files...`);
};

mongoose
  .connect(DBURL)
  .then(async () => {
    console.log("Mongodb connected");
    await syncUploadsToDb(); // register existing files
    watchUploads();          // watch for future drops
  })
  .catch((error) => {
    console.log(error);
  });

