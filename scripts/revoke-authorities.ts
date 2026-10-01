import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey, clusterApiUrl, type Cluster } from "@solana/web3.js";
import { AuthorityType, getMint, setAuthority } from "@solana/spl-token";

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
if(network==="mainnet-beta"){
  if(process.env.ALLOW_MAINNET!=="true") throw new Error("Mainnet is safety-locked.");
  if(process.env.COHIBA_MAINNET_OWNER_APPROVAL!=="APPROVE MAINNET COHIBA") throw new Error("Mainnet owner approval is not present.");
}
if(process.env.CONFIRM_IRREVERSIBLE_REVOKE!=="I_UNDERSTAND"){
  throw new Error("Authority revocation is irreversible. Set CONFIRM_IRREVERSIBLE_REVOKE=I_UNDERSTAND.");
}

const mintAddress=arg("mint")||process.env.COH_MINT;
if(!mintAddress) throw new Error("Pass --mint <ADDRESS> or set COH_MINT.");

const walletPath=process.env.SOLANA_WALLET_PATH;
if(!walletPath) throw new Error("Set SOLANA_WALLET_PATH to the current authority signer keypair file.");

const signer=loadKeypair(walletPath);
const rpc=process.env.SOLANA_RPC_URL||clusterApiUrl(network as Cluster);
const connection=new Connection(rpc,"confirmed");
const mintPk=new PublicKey(mintAddress);

const before=await getMint(connection,mintPk);
if(!before.mintAuthority?.equals(signer.publicKey)) throw new Error("Signer is not the current mint authority.");
if(!before.freezeAuthority?.equals(signer.publicKey)) throw new Error("Signer is not the current freeze authority.");

await setAuthority(connection,signer,mintPk,signer,AuthorityType.FreezeAccount,null);
await setAuthority(connection,signer,mintPk,signer,AuthorityType.MintTokens,null);

const after=await getMint(connection,mintPk);
if(after.mintAuthority!==null) throw new Error("Mint authority was not revoked.");
if(after.freezeAuthority!==null) throw new Error("Freeze authority was not revoked.");

console.log(JSON.stringify({
  mint: mintAddress,
  network,
  supplyBaseUnits: after.supply.toString(),
  decimals: after.decimals,
  mintAuthority: null,
  freezeAuthority: null,
  releaseStage: "AUTHORITIES_REVOKED"
},null,2));
