// Keep useful platform diagnostics without persisting credentials echoed by an upstream.
export function platformText(value, secrets = [], limit = 300) {
  if (typeof value !== "string") return "";
  let text = value;
  const values = secrets.filter((v) => typeof v === "string" && v);
  for (const secret of [...values].sort((a, b) => b.length - a.length)) text = text.split(secret).join("[redacted]");
  text = text.replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[redacted]")
    .replace(/\b(?:cookie|authorization)\s*[:=][^\r\n]*/gi, "[redacted]")
    .replace(/\b(?:[\w-]*(?:token|secret|password|api[_-]?key)|user_pkey|sessdata)\s*[=:]\s*[^\s,;]+/gi, "[redacted]")
    .replace(/[\x00-\x1f\x7f]/g, " ");
  return text.slice(0, limit);
}

export function platformDetails(error, secrets = []) {
  return {
    ...(Number.isInteger(error.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599 ? {httpStatus:error.httpStatus} : {}),
    platformStatus:platformText(error.platformStatus, secrets, 80),
    platformMessage:platformText(error.platformMessage, secrets),
  };
}
