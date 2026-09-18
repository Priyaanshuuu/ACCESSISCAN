import crypto from "node:crypto";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

const incrementWithLimitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if count > tonumber(ARGV[2]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return count
`;

const releaseSlotScript = `
local count = redis.call('DECR', KEYS[1])
if count <= 0 then redis.call('DEL', KEYS[1]) end
return count
`;

export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

function identityKey(identity: string) {
  return crypto.createHash("sha256").update(identity).digest("hex");
}

export async function consumeScanRateLimit(
  identity: string,
  limit: number,
  windowSeconds = 3600,
): Promise<RateLimitResult> {
  const key = `accessiscan:rate:${identityKey(identity)}`;
  const result = await redis.eval(
    incrementWithLimitScript,
    1,
    key,
    windowSeconds,
    limit,
  );
  const ttl = await redis.ttl(key);

  return { allowed: Number(result) > 0, retryAfter: Math.max(ttl, 1) };
}

export async function reserveScanSlot(
  identity: string,
  limit: number,
  ttlSeconds = 1800,
) {
  const key = `accessiscan:active:${identityKey(identity)}`;
  const result = await redis.eval(
    incrementWithLimitScript,
    1,
    key,
    ttlSeconds,
    limit,
  );

  return { key, allowed: Number(result) > 0 };
}

export async function releaseScanSlot(identity: string) {
  await redis.eval(releaseSlotScript, 1, `accessiscan:active:${identityKey(identity)}`);
}