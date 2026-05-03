import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import rfqRouter from "./routes/rfqs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*"
  }
});

app.set("io", io);
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "british-auction-rfq" });
});

app.use("/api/rfqs", rfqRouter);

const frontendPath = path.join(__dirname, "../../frontend/dist");
const frontendIndexPath = path.join(frontendPath, "index.html");

if (fs.existsSync(frontendIndexPath)) {
  app.use(express.static(frontendPath));
  app.get("*", (_req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else {
  app.get("*", (_req, res) => {
    res.status(404).json({
      message: "Frontend build not found. Run `npm run build` before starting the production server."
    });
  });
}

io.on("connection", (socket) => {
  socket.on("auction:join", (rfqId) => {
    socket.join(`auction:${rfqId}`);
  });

  socket.on("auction:leave", (rfqId) => {
    socket.leave(`auction:${rfqId}`);
  });
});

app.use((error, _req, res, _next) => {
  if (error.name === "ZodError") {
    return res.status(400).json({ message: "Validation failed.", issues: error.issues });
  }

  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || "Something went wrong."
  });
});

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`British Auction RFQ server listening on ${port}`);
});
