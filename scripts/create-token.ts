import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, clusterApiUrl, type Cluster } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, getMint } from "@solana/spl-token";

const DECIMALS=9;
const TOTAL_SUPPLY_UI=1_000_000_000n;
const BASE_UNITS=TOTAL_SUPPLY_UI*10n**BigInt(DECIMALS);

function arg(name:string,fallback?:string){
  const i=process.argv.indexOf(`--${name}`);
  if(i>=0&&process.argv[i+1]) return process.argv[i+1];
  return fallback;
}
function loadKeypair(walletPath:string){
  const secret=JSON.parse(fs.readFileSync(path.resolve(walletPath),"utf8"));
  if(!Array.isArray(secret)) throw new Error("Wallet file must be a Solana JSON keypair array.");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

const network=arg("network","devnet") as Cluster|"mainnet-beta";
if(!["devnet","testnet","mainnet-beta"].includes(network)) throw new Error(`Unsupported network: ${network}`);
if(network==="mainnet-beta"&&process.env.ALLOW_MAINNET!=="true") throw new Error("Mainnet is safety-locked. Set ALLOW_MAINNET=true only after final review.");

const walletPath=process.env.SOLANA_WALLET_PATH;
if(!walletPath) throw new Error("Set SOLANA_WALLET_PATH to a dedicated Solana JSON keypair file.");

const payer=loadKeypair(walletPath);
const rpc=process.env.SOLANA_RPC_URL||clusterApiUrl(network as Cluster);
const connection=new Connection(rpc,"confirmed");

console.log(`Network: ${network}`);
console.log(`Payer: ${payer.publicKey.toBase58()}`);

const mint=await createMint(connection,payer,payer.publicKey,payer.publicKey,DECIMALS);
const treasury=await getOrCreateAssociatedTokenAccount(connection,payer,mint,payer.publicKey);
await mintTo(connection,payer,mint,treasury.address,payer,BASE_UNITS);

// Irreversible launch locks.
await setAuthority(connection,payer,mint,payer,AuthorityType.FreezeAccount,null);
await setAuthority(connection,payer,mint,payer,AuthorityType.MintTokens,null);

const info=await getMint(connection,mint);
if(info.supply!==BASE_UNITS) throw new Error(`Supply mismatch: ${info.supply.toString()}`);
if(info.mintAuthority!==null) throw new Error("Mint authority was not revoked.");
if(info.freezeAuthority!==null) throw new Error("Freeze authority was not revoked.");

console.log(JSON.stringify({
  mint:mint.toBase58(),
  treasuryAta:treasury.address.toBase58(),
  decimals:info.decimals,
  supply:TOTAL_SUPPLY_UI.toString(),
  mintAuthority:null,
  freezeAuthority:null
},null,2));
