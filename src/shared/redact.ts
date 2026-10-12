const SENSITIVE_KEYS = [
  "authorization",
  "apiKey",
  "api_key",
  "password",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "x-api-key",
];

export function redactValue(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEYS.some((k) => lower.includes(k.toLowerCase()))) {
    return "[REDACTED]";
  }
  if (typeof value === "object" && value !== null) {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      out[key] = value.map((item, idx) =>
        typeof item === "object" && item !== null
          ? redactObject(item as Record<string, unknown>)
          : redactValue(`${key}[${idx}]`, item)
      );
    } else if (typeof value === "object" && value !== null) {
      out[key] = redactObject(value as Record<string, unknown>);
    } else {
      out[key] = redactValue(key, value);
    }
  }
  return out;
}

export function redactText(text: string): string {
  return text
    .replace(/(authorization\s*[:=]\s*)["']?Bearer\s+[^\s"']+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*)["']?[^\s"']+/gi, "$1[REDACTED]")
    .replace(/(password\s*[:=]\s*)["']?[^\s"']+/gi, "$1[REDACTED]");
}
