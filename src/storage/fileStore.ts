import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { ExecutionSummary, Project } from "../shared/schemas.js";
import { NotFoundError } from "../shared/errors.js";

async function ensureDirs(): Promise<void> {
  await fs.mkdir(path.join(config.dataDir, "projects"), { recursive: true });
  await fs.mkdir(path.join(config.dataDir, "runs"), { recursive: true });
  await fs.mkdir(path.join(config.dataDir, "collections"), { recursive: true });
  await fs.mkdir(config.artifactsDir, { recursive: true });
}

function projectPath(id: string): string {
  return path.join(config.dataDir, "projects", `${id}.json`);
}

function runPath(id: string): string {
  return path.join(config.dataDir, "runs", `${id}.json`);
}

export async function initStorage(): Promise<void> {
  await ensureDirs();
}

export async function saveProject(project: Project): Promise<Project> {
  await ensureDirs();
  project.updatedAt = new Date().toISOString();
  await fs.writeFile(projectPath(project.id), JSON.stringify(project, null, 2), "utf8");
  return project;
}

export async function getProject(id: string): Promise<Project> {
  try {
    const raw = await fs.readFile(projectPath(id), "utf8");
    return JSON.parse(raw) as Project;
  } catch {
    throw new NotFoundError(`Project not found: ${id}`);
  }
}

export async function listProjects(): Promise<Project[]> {
  await ensureDirs();
  const files = await fs.readdir(path.join(config.dataDir, "projects"));
  const projects: Project[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = await fs.readFile(path.join(config.dataDir, "projects", file), "utf8");
    projects.push(JSON.parse(raw) as Project);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveRun(summary: ExecutionSummary): Promise<ExecutionSummary> {
  await ensureDirs();
  await fs.writeFile(runPath(summary.runId), JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

export async function getRun(runId: string): Promise<ExecutionSummary> {
  try {
    const raw = await fs.readFile(runPath(runId), "utf8");
    return JSON.parse(raw) as ExecutionSummary;
  } catch {
    throw new NotFoundError(`Run not found: ${runId}`);
  }
}

export async function writeJsonArtifact(
  relativePath: string,
  data: unknown
): Promise<string> {
  await ensureDirs();
  const full = path.join(config.dataDir, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(data, null, 2), "utf8");
  return full;
}

export async function readJsonArtifact<T>(relativePath: string): Promise<T> {
  const full = path.join(config.dataDir, relativePath);
  const raw = await fs.readFile(full, "utf8");
  return JSON.parse(raw) as T;
}
