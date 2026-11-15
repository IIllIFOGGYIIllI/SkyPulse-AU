#!/usr/bin/env node
/* Run locally. Never commit the generated private VAPID key. Requires Node.js 20+. */
import { webcrypto } from "node:crypto";
const keypair = await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
const pub = new Uint8Array(await webcrypto.subtle.exportKey("raw",keypair.publicKey));
const priv = new Uint8Array(await webcrypto.subtle.exportKey("pkcs8",keypair.privateKey));
const b64u = bytes => Buffer.from(bytes).toString("base64url");
console.log("VAPID_PUBLIC_KEY="+b64u(pub));
console.log("VAPID_PRIVATE_PKCS8="+b64u(priv));
console.log("\nKeep VAPID_PRIVATE_PKCS8 secret and store it only with 'wrangler secret put'.");
