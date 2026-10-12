import express from "express";
import cors from "cors";
import path from "node:path";
import { config } from "../config.js";
import { initStorage } from "../storage/fileStore.js";
import { createMockInsuranceApp } from "../mock-api/app.js";
import { createApiRouter } from "./routes.js";
import { AppError } from "../shared/errors.js";

async function main() {
  await initStorage();

  // Embedded mock insurance API on dedicated port
  const mockApp = createMockInsuranceApp();
  mockApp.listen(config.mockApiPort, "127.0.0.1", () => {
    console.log(`Mock insurance API: http://127.0.0.1:${config.mockApiPort}`);
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(config.publicDir));

  app.use("/api", createApiRouter());

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(config.publicDir, "index.html"));
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          error: { code: err.code, message: err.message, details: err.details },
        });
      }
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "ZodError") {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            details: err,
          },
        });
      }
      console.error(err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
      });
    }
  );

  app.listen(config.port, () => {
    console.log(`Accelerator UI/API: http://127.0.0.1:${config.port}`);
    console.log(`LLM provider: ${config.llmProvider} (demo-safe mock by default)`);
  });
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
