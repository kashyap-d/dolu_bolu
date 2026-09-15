const validationOrigin = "https://dolu-bolu.invalid";

export function isAppPath(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function safeNextPath(value: unknown, fallback = "/app") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const candidate = new URL(value, validationOrigin);

    if (candidate.origin !== validationOrigin || !isAppPath(candidate.pathname)) {
      return fallback;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}
