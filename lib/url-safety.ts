import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

function isBlockedIpv4(address: string) {
  const octets = address.split(".").map(Number);
  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isBlockedIpv6(address: string) {
  const segments = parseIpv6(address);
  if (!segments) return false;

  const isIpv4Mapped = segments.slice(0, 5).every((segment) => segment === 0) && segments[5] === 0xffff;
  if (isIpv4Mapped) {
    const first = segments[6] >> 8;
    const second = segments[6] & 0xff;
    const third = segments[7] >> 8;
    const fourth = segments[7] & 0xff;
    return isBlockedIpv4(`${first}.${second}.${third}.${fourth}`);
  }

  const first = segments[0];
  return (
    segments.every((segment) => segment === 0) ||
    (segments.slice(0, 7).every((segment) => segment === 0) && segments[7] === 1) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
}

function parseIpv6(address: string) {
  let normalized = address.toLowerCase();
  const embeddedIpv4Index = normalized.lastIndexOf(".");
  if (embeddedIpv4Index !== -1) {
    const separator = normalized.lastIndexOf(":", embeddedIpv4Index);
    if (separator === -1) return null;
    const octets = normalized.slice(separator + 1).split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    normalized = `${normalized.slice(0, separator + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").map((segment) => parseInt(segment, 16)) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").map((segment) => parseInt(segment, 16)) : [];
  if ([...left, ...right].some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 0xffff)) return null;

  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function isBlockedAddress(address: string) {
  return isIP(address) === 4
    ? isBlockedIpv4(address)
    : isIP(address) === 6 && isBlockedIpv6(address);
}

export async function assertPublicUrl(value: string) {
  const url = new URL(value.trim());

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed.");
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error("The URL must not contain credentials.");
  }

  await resolvePublicHostname(url.hostname);

  return url.toString();
}

export async function resolvePublicHostname(value: string) {
  const hostname = value
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
  if (
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Private and local destinations are not allowed.");
  }

  const addresses = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

  if (!addresses.length || addresses.some(isBlockedAddress)) {
    throw new Error("Private, link-local, and metadata destinations are not allowed.");
  }

  return addresses;
}
