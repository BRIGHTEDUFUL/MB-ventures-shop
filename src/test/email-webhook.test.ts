// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { decodeSecret, parseEvent, verifySvixSignature } from "../../convex/emails/webhook";

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** A fresh `whsec_…` secret, exactly as the Resend dashboard hands it out. */
async function makeSecret(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${toBase64(bytes)}`;
}

async function sign(secret: string, id: string, timestamp: string, rawBody: string) {
  const keyBytes = decodeSecret(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${id}.${timestamp}.${rawBody}`) as BufferSource,
  );
  return toBase64(new Uint8Array(mac));
}

const NOW_MS = 1_760_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

describe("decodeSecret", () => {
  it("strips the whsec_ prefix and decodes base64", () => {
    expect(decodeSecret("whsec_aGVsbG8=")).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
    expect(decodeSecret("aGVsbG8=")).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it("returns null for nothing usable", () => {
    expect(decodeSecret("")).toBeNull();
    expect(decodeSecret("whsec_")).toBeNull();
    expect(decodeSecret("!!! not base64 !!!")).toBeNull();
  });
});

describe("verifySvixSignature", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "email_1" } });

  it("accepts the signature Resend would send", async () => {
    const secret = await makeSecret();
    const id = "msg_01HXY";
    const timestamp = String(NOW_S);
    const signature = await sign(secret, id, timestamp, body);

    const ok = await verifySvixSignature({
      secret,
      id,
      timestamp,
      signatureHeader: `v1,${signature}`,
      rawBody: body,
      now: NOW_MS,
    });
    expect(ok).toBe(true);
  });

  it("accepts a bare signature and a multi-entry header", async () => {
    const secret = await makeSecret();
    const id = "msg_01HXY";
    const timestamp = String(NOW_S);
    const signature = await sign(secret, id, timestamp, body);

    const bare = await verifySvixSignature({
      secret,
      id,
      timestamp,
      signatureHeader: signature,
      rawBody: body,
      now: NOW_MS,
    });
    expect(bare).toBe(true);

    const multi = await verifySvixSignature({
      secret,
      id,
      timestamp,
      signatureHeader: `v1,bm90LXRoZS1yaWdodC1vbmU= v1,${signature}`,
      rawBody: body,
      now: NOW_MS,
    });
    expect(multi).toBe(true);
  });

  it("rejects a signature from another secret", async () => {
    const secret = await makeSecret();
    const other = await makeSecret();
    const id = "msg_01HXY";
    const timestamp = String(NOW_S);
    const signature = await sign(other, id, timestamp, body);

    const ok = await verifySvixSignature({
      secret,
      id,
      timestamp,
      signatureHeader: `v1,${signature}`,
      rawBody: body,
      now: NOW_MS,
    });
    expect(ok).toBe(false);
  });

  it("rejects a tampered body", async () => {
    const secret = await makeSecret();
    const id = "msg_01HXY";
    const timestamp = String(NOW_S);
    const signature = await sign(secret, id, timestamp, body);

    const ok = await verifySvixSignature({
      secret,
      id,
      timestamp,
      signatureHeader: `v1,${signature}`,
      rawBody: `${body} `,
      now: NOW_MS,
    });
    expect(ok).toBe(false);
  });

  it("rejects a stale or far-future timestamp", async () => {
    const secret = await makeSecret();
    const id = "msg_01HXY";
    const rawBody = body;

    const tooOld = String(NOW_S - 301);
    const oldSignature = await sign(secret, id, tooOld, rawBody);
    expect(
      await verifySvixSignature({
        secret,
        id,
        timestamp: tooOld,
        signatureHeader: `v1,${oldSignature}`,
        rawBody,
        now: NOW_MS,
      }),
    ).toBe(false);

    const tooNew = String(NOW_S + 301);
    const newSignature = await sign(secret, id, tooNew, rawBody);
    expect(
      await verifySvixSignature({
        secret,
        id,
        timestamp: tooNew,
        signatureHeader: `v1,${newSignature}`,
        rawBody,
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  it("refuses unusable inputs without throwing", async () => {
    expect(
      await verifySvixSignature({
        secret: "",
        id: "msg",
        timestamp: String(NOW_S),
        signatureHeader: "v1,AAAA",
        rawBody: body,
        now: NOW_MS,
      }),
    ).toBe(false);

    expect(
      await verifySvixSignature({
        secret: await makeSecret(),
        id: "msg",
        timestamp: "not-a-number",
        signatureHeader: "v1,AAAA",
        rawBody: body,
        now: NOW_MS,
      }),
    ).toBe(false);
  });
});

describe("parseEvent", () => {
  it("reads the type and data without trusting the shape", () => {
    expect(parseEvent('{"type":"email.bounced","data":{"email_id":"email_1"}}')).toEqual({
      type: "email.bounced",
      data: { email_id: "email_1" },
    });
    expect(parseEvent('{"type":"email.sent"}')).toEqual({ type: "email.sent", data: undefined });
    expect(parseEvent('{"type":"email.sent","data":"odd"}')).toEqual({
      type: "email.sent",
      data: undefined,
    });
  });

  it("returns null for anything unreadable", () => {
    expect(parseEvent("not json")).toBeNull();
    expect(parseEvent("null")).toBeNull();
    expect(parseEvent('"a string"')).toBeNull();
    expect(parseEvent("{}")).toBeNull();
    expect(parseEvent('{"data":{}}')).toBeNull();
  });
});
