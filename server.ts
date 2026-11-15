/**
 * CytoZoe Full-Stack Server (Express + SQLite + SSE Real-Time Telemetry & Sync + Vite)
 */
import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import { createServer as createViteServer } from "vite";
import { APP_VERSION, GIT_VERSION, getDb, importDatasetBytes } from "./src/server/db";
import * as services from "./src/server/services";
import * as quality from "./src/engines/quality";
import * as explainEngine from "./src/engines/explain";

const PORT = Number(process.env.PORT) || 3000;

/* ---------- Live SSE Hub (/api/events) ---------- */
const sseClients = new Set<Response>();

function broadcastEvent(event: string, payload: Record<string, unknown>) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(frame);
    } catch {
      sseClients.delete(client);
    }
  }
}

/* ---------- Simple Multipart Form-Data CSV Parser ---------- */
function extractMultipartFile(rawBody: Buffer, contentType: string): Buffer | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return null;
  const boundary = `--${(match[1] || match[2]).trim()}`;
  const boundaryBuf = Buffer.from(boundary, "utf-8");

  const startIdx = rawBody.indexOf(boundaryBuf);
  if (startIdx < 0) return null;

  const headerEndMarker = Buffer.from("\r\n\r\n", "utf-8");
  const headerEnd = rawBody.indexOf(headerEndMarker, startIdx);
  if (headerEnd < 0) return null;

  const contentStart = headerEnd + 4;
  const nextBoundary = rawBody.indexOf(boundaryBuf, contentStart);
  if (nextBoundary < 0) return null;

  // Strip trailing \r\n before boundary
  let contentEnd = nextBoundary;
  if (rawBody[contentEnd - 2] === 13 && rawBody[contentEnd - 1] === 10) {
    contentEnd -= 2;
  }
  return rawBody.subarray(contentStart, contentEnd);
}

async function startServer() {
  const app = express();
  const db = getDb();

  app.use(express.json({ limit: "2mb" }));

  /* ---------- API Routes ---------- */

  app.get("/api/healthz", (_req, res) => {
    res.json({
      status: "alive",
      app: "CytoZoe",
      version: APP_VERSION,
      git_version: GIT_VERSION,
    });
  });

  app.get("/api/readyz", (_req, res) => {
    const r = services.getReadiness(db);
    res.status(r.ready ? 200 : 503).json(r);
  });

  app.get("/api/status", (_req, res) => {
    res.json(services.getStatus(db));
  });

  app.get("/api/datasets", (_req, res) => {
    res.json(services.listDatasets(db));
  });

  app.post(
    "/api/import",
    express.raw({ type: () => true, limit: "11mb" }),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const contentType = req.headers["content-type"] ?? "";
        let rawBytes: Buffer | null = null;
        if (contentType.includes("multipart/form-data") && Buffer.isBuffer(req.body)) {
          rawBytes = extractMultipartFile(req.body, contentType);
        } else if (Buffer.isBuffer(req.body)) {
          rawBytes = req.body;
        }
        if (!rawBytes || rawBytes.length === 0) {
          throw new services.AppError(400, "VALIDATION_ERROR", "No CSV file payload received.");
        }
        if (rawBytes.length > 10 * 1024 * 1024) {
          throw new services.AppError(413, "FILE_TOO_LARGE", "The file exceeds the 10 MB import limit.");
        }
        const result = importDatasetBytes(db, rawBytes);
        if (result.status !== "ALREADY_IMPORTED") {
          broadcastEvent("dataset.imported", {
            dataset_id: result.dataset_id,
            sha256: result.sha256,
            origin: req.headers["x-cytozoe-client"] ?? null,
          });
        }
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  app.get("/api/participants", (_req, res, next) => {
    try {
      res.json(services.listParticipants(db));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/health", (req, res, next) => {
    try {
      const participant = String(req.query.participant ?? "C001");
      const sample = String(req.query.sample ?? "L-3");
      res.json(services.getHealthOverview(db, participant, sample));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/health/trend", (req, res, next) => {
    try {
      const participant = String(req.query.participant ?? "C001");
      const marker = String(req.query.marker ?? "creatinine");
      res.json(services.getHealthTrend(db, participant, marker));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/health/full-panel", (req, res, next) => {
    try {
      const participant = String(req.query.participant ?? "C001");
      const sample = String(req.query.sample ?? "L-3");
      res.json(services.getFullCmpPanel(db, participant, sample));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/mission/brief", (req, res, next) => {
    try {
      const participant = String(req.query.participant ?? "C001");
      const sample = String(req.query.sample ?? "L-3");
      const mode = String(req.query.mode ?? "historical");
      res.json(services.buildMissionBrief(db, participant, sample, mode));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/replay/health", (req, res, next) => {
    try {
      const participant = String(req.query.participant ?? "C001");
      res.json(services.getHealthReplay(db, participant));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/environment", (_req, res, next) => {
    try {
      res.json(services.getEnvironmentView(db));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/replay/environment", (req, res, next) => {
    try {
      const speedRaw = Number(req.query.speed ?? 240);
      const speed = Number.isFinite(speedRaw) ? Math.min(3600, Math.max(10, speedRaw)) : 240;
      const startRaw = Number(req.query.start ?? 0);
      const start = Number.isFinite(startRaw) ? Math.max(0, startRaw) : 0;

      const view = services.getEnvironmentView(db);
      const integ = view.integration;

      const items: Array<{ t: number; order: number; item: Record<string, unknown> }> = [];
      for (const seg of view.segments) {
        seg.points.forEach((p, idx) => {
          if (p.t >= start) {
            items.push({
              t: p.t,
              order: 1,
              item: {
                kind: "reading",
                t: p.t,
                ts: p.ts,
                rate: p.rate,
                cumulative: p.cumulative,
                source_row: p.source_row,
                segment: seg.index,
                segment_start: idx === 0,
                covered_seconds: Math.round((p.t / Math.max(1, integ.span_seconds)) * integ.covered_seconds),
              },
            });
          }
        });
      }

      for (const g of view.quality.conflict_groups) {
        if (g.t >= start) {
          items.push({
            t: g.t,
            order: 0,
            item: {
              kind: "excluded",
              t: g.t,
              ts: g.timestamp,
              evidence_id: g.evidence_id,
              rows: g.rows,
              reason: "DUPLICATE_CONFLICT",
            },
          });
        }
      }

      items.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.order - b.order));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const writeSse = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      writeSse("meta", {
        mode: "HISTORICAL_REPLAY",
        speed,
        start,
        unit: view.unit,
        final_estimated_sensor_dose_uGy: integ.estimated_sensor_dose_uGy,
        span_seconds: integ.span_seconds,
        day_start: view.segments[0]?.points[0]?.t ?? 0,
      });

      if (items.length === 0) {
        writeSse("end", {
          covered_seconds: integ.covered_seconds,
          estimated_sensor_dose_uGy: integ.estimated_sensor_dose_uGy,
        });
        res.end();
        return;
      }

      let closed = false;
      req.on("close", () => {
        closed = true;
      });

      const tOrigin = items[0].t;
      const wallOrigin = Date.now();
      let cursor = 0;

      const pump = () => {
        if (closed) return;
        const elapsedSimSeconds = ((Date.now() - wallOrigin) / 1000) * speed;
        const targetT = tOrigin + elapsedSimSeconds;
        const batch: Record<string, unknown>[] = [];

        while (cursor < items.length && items[cursor].t <= targetT) {
          batch.push(items[cursor].item);
          cursor++;
        }

        if (batch.length > 0) {
          writeSse("frame", { events: batch });
        }

        if (cursor >= items.length) {
          writeSse("end", {
            covered_seconds: integ.covered_seconds,
            estimated_sensor_dose_uGy: integ.estimated_sensor_dose_uGy,
          });
          res.end();
          return;
        }

        setTimeout(pump, 55);
      };

      setTimeout(pump, 20);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/evidence/:id", (req, res, next) => {
    try {
      const id = decodeURIComponent(req.params.id);
      res.json(services.resolveEvidence(db, id, true));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/explain", (req, res, next) => {
    try {
      const { evidence_id, question_id, message } = req.body ?? {};
      if (!evidence_id || typeof evidence_id !== "string") {
        throw new services.AppError(400, "INVALID_FINDING_ID", "An evidence_id is required.");
      }
      const evidence = services.resolveEvidence(db, evidence_id, false);
      if (question_id) {
        if (!(question_id in explainEngine.QUESTIONS)) {
          throw new services.AppError(400, "QUESTION_REQUIRED", `Unknown question_id '${question_id}'.`);
        }
        res.json(explainEngine.buildExplanation(evidence, question_id));
        return;
      }
      if (typeof message === "string" && message.trim()) {
        const classified = explainEngine.classifyQuestion(message.trim());
        if (!classified) {
          res.json(explainEngine.unsupportedExplanation(evidence_id));
          return;
        }
        res.json(explainEngine.buildExplanation(evidence, classified));
        return;
      }
      throw new services.AppError(400, "QUESTION_REQUIRED", "Provide either question_id or message.");
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/reviews", (req, res, next) => {
    try {
      res.json(
        services.listReviews(db, {
          case: req.query.case ? String(req.query.case) : undefined,
          status: req.query.status ? String(req.query.status) : undefined,
          participant: req.query.participant ? String(req.query.participant) : undefined,
          page: req.query.page ? Number(req.query.page) : 1,
          page_size: req.query.page_size ? Number(req.query.page_size) : 200,
        })
      );
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/reviews", (req, res, next) => {
    try {
      const { finding_id, status, note, follow_up_date } = req.body ?? {};
      if (!finding_id || typeof finding_id !== "string") {
        throw new services.AppError(422, "VALIDATION_ERROR", "finding_id is required.");
      }
      if (!services.REVIEW_STATUSES.includes(status)) {
        throw new services.AppError(422, "VALIDATION_ERROR", "Invalid review status.");
      }
      const cleanNote = typeof note === "string" ? note.trim() : "";
      if (!cleanNote || cleanNote.length > 2000) {
        throw new services.AppError(422, "VALIDATION_ERROR", "A reviewer note (1–2000 chars) is required.");
      }
      const result = services.createReview(
        db,
        finding_id,
        status,
        cleanNote,
        follow_up_date ? String(follow_up_date) : null
      );
      if (result.created) {
        broadcastEvent("review.created", {
          review: result.review,
          origin: req.headers["x-cytozoe-client"] ?? null,
        });
      }
      res.status(result.created ? 201 : 200).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/reviews/:id", (req, res, next) => {
    try {
      res.json(services.getReviewDetail(db, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/reviews/:id", (req, res, next) => {
    try {
      const { version, status, note, follow_up_date, clear_follow_up_date } = req.body ?? {};
      if (typeof version !== "number") {
        throw new services.AppError(422, "VALIDATION_ERROR", "Numeric version is required for optimistic locking.");
      }
      if (status !== undefined && !services.REVIEW_STATUSES.includes(status)) {
        throw new services.AppError(422, "VALIDATION_ERROR", "Invalid review status.");
      }
      let cleanNote: string | undefined;
      if (note !== undefined) {
        cleanNote = String(note).trim();
        if (!cleanNote || cleanNote.length > 2000) {
          throw new services.AppError(422, "VALIDATION_ERROR", "A reviewer note (1–2000 chars) is required.");
        }
      }
      const updated = services.patchReview(db, req.params.id, version, {
        status,
        note: cleanNote,
        follow_up_date: follow_up_date !== undefined ? (follow_up_date ? String(follow_up_date) : null) : undefined,
        clear_follow_up_date: Boolean(clear_follow_up_date),
      });
      broadcastEvent("review.updated", {
        review: updated,
        origin: req.headers["x-cytozoe-client"] ?? null,
      });
      res.json({ review: updated });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/export", (req, res, next) => {
    try {
      const format = String(req.query.format ?? "json").toLowerCase();
      const download = req.query.download !== "false";
      const packet = services.buildExportPacket(db);
      if (format === "html") {
        const html = services.renderExportHtml(packet);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        if (download) {
          res.setHeader("Content-Disposition", 'attachment; filename="cytozoe-review-packet.html"');
        }
        res.send(html);
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (download) {
        res.setHeader("Content-Disposition", 'attachment; filename="cytozoe-review-packet.json"');
      }
      res.send(JSON.stringify(packet, null, 2));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`event: hello\ndata: ${JSON.stringify({ connected: true })}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20000);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  /* ---------- API Error Handler ---------- */
  app.use("/api", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof services.AppError) {
      res.status(err.status).json({
        code: err.code,
        message: err.message,
        details: err.details,
      });
      return;
    }
    if (err instanceof quality.SchemaMismatch) {
      res.status(422).json({
        code: err.code,
        message: err.message,
        details: err.details,
      });
      return;
    }
    console.error("Unhandled API Error:", err);
    res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred; saved data is unchanged.",
      details: {},
    });
  });

  /* ---------- Vite Middleware or Static Serving ---------- */
  const distPath = path.resolve(process.cwd(), "dist");
  const hasDist = fs.existsSync(path.join(distPath, "index.html"));
  if (hasDist && process.env.NODE_ENV !== "development") {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CytoZoe server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
