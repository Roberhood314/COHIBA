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

async function refreshControls() {
  const p = provider();
  const connected = p?.publicKey?.toString();
  lockAll();
  if (!connected || connected !== AUTHORIZED_WALLET) return;

  verifyToken.disabled = false;
  launchToken.disabled = !mainnetArmed();

  if (currentMint()) {
    setMint(currentMint());
    await verifyOnChain(false);
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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = p.publicKey;
  tx.recentBlockhash = blockhash;
  if (extraSigner) tx.partialSign(extraSigner);

  setAlert("warn", `Preflight ${label}…`);
  await simulateBeforePhantom(tx, extraSigner);

  setAlert("ok", `Preflight PASS: ${label}. Confirm in Phantom.`);
  const signed = await p.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight:false,
    maxRetries:3
  });

  await connection.confirmTransaction(
    { signature:sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

async function requiredLamports() {
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, "confirmed");
  const ataRent = await connection.getMinimumBalanceForRentExemption(165, "confirmed");
  const buffer = isMainnet() ? 2_000_000 : 1_000_000;
  return { mintRent, total: mintRent + ataRent + buffer };
}

async function launch() {
  const p = provider();
  if (!p?.publicKey) return connectPhantom();

  const owner = p.publicKey.toString();
  if (owner !== AUTHORIZED_WALLET) return setConnected(owner);

  if (!mainnetArmed()) {
    setAlert("warn", "Type MAINNET COHIBA before creating the Mainnet token.");
    return;
  }

  if (isMainnet()) {
    const ok = confirm(
      "MAINNET: this spends real SOL and creates the real COH token. Continue to Phantom signing?"
    );
    if (!ok) return;
  }

  launchToken.disabled = true;

  try {
    const balance = await refreshBalance(owner);
    const { mintRent, total } = await requiredLamports();

    if (balance < total) {
      setAlert(
        "warn",
        `Insufficient ${isMainnet() ? "Mainnet" : "Devnet"} SOL. Have ${(balance/1e9).toFixed(6)} SOL; need about ${(total/1e9).toFixed(6)} SOL.`
      );
      return;
    }

    let mint = currentMint();

    if (!mint) {
      const mintKeypair = Keypair.generate();

      const createMintTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey:p.publicKey,
          newAccountPubkey:mintKeypair.publicKey,
          space:MINT_SIZE,
          lamports:mintRent,
          programId:TOKEN_PROGRAM_ID
        }),
        createInitializeMint2Instruction(
          mintKeypair.publicKey,
          DECIMALS,
          p.publicKey,
          p.publicKey,
          TOKEN_PROGRAM_ID
        )
      );

      await sendSimpleTransaction(
        createMintTx,
        mintKeypair,
        `Create COH mint on ${isMainnet() ? "Mainnet" : "Devnet"}`
      );

      mint = mintKeypair.publicKey.toBase58();
      setMint(mint);
    }

    const mintPk = new PublicKey(mint);
    const ata = await getAssociatedTokenAddress(
      mintPk,
      p.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const ataInfo = await connection.getAccountInfo(ata, "confirmed");
    if (!ataInfo) {
      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          p.publicKey,
          ata,
          p.publicKey,
          mintPk,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      await sendSimpleTransaction(createAtaTx, null, "Create your COH token account");
    }

    const infoBefore = await getMint(connection, mintPk, "confirmed", TOKEN_PROGRAM_ID);

    if (infoBefore.supply === 0n) {
      const mintTx = new Transaction().add(
        createMintToInstruction(
          mintPk,
          ata,
          p.publicKey,
          SUPPLY_BASE,
          [],
          TOKEN_PROGRAM_ID
        )
      );
      await sendSimpleTransaction(mintTx, null, "Mint 1,000,000,000 COH directly to your Phantom wallet");
    }

    await verifyOnChain(true);

  } catch (error) {
    setAlert("error", error?.message || "COH launch failed.");
  } finally {
    await refreshControls();
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
