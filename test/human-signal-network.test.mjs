import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {Keypair} from "@solana/web3.js";
import {createWalletChallenge,verifySolanaMessage,profileIdForWallet,nextStreak,deriveRoles,trustScore} from "../lib/human-signal-network.mjs";

test("wallet challenge verifies an ed25519 signature",()=>{
  const kp=Keypair.generate();
  const c=createWalletChallenge(kp.publicKey.toBase58());
  const key=crypto.createPrivateKey({key:Buffer.concat([Buffer.from("302e020100300506032b657004220420","hex"),Buffer.from(kp.secretKey.slice(0,32))]),format:"der",type:"pkcs8"});
  const sig=crypto.sign(null,Buffer.from(c.message),key).toString("base64");
  assert.equal(verifySolanaMessage(kp.publicKey.toBase58(),c.message,sig),true);
  assert.match(profileIdForWallet(kp.publicKey.toBase58()),/^HUMAN-[A-F0-9]{12}$/);
});

test("daily streak increments only on consecutive UTC days",()=>{
  assert.equal(nextStreak("2026-10-01",3,"2026-10-02"),4);
  assert.equal(nextStreak("2026-09-29",3,"2026-10-02"),1);
  assert.equal(nextStreak("2026-10-02",3,"2026-10-02"),3);
});

test("roles derive from verified contribution and trust graph",()=>{
  const p={id:"HUMAN-X",trustConnections:["a","b","c"],reviewCount:0};
  const roles=deriveRoles(p,[{profileId:"HUMAN-X",status:"VERIFIED",type:"CODE"}]);
  assert.deepEqual(new Set(roles),new Set(["SIGNALER","CONTRIBUTOR","BUILDER","CONNECTOR"]));
  assert.equal(trustScore({activeDays:10,streak:5,trustConnections:["a","b"]}),40);
});
