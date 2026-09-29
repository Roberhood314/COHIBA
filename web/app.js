import { Buffer } from "buffer";
window.Buffer = Buffer;

import {
  Connection, PublicKey, Keypair, SystemProgram, Transaction, clusterApiUrl
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, MINT_SIZE,
  createInitializeMint2Instruction, getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction, createMintToInstruction,
  getMint, createSetAuthorityInstruction, AuthorityType
} from "@solana/spl-token";

const AUTHORIZED_WALLET = "pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t";
const DECIMALS = 9;
const TOTAL_SUPPLY_UI = 1_000_000_000n;
const SUPPLY_BASE = TOTAL_SUPPLY_UI * 10n ** BigInt(DECIMALS);

const connectBtn = document.getElementById("connectWallet");
const walletAlert = document.getElementById("walletAlert");
const connectedWallet = document.getElementById("connectedWallet");
const launchToken = document.getElementById("launchToken");
const verifyToken = document.getElementById("verifyToken");
const resetMintState = document.getElementById("resetMintState");
const sweepAll = document.getElementById("sweepAll");
const revokeFreeze = document.getElementById("revokeFreeze");
const revokeMint = document.getElementById("revokeMint");
const networkSelect = document.getElementById("networkSelect");
const solBalance = document.getElementById("solBalance");
const mintAddress = document.getElementById("mintAddress");
const tokenBalance = document.getElementById("tokenBalance");
const tokenState = document.getElementById("tokenState");
const mainnetConfirm = document.getElementById("mainnetConfirm");

let connection = makeConnection();

function provider() {
  return window.phantom?.solana?.isPhantom ? window.phantom.solana : null;
}

function network() {
  return networkSelect.value;
}

function isMainnet() {
  return network() === "mainnet-beta";
}

function rpcUrl() {
  return clusterApiUrl(network());
}

function makeConnection() {
  return new Connection(clusterApiUrl(networkSelect?.value || "devnet"), "confirmed");
}

function mintStorageKey() {
  return `cohiba.${network()}.mint`;
}

function currentMint() {
  return localStorage.getItem(mintStorageKey()) || "";
}

function setMint(address) {
  if (address) localStorage.setItem(mintStorageKey(), address);
  mintAddress.textContent = address || "—";
}

function short(address) {
  return address ? `${address.slice(0,6)}…${address.slice(-6)}` : "—";
}

function mainnetArmed() {
  return !isMainnet() || mainnetConfirm.value.trim() === "MAINNET COHIBA";
}

function setAlert(kind, message) {
  walletAlert.className = `wallet-alert ${kind || ""}`.trim();
  walletAlert.textContent = message;
}

function lockAll() {
  launchToken.disabled = true;
  verifyToken.disabled = true;
  revokeFreeze.disabled = true;
  revokeMint.disabled = true;
  if (sweepAll) sweepAll.disabled = true;
}

async function refreshBalance(address) {
  try {
    const lamports = await connection.getBalance(new PublicKey(address), "confirmed");
    solBalance.textContent = `${(lamports / 1e9).toFixed(6)} SOL`;
    return lamports;
  } catch {
    solBalance.textContent = "RPC ERROR";
    return 0;
  }
}


async function validateStoredMintState() {
  const mint = currentMint();
  if (!mint) return false;
  try {
    await getMint(connection, new PublicKey(mint), "confirmed", TOKEN_PROGRAM_ID);
    return true;
  } catch {
    localStorage.removeItem(mintStorageKey());
    setMint("");
    tokenBalance.textContent = "—";
    tokenState.textContent = "NOT LAUNCHED";
    setAlert("warn", "Removed stale/failed mint state. You can create COH again.");
    return false;
  }
}

function resetFailedMintState() {
  const mint = currentMint();
  if (!mint) {
    setAlert("ok", "No stored mint state to reset.");
    return;
  }
  if (!confirm("Clear the stored COH mint address for the selected network? This does not delete any on-chain token.")) return;
  localStorage.removeItem(mintStorageKey());
  setMint("");
  tokenBalance.textContent = "—";
  tokenState.textContent = "NOT LAUNCHED";
  revokeFreeze.disabled = true;
  revokeMint.disabled = true;
  setAlert("ok", "Stored mint state cleared. Create COH again.");
}

async function refreshControls() {
  const p = provider();
  const connected = p?.publicKey?.toString();
  lockAll();

  if (!isMainnet()) {
    launchToken.disabled = false;
    verifyToken.disabled = !currentMint();
    if (resetMintState) resetMintState.disabled = false;
    if (sweepAll) sweepAll.disabled = true;
    return;
  }

  if (!connected || connected !== AUTHORIZED_WALLET) return;

  verifyToken.disabled = false;
  if (resetMintState) resetMintState.disabled = false;
  if (sweepAll) sweepAll.disabled = false;
  launchToken.disabled = !mainnetArmed();

  if (currentMint()) {
    const valid = await validateStoredMintState();
    if (valid) {
      setMint(currentMint());
      await verifyOnChain(false);
    }
  } else {
    setMint("");
    tokenBalance.textContent = "—";
    tokenState.textContent = "NOT LAUNCHED";
  }
}

async function setConnected(address) {
  connectedWallet.textContent = address;

  if (address !== AUTHORIZED_WALLET) {
    setAlert("error", `Unauthorized wallet: ${short(address)}. Switch Phantom to the COHIBA developer wallet.`);
    lockAll();
    return;
  }

  await refreshBalance(address);

  if (isMainnet()) {
    setAlert("warn", "MAINNET selected. Real SOL will be spent. Type MAINNET COHIBA to arm token creation.");
  } else {
    setAlert("ok", "Authorized COHIBA developer wallet connected on Devnet.");
  }

  await refreshControls();
}

async function connectPhantom() {
  const p = provider();
  if (!p) {
    setAlert("error", "Phantom extension not detected. Install or unlock Phantom and reload.");
    return;
  }
  try {
    const response = await p.connect();
    await setConnected(response.publicKey.toString());
  } catch (error) {
    setAlert("error", error?.message || "Wallet connection cancelled.");
  }
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
  const response = await fetch(rpcUrl(), {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({
      jsonrpc:"2.0",
      id:1,
      method:"simulateTransaction",
      params:[
        bytesToBase64(raw),
        {
          encoding:"base64",
          sigVerify:false,
          replaceRecentBlockhash:true,
          commitment:"confirmed"
        }
      ]
    })
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.message || "RPC simulation failed.");
  if (json.result?.value?.err) {
    const logs = (json.result.value.logs || []).slice(-6).join(" | ");
    throw new Error("Simulation failed: " + JSON.stringify(json.result.value.err) + (logs ? " · " + logs : ""));
  }
}

async function sendSimpleTransaction(tx, extraSigner, label) {
  const p = provider();
  if (!p?.publicKey) throw new Error("Connect Phantom first.");

  // 1) Simulate first. The simulation may use a temporary/replaced blockhash.
  setAlert("warn", `Preflight ${label}…`);
  await simulateBeforePhantom(tx, extraSigner);

  // 2) IMPORTANT: fetch a brand-new blockhash immediately before Phantom signs.
  // This prevents "block height exceeded" while the user is reviewing the prompt.
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("processed");

  tx.feePayer = p.publicKey;
  tx.recentBlockhash = blockhash;

  // Changing the blockhash changes the signed message, so re-sign any local
  // ephemeral signer (e.g. the new mint account) with the fresh blockhash.
  if (extraSigner) tx.partialSign(extraSigner);

  setAlert("ok", `Preflight PASS: ${label}. Confirm promptly in Phantom.`);

  let signed;
  try {
    signed = await p.signTransaction(tx);
  } catch (error) {
    throw new Error(error?.message || "Phantom signing was cancelled.");
  }

  try {
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight:false,
      maxRetries:5
    });

    await connection.confirmTransaction(
      { signature:sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    return sig;
  } catch (error) {
    const msg = String(error?.message || error || "");
    if (
      msg.includes("block height exceeded") ||
      msg.includes("Blockhash not found") ||
      msg.includes("expired")
    ) {
      throw new Error(
        "Transaction expired before Solana accepted it. Click the action again; COHIBA will generate a fresh blockhash and reopen Phantom."
      );
    }
    throw error;
  }
}

async function requiredLamports() {
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, "confirmed");
  const ataRent = await connection.getMinimumBalanceForRentExemption(165, "confirmed");
  const buffer = isMainnet() ? 2_000_000 : 1_000_000;
  return { mintRent, total: mintRent + ataRent + buffer };
}

async function launch() {
  // Devnet creation is fully server-side and does NOT require Phantom.
  if (!isMainnet()) {
    launchToken.disabled = true;
    try {
      setAlert("warn", "Creating COH on Devnet server-side. Phantom is not used…");

      const response = await fetch("/api/create-coh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: "devnet" })
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        if(result.error==="DEVNET_SYSTEM_WALLET_NEEDS_FUNDING"){
        const need=((Number(result.requiredLamports||0)-Number(result.balanceLamports||0))/1e9).toFixed(4);
        throw new Error(`Devnet system wallet needs test SOL. Send about ${need} Devnet SOL to: ${result.systemWallet}`);
      }
      throw new Error(result.error || "Server-side Devnet COH creation failed.");
      }

      setMint(result.mint);
      tokenState.textContent = "DEVNET MINTED";
      tokenBalance.textContent = "1,000,000,000 COH";
      setAlert(
        "ok",
        `Created 1,000,000,000 COH directly to ${result.destinationWallet}. Mint: ${result.mint}`
      );
    } catch (error) {
      setAlert("error", error?.message || "Devnet COH launch failed.");
    } finally {
      launchToken.disabled = false;
    }
    return;
  }

  // Mainnet remains deliberately gated.
  const p = provider();
  if (!p?.publicKey) {
    setAlert("warn", "Mainnet still requires the authorized wallet context and server signer configuration.");
    return;
  }

  const owner = p.publicKey.toString();
  if (owner !== AUTHORIZED_WALLET) return setConnected(owner);

  if (!mainnetArmed()) {
    setAlert("warn", "Type MAINNET COHIBA before creating the Mainnet token.");
    return;
  }

  launchToken.disabled = true;
  try {
    setAlert("warn", "Creating COH on Mainnet server-side…");

    const response = await fetch("/api/create-coh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network: "mainnet-beta" })
    });

    const result = await response.json();
    if (!response.ok || !result.ok) {
      if (result.error === "MAINNET_LOCKED") {
        throw new Error("Mainnet server signer is locked.");
      }
      if (result.error === "MAINNET_SIGNER_NOT_CONFIGURED") {
        throw new Error("Mainnet signer is not configured in Railway Secret.");
      }
      throw new Error(result.error || "Server-side Mainnet COH creation failed.");
    }

    setMint(result.mint);
    tokenState.textContent = "MAINNET MINTED";
    tokenBalance.textContent = "1,000,000,000 COH";
    setAlert(
      "ok",
      `Created 1,000,000,000 COH directly to ${result.destinationWallet}. Mint: ${result.mint}`
    );
  } catch (error) {
    setAlert("error", error?.message || "Mainnet COH launch failed.");
  } finally {
    launchToken.disabled = false;
  }
}

async function verifyOnChain(showMessage=true) {
  const p = provider();
  const mint = currentMint();

  if (!p?.publicKey || !mint) {
    if (showMessage) setAlert("warn", "No COH mint is stored for the selected network.");
    return false;
  }

  try {
    const mintPk = new PublicKey(mint);
    const info = await getMint(connection, mintPk, "confirmed", TOKEN_PROGRAM_ID);
    const ata = await getAssociatedTokenAddress(
      mintPk,
      p.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let walletAmount = 0n;
    try {
      const bal = await connection.getTokenAccountBalance(ata, "confirmed");
      walletAmount = BigInt(bal.value.amount);
      tokenBalance.textContent = `${bal.value.uiAmountString || "0"} COH`;
    } catch {
      tokenBalance.textContent = "0 COH";
    }

    const supplyOK = info.decimals === DECIMALS && info.supply === SUPPLY_BASE;
    const walletOK = walletAmount === SUPPLY_BASE;
    const mintAuth = info.mintAuthority?.toBase58() ?? null;
    const freezeAuth = info.freezeAuthority?.toBase58() ?? null;
    const authorityOK =
      (mintAuth === AUTHORIZED_WALLET || mintAuth === null) &&
      (freezeAuth === AUTHORIZED_WALLET || freezeAuth === null);

    if (supplyOK && walletOK && authorityOK) {
      tokenState.textContent =
        mintAuth === null && freezeAuth === null
          ? `${isMainnet() ? "MAINNET" : "DEVNET"} LOCKED`
          : `${isMainnet() ? "MAINNET" : "DEVNET"} VERIFIED`;

      revokeFreeze.disabled = freezeAuth !== AUTHORIZED_WALLET;
      revokeMint.disabled = mintAuth !== AUTHORIZED_WALLET;

      if (showMessage) {
        setAlert(
          "ok",
          `Verified: 1,000,000,000 COH is in your Phantom token account. Mint authority: ${mintAuth ?? "REVOKED"} · Freeze authority: ${freezeAuth ?? "REVOKED"}.`
        );
      }
      return true;
    }

    tokenState.textContent = "VERIFY FAILED";
    revokeFreeze.disabled = true;
    revokeMint.disabled = true;

    if (showMessage) {
      setAlert(
        "error",
        `Verification mismatch. Supply base units: ${info.supply.toString()} · wallet base units: ${walletAmount.toString()}.`
      );
    }
    return false;

  } catch (error) {
    tokenState.textContent = "VERIFY ERROR";
    if (showMessage) setAlert("error", error?.message || "On-chain verification failed.");
    return false;
  }
}


async function sweepAllCoh() {
  const p = provider();
  const mint = currentMint();
  if (!p?.publicKey || !mint) {
    setAlert("warn", "Connect the source wallet in Phantom and make sure a COH mint exists.");
    return;
  }

  const sourceOwner = p.publicKey;
  const destinationOwner = new PublicKey(AUTHORIZED_WALLET);
  const mintPk = new PublicKey(mint);

  try {
    const sourceAta = await getAssociatedTokenAddress(
      mintPk, sourceOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const destinationAta = await getAssociatedTokenAddress(
      mintPk, destinationOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let sourceBalance;
    try {
      sourceBalance = await connection.getTokenAccountBalance(sourceAta, "confirmed");
    } catch {
      setAlert("warn", "The connected Phantom wallet does not hold COH for this mint. Connect the wallet that currently owns the COH source account.");
      return;
    }

    const amount = BigInt(sourceBalance.value.amount);
    if (amount === 0n) {
      setAlert("warn", "No COH is available to sweep from the connected wallet.");
      return;
    }

    const tx = new Transaction();
    const destinationInfo = await connection.getAccountInfo(destinationAta, "confirmed");
    if (!destinationInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          sourceOwner,
          destinationAta,
          destinationOwner,
          mintPk,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    if (!sourceOwner.equals(destinationOwner)) {
      const { createTransferCheckedInstruction } = await import("@solana/spl-token");
      tx.add(
        createTransferCheckedInstruction(
          sourceAta,
          mintPk,
          destinationAta,
          sourceOwner,
          amount,
          DECIMALS,
          [],
          TOKEN_PROGRAM_ID
        )
      );
    } else {
      setAlert("ok", "The connected Phantom wallet is already the destination wallet; there is nothing to sweep.");
      return;
    }

    if (isMainnet() && !mainnetArmed()) {
      setAlert("warn", "Type MAINNET COHIBA before a Mainnet sweep.");
      return;
    }

    const uiAmount = sourceBalance.value.uiAmountString || amount.toString();
    if (!confirm(`Sweep ${uiAmount} COH from the connected wallet to ${AUTHORIZED_WALLET}? Phantom will ask you to sign.`)) return;

    await sendSimpleTransaction(tx, null, "Sweep all COH to your Phantom wallet");
    setAlert("ok", `Sweep completed. ${uiAmount} COH sent to your destination wallet.`);
    await verifyOnChain(false);
  } catch (error) {
    setAlert("error", error?.message || "COH sweep failed.");
  }
}

async function revokeAuthority(type) {
  const p = provider();
  const mint = currentMint();
  if (!p?.publicKey || !mint) return;

  if (p.publicKey.toString() !== AUTHORIZED_WALLET) {
    return setConnected(p.publicKey.toString());
  }

  if (isMainnet() && !mainnetArmed()) {
    setAlert("warn", "Type MAINNET COHIBA before an irreversible Mainnet revoke.");
    return;
  }

  const verified = await verifyOnChain(false);
  if (!verified) {
    setAlert("error", "Authority revoke remains locked until supply and wallet ownership verify on-chain.");
    return;
  }

  const label = type === AuthorityType.FreezeAccount ? "Freeze" : "Mint";

  if (!confirm(
    `${label} Authority revocation is irreversible on ${isMainnet() ? "MAINNET" : "DEVNET"}. Continue?`
  )) return;

  try {
    const tx = new Transaction().add(
      createSetAuthorityInstruction(
        new PublicKey(mint),
        p.publicKey,
        type,
        null,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    await sendSimpleTransaction(tx, null, `Revoke ${label} Authority`);
    await verifyOnChain(true);
  } catch (error) {
    setAlert("error", error?.message || `${label} Authority revocation failed.`);
  }
}

async function switchNetwork() {
  connection = makeConnection();
  setMint(currentMint());
  tokenBalance.textContent = "—";
  tokenState.textContent = "NOT LAUNCHED";
  revokeFreeze.disabled = true;
  revokeMint.disabled = true;

  const p = provider();
  if (p?.publicKey) await setConnected(p.publicKey.toString());

  if (isMainnet()) {
    setAlert("warn", "MAINNET selected. Type MAINNET COHIBA to arm token creation. Real SOL will be spent.");
  } else {
    setAlert("ok", "Devnet selected.");
  }
}

connectBtn.addEventListener("click", connectPhantom);
launchToken.addEventListener("click", launch);
verifyToken.addEventListener("click", () => verifyOnChain(true));
if (resetMintState) resetMintState.addEventListener("click", resetFailedMintState);
if (sweepAll) sweepAll.addEventListener("click", sweepAllCoh);
revokeFreeze.addEventListener("click", () => revokeAuthority(AuthorityType.FreezeAccount));
revokeMint.addEventListener("click", () => revokeAuthority(AuthorityType.MintTokens));
networkSelect.addEventListener("change", switchNetwork);
mainnetConfirm.addEventListener("input", refreshControls);

lockAll();
setMint(currentMint());

const p = provider();
if (p) {
  p.on?.("connect", publicKey => setConnected(publicKey.toString()));
  p.on?.("accountChanged", publicKey => {
    if (publicKey) setConnected(publicKey.toString());
    else {
      connectedWallet.textContent = "—";
      solBalance.textContent = "—";
      tokenBalance.textContent = "—";
      lockAll();
      setAlert("", "Wallet disconnected.");
    }
  });
}
