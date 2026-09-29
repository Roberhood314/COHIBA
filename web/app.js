const AUTHORIZED_WALLET = "pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t";

const connectBtn = document.getElementById("connectWallet");
const walletAlert = document.getElementById("walletAlert");
const connectedWallet = document.getElementById("connectedWallet");
const prepareDevnet = document.getElementById("prepareDevnet");
const verifyToken = document.getElementById("verifyToken");
const revokeFreeze = document.getElementById("revokeFreeze");
const revokeMint = document.getElementById("revokeMint");

function provider() {
  return window.phantom?.solana?.isPhantom ? window.phantom.solana : null;
}

function short(address) {
  return address ? `${address.slice(0,6)}…${address.slice(-6)}` : "—";
}

function lockReleaseControls() {
  prepareDevnet.disabled = true;
  verifyToken.disabled = true;
  revokeFreeze.disabled = true;
  revokeMint.disabled = true;
}

function setConnected(address) {
  connectedWallet.textContent = address;
  if (address !== AUTHORIZED_WALLET) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = `Unauthorized wallet connected: ${short(address)}. Switch Phantom to the COHIBA developer wallet.`;
    lockReleaseControls();
    return;
  }
  walletAlert.className = "wallet-alert ok";
  walletAlert.textContent = "Authorized COHIBA developer wallet connected.";
  prepareDevnet.disabled = false;
  verifyToken.disabled = false;
}

async function connectPhantom() {
  const p = provider();
  if (!p) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = "Phantom extension not detected. Install/unlock Phantom on this PC and reload the page.";
    window.open("https://phantom.com/download", "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const response = await p.connect();
    setConnected(response.publicKey.toString());
  } catch (error) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = error?.message || "Wallet connection cancelled.";
  }
}

async function verifyOwnership() {
  const p = provider();
  if (!p?.publicKey) return connectPhantom();
  const address = p.publicKey.toString();
  if (address !== AUTHORIZED_WALLET) return setConnected(address);
  if (!p.signMessage) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = "This Phantom provider does not expose message signing.";
    return;
  }
  try {
    const nonce = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const message = new TextEncoder().encode(`COHIBA developer verification\nWallet: ${address}\nNonce: ${nonce}`);
    await p.signMessage(message, "utf8");
    walletAlert.className = "wallet-alert ok";
    walletAlert.textContent = "Wallet ownership signature verified locally. No private key left Phantom.";
  } catch (error) {
    walletAlert.className = "wallet-alert error";
    walletAlert.textContent = error?.message || "Signature request cancelled.";
  }
}

connectBtn.addEventListener("click", connectPhantom);
verifyToken.addEventListener("click", verifyOwnership);

prepareDevnet.addEventListener("click", () => {
  walletAlert.className = "wallet-alert warn";
  walletAlert.textContent = "Developer wallet verified. Devnet token release remains gated until the public Devnet mint transaction is prepared and funded.";
});

revokeFreeze.addEventListener("click", () => {
  alert("Freeze authority revocation is irreversible. This control remains locked until a verified public mint exists.");
});
revokeMint.addEventListener("click", () => {
  alert("Mint authority revocation is irreversible. This control remains locked until supply and treasury are verified on-chain.");
});

lockReleaseControls();

const p = provider();
if (p) {
  p.on?.("connect", publicKey => setConnected(publicKey.toString()));
  p.on?.("accountChanged", publicKey => {
    if (publicKey) setConnected(publicKey.toString());
    else {
      connectedWallet.textContent = "—";
      walletAlert.className = "wallet-alert";
      walletAlert.textContent = "Wallet disconnected.";
      lockReleaseControls();
    }
  });
}
