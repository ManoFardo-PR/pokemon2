export const CONTRACT_VERSION = "1.0.0" as const;
export const CONTRACT_MAJOR = 1 as const;

const SEMVER_REGEX = /^\s*(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?\s*$/;

export function isCompatible(other: string): boolean {
  if (typeof other !== "string") {
    return false;
  }
  const match = other.match(SEMVER_REGEX);
  if (!match || match[1] === undefined) {
    return false;
  }
  const major = Number.parseInt(match[1], 10);
  return major === CONTRACT_MAJOR;
}
