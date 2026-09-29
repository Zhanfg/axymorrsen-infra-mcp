const RESOURCE_PATTERN = /^[a-z0-9._-]+(?::[A-Za-z0-9._/@-]+)*(?:\*)?$/u;

export function isValidResourcePattern(
  pattern: string,
): boolean {
  if (pattern === "*") return true;
  if (!RESOURCE_PATTERN.test(pattern)) return false;

  const wildcard = pattern.indexOf("*");
  return (
    wildcard === -1 ||
    wildcard === pattern.length - 1
  );
}

export function resourceMatches(
  pattern: string,
  resource: string,
): boolean {
  if (!isValidResourcePattern(pattern)) {
    return false;
  }

  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return resource.startsWith(
      pattern.slice(0, -1),
    );
  }

  return pattern === resource;
}

export function resourcesAllowed(
  allowedPatterns: readonly string[],
  requestedResources: readonly string[],
): boolean {
  if (requestedResources.length === 0) {
    return true;
  }

  return requestedResources.every((resource) =>
    allowedPatterns.some((pattern) =>
      resourceMatches(pattern, resource),
    ),
  );
}

export function resourceHasKind(
  resource: string,
  kinds: readonly string[],
): boolean {
  return kinds.some(
    (kind) =>
      resource === kind ||
      resource.startsWith(`${kind}:`),
  );
}
