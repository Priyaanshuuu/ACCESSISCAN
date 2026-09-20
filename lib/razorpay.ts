import Razorpay from "razorpay";
import crypto from "node:crypto";

import { matchesHexSignature } from "@/lib/secure-compare";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required.");
}

export const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac("sha256", keySecret || "").update(`${orderId}|${paymentId}`).digest("hex");
  return matchesHexSignature(expected, signature);
}
