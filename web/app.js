import { Buffer } from "buffer";
window.Buffer = Buffer;
import {
  Connection, PublicKey, Keypair, SystemProgram, Transaction,
  clusterApiUrl
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE, getMinimumBalanceForRentExemptMint,
  createInitializeMint2Instruction, getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction, createMintToInstruction,
  getMint, createSetAuthorityInstruction, AuthorityType
} from "@solana/spl-token";

const AUTHORIZED_WALLET = "pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t";
const DEVNET_RPC = clusterApiUrl("devnet");
const DECIMALS = 9;
const SUPPLY_BASE = 1_000_000_000n * 10n ** 9n;

const connection = new Connection(DEVNET_RPC, "confirmed");
const connectBtn = document.getElementById("connectWallet");
const walletAlert = document.getElementById("walletAlert");
const connectedWallet = document.getElementById("connectedWallet");
const prepareDevnet = document.getElementById("prepareDevnet");
const verifyToken = document.getElementById("verifyToken");
const revokeFreeze = document.getElementById("revokeFreeze");
const revokeMint = document.getElementById("revokeMint");
const devnetBalance = document.getElementById("devnetBalance");
const devnetMint = document.getElementById("devnetMint");
const tokenState = document.getElementById("tokenState");

function provider() {
  return window.phantom?.solana?.isPhantom ? window.phantom.solana : null;
}
function short(address) {
  return address ? `${address.slice(0,6)}…${address.slice(-6)}` : "—";
}
function currentMint() {
  return localStorage.getItem("cohiba.devnetMint") || "";
}
function setMint(address) {
  if (address) localStorage.setItem("cohiba.devnetMint", address);
  devnetMint.textContent = address || "—";
}
function lockReleaseControls() {
  prepareDevnet.disabled = true;
  verifyToken.disabled = true;
  revokeFreeze.disabled = true;
  revokeMint.disabled = true;
}
async function refreshBalance(address) {
  try {
    const lamports = await connection.getBalance(new PublicKey(address), "confirmed");
    devnetBalance.textContent = `${(lamports / 1e9).toFixed(4)} SOL`;
    return lamports;
  } catch {
    devnetBalance.textContent = "RPC ERROR";
    return 0;
  }
}
async function setConnected(address) {
  connectedWallet.textContent = address;
  if (address !== AUTHORIZED_WALLET) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = `Unauthorized wallet: ${short(address)}. Switch Phantom to the COHIBA developer wallet.`;
    lockReleaseControls();
    return;
  }
  walletAlert.className = "wallet-alert ok";
  walletAlert.textContent = "Authorized COHIBA developer wallet connected.";
  prepareDevnet.disabled = false;
  verifyToken.disabled = false;
  const bal = await refreshBalance(address);
  if (bal < 5_000_000) {
    walletAlert.className = "wallet-alert warn";
    walletAlert.textContent = "Wallet connected, but Devnet SOL is low. Fund this wallet on Solana Devnet before creating the token.";
  }
  if (currentMint()) {
    setMint(currentMint());
    await verifyOnChain(false);
  }
}
async function connectPhantom() {
  const p = provider();
  if (!p) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = "Phantom extension not detected. Install/unlock Phantom and reload.";
    window.open("https://phantom.com/download", "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const response = await p.connect();
    await setConnected(response.publicKey.toString());
  } catch (error) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = error?.message || "Wallet connection cancelled.";
  }
}
async function sendWithPhantom(tx, extraSigner) {
  const p = provider();
  if (!p?.publicKey) throw new Error("Connect Phantom first.");
  tx.feePayer = p.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  if (extraSigner) tx.partialSign(extraSigner);
  const signed = await p.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight:false, maxRetries:3 });
  await connection.confirmTransaction({ signature:sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

async function buildLaunchTransaction(p, mint) {
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, "confirmed");
  const ata = await getAssociatedTokenAddress(
    mint.publicKey, p.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: p.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID
    }),
    createInitializeMint2Instruction(
      mint.publicKey, DECIMALS, p.publicKey, p.publicKey, TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountInstruction(
      p.publicKey, ata, p.publicKey, mint.publicKey,
      TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mint.publicKey, ata, p.publicKey, SUPPLY_BASE, [], TOKEN_PROGRAM_ID
    )
  );
  return { tx, mintRent, ata };
}

async function estimateLaunchCost(tx, owner) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = owner;
  tx.recentBlockhash = blockhash;
  const feeResp = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
  const fee = feeResp?.value ?? 10_000;
  const accountRents = tx.instructions
    .filter(ix => ix.programId.equals(SystemProgram.programId))
    .reduce((sum, ix) => sum, 0);
  const ataRentEstimate = await connection.getMinimumBalanceForRentExemption(165, "confirmed");
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, "confirmed");
  const safetyBuffer = 500_000;
  return mintRent + ataRentEstimate + fee + safetyBuffer;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function simulateBeforePhantom(tx, extraSigner) {
  const p = provider();
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = p.publicKey;
  tx.recentBlockhash = blockhash;
  if (extraSigner) tx.partialSign(extraSigner);

  const raw = tx.serialize({ requireAllSignatures:false, verifySignatures:false });
  const response = await fetch(DEVNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: [
        bytesToBase64(raw),
        {
          encoding: "base64",
          sigVerify: false,
          replaceRecentBlockhash: true,
          commitment: "confirmed"
        }
      ]
    })
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message || "Devnet simulation RPC failed.");
  if (json.result?.value?.err) {
    const logs = (json.result.value.logs || []).slice(-6).join(" | ");
    throw new Error(
      "Simulation failed before Phantom opens: " +
      JSON.stringify(json.result.value.err) +
      (logs ? " · " + logs : "")
    );
  }
}

async function sendSimpleTransaction(tx, extraSigner, label) {
  const p = provider();
  if (!p?.publicKey) throw new Error("Connect Phantom first.");

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = p.publicKey;
  tx.recentBlockhash = blockhash;
  if (extraSigner) tx.partialSign(extraSigner);

  walletAlert.className = "wallet-alert warn";
  walletAlert.textContent = `Preflight ${label}…`;
  await simulateBeforePhantom(tx, extraSigner);

  walletAlert.className = "wallet-alert ok";
  walletAlert.textContent = `Preflight PASS: ${label}. Opening Phantom…`;

  const signed = await p.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3
  });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

async function completeDevnetLaunch(mintAddress) {
  const p = provider();
  const mintPubkey = new PublicKey(mintAddress);
  const ata = await getAssociatedTokenAddress(
    mintPubkey, p.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const ataInfo = await connection.getAccountInfo(ata, "confirmed");
  if (!ataInfo) {
    const ataTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        p.publicKey,
        ata,
        p.publicKey,
        mintPubkey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    await sendSimpleTransaction(ataTx, null, "Create COH token account");
  }

  const mintInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_PROGRAM_ID);
  if (mintInfo.supply === 0n) {
    const mintTx = new Transaction().add(
      createMintToInstruction(
        mintPubkey,
        ata,
        p.publicKey,
        SUPPLY_BASE,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    await sendSimpleTransaction(mintTx, null, "Mint 1B COH");
  }

  const finalInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_PROGRAM_ID);
  if (finalInfo.supply !== SUPPLY_BASE) {
    throw new Error(`Unexpected supply after mint: ${finalInfo.supply.toString()}`);
  }

  tokenState.textContent = "DEVNET MINTED";
  walletAlert.className = "wallet-alert ok";
  walletAlert.textContent = "COHIBA Devnet launch complete: 1,000,000,000 COH minted.";
  await verifyOnChain(false);
}

async function createDevnetToken() {
  const p = provider();
  if (!p?.publicKey) return connectPhantom();

  const owner = p.publicKey.toString();
  if (owner !== AUTHORIZED_WALLET) return setConnected(owner);

  prepareDevnet.disabled = true;

  try {
    const balance = await refreshBalance(owner);

    // Conservative balance check for three small Devnet transactions + account rent.
    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, "confirmed");
    const ataRent = await connection.getMinimumBalanceForRentExemption(165, "confirmed");
    const required = mintRent + ataRent + 1_000_000;

    if (balance < required) {
      const have = (balance / 1e9).toFixed(6);
      const need = (required / 1e9).toFixed(6);
      walletAlert.className = "wallet-alert warn";
      walletAlert.textContent =
        `Chưa mở Phantom: có ${have} Devnet SOL, cần khoảng ${need} SOL cho toàn bộ 3 bước.`;
      prepareDevnet.disabled = false;
      return;
    }

    let mintAddress = currentMint();

    if (!mintAddress) {
      const mint = Keypair.generate();
      const createMintTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: p.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID
        }),
        createInitializeMint2Instruction(
          mint.publicKey,
          DECIMALS,
          p.publicKey,
          p.publicKey,
          TOKEN_PROGRAM_ID
        )
      );

      await sendSimpleTransaction(createMintTx, mint, "Create COH mint account");
      mintAddress = mint.publicKey.toBase58();
      setMint(mintAddress);
      walletAlert.className = "wallet-alert ok";
      walletAlert.textContent = `Mint account created: ${mintAddress}. Continue signing the next steps in Phantom.`;
    }

    await completeDevnetLaunch(mintAddress);
  } catch (error) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = error?.message || "Devnet launch failed.";
  } finally {
    prepareDevnet.disabled = false;
  }
}

async function verifyOnChain(showMessage=true) {
  const address = currentMint();
  if (!address) {
    if (showMessage) {
      walletAlert.className = "wallet-alert warn";
      walletAlert.textContent = "No Devnet mint has been created in this browser yet.";
    }
    return;
  }
  try {
    const info = await getMint(connection, new PublicKey(address), "confirmed", TOKEN_PROGRAM_ID);
    const mintAuth = info.mintAuthority?.toBase58() || null;
    const freezeAuth = info.freezeAuthority?.toBase58() || null;
    const supplyOK = info.supply === SUPPLY_BASE && info.decimals === DECIMALS;
    const ownerOK = [mintAuth, freezeAuth].filter(Boolean).every(x => x === AUTHORIZED_WALLET);
    tokenState.textContent = info.mintAuthority === null && info.freezeAuthority === null ? "DEVNET LOCKED" : "DEVNET VERIFIED";
    revokeFreeze.disabled = freezeAuth === null || !supplyOK || !ownerOK;
    revokeMint.disabled = mintAuth === null || !supplyOK || !ownerOK;
    if (showMessage) {
      walletAlert.className = supplyOK && ownerOK ? "wallet-alert ok" : "wallet-alert error";
      walletAlert.textContent = `Supply: ${info.supply.toString()} base units · Mint authority: ${mintAuth ?? "REVOKED"} · Freeze authority: ${freezeAuth ?? "REVOKED"}`;
    }
  } catch (error) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = error?.message || "On-chain verification failed.";
  }
}
async function revokeAuthority(type) {
  const p = provider();
  const address = currentMint();
  if (!p?.publicKey || !address) return;
  if (p.publicKey.toString() !== AUTHORIZED_WALLET) return setConnected(p.publicKey.toString());
  const label = type === AuthorityType.FreezeAccount ? "Freeze" : "Mint";
  if (!confirm(`${label} Authority revocation is irreversible. Continue on Devnet?`)) return;
  try {
    const tx = new Transaction().add(
      createSetAuthorityInstruction(
        new PublicKey(address),
        p.publicKey,
        type,
        null,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    const sig = await sendWithPhantom(tx);
    walletAlert.className = "wallet-alert ok";
    walletAlert.textContent = `${label} Authority revoked on Devnet. Transaction: ${sig}`;
    await verifyOnChain(false);
  } catch (error) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = error?.message || `${label} Authority revocation failed.`;
  }
}

connectBtn.addEventListener("click", connectPhantom);
prepareDevnet.addEventListener("click", createDevnetToken);
verifyToken.addEventListener("click", () => verifyOnChain(true));
revokeFreeze.addEventListener("click", () => revokeAuthority(AuthorityType.FreezeAccount));
revokeMint.addEventListener("click", () => revokeAuthority(AuthorityType.MintTokens));

lockReleaseControls();
setMint(currentMint());

const p = provider();
if (p) {
  p.on?.("connect", publicKey => setConnected(publicKey.toString()));
  p.on?.("accountChanged", publicKey => {
    if (publicKey) setConnected(publicKey.toString());
    else {
      connectedWallet.textContent = "—";
      devnetBalance.textContent = "—";
      walletAlert.className = "wallet-alert";
      walletAlert.textContent = "Wallet disconnected.";
      lockReleaseControls();
    }
  });
  
}
