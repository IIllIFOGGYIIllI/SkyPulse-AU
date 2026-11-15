import assert from "node:assert/strict";
import worker from "../src/index.js";

const get = async path => {
  const response=await worker.fetch(new Request("https://skypulse.example"+path),{}, {});
  return {response,body:await response.json()};
};
let r=await get("/health");
assert.equal(r.response.status,200);
assert.equal(r.body.ready,false,"Unconfigured Cloudflare worker must NOT claim live push");
assert.equal(r.body.guaranteed_delivery,false);
r=await get("/public-key");
assert.equal(r.response.status,503);
r=await get("/unknown");
assert.equal(r.response.status,404);
const malicious=await worker.fetch(new Request("https://skypulse.example/subscribe",{
  method:"POST",headers:{"Origin":"https://unapproved.example","Content-Type":"application/json"},
  body:JSON.stringify({endpoint:"https://fcm.googleapis.com/fcm/send/example"})
}),{}, {});
assert.equal(malicious.status,403);
console.log("Notification Worker smoke tests PASSED (no credentials, no live push, origin checks).");
