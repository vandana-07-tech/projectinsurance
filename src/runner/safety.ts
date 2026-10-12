import { SafetyError } from "../shared/errors.js";
import { config } from "../config.js";

const BLOCKED_HOST_PATTERNS = [
  /prod/i,
  /production/i,
  /\.insurance\./i,
];

export function assertAllowedTarget(targetBaseUrl: string, confirmTarget: boolean): void {
  let url: URL;
  try {
    url = new URL(targetBaseUrl);
  } catch {
    throw new SafetyError(`Invalid target URL: ${targetBaseUrl}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SafetyError("Only http/https targets are allowed");
  }

  const host = url.hostname.toLowerCase();
  if (!config.allowedHosts.includes(host)) {
    throw new SafetyError(
      `Target host "${host}" is not in the allowlist (${config.allowedHosts.join(", ")})`
    );
  }

  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host) || re.test(targetBaseUrl))) {
    throw new SafetyError("Production-like targets are blocked by default");
  }

  const isLocalMock =
    (host === "localhost" || host === "127.0.0.1") &&
    Number(url.port || (url.protocol === "https:" ? "443" : "80")) === config.mockApiPort;

  if (!isLocalMock && !confirmTarget) {
    throw new SafetyError(
      "Non-mock targets require explicit confirmation (confirmTarget=true)"
    );
  }
}
