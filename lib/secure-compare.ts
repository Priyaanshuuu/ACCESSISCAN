import crypto from "node:crypto";

export function matchesHexSignature(expected: string, received: string) {
  if (
    !expected ||
    !received ||
    expected.length % 2 !== 0 ||
    received.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(expected) ||
    !/^[0-9a-f]+$/i.test(received)
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
