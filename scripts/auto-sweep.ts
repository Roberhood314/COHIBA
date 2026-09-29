import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey, clusterApiUrl, type Cluster } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  transferChecked
} from "@solana/spl-token";

function arg(name:string,fallback?:string){
  const i=process.argv.indexOf(`--${name}`);
  if(i>=0&&process.argv[i+1]) return process.argv[i+1];
  return fallback;
}

function loadSystemSigner(){
  const inline=process.env.SYSTEM_WALLET_SECRET_JSON;
  if(inline){
    const secret=JSON.parse(inline);
    if(!Array.isArray(secret)) throw new Error("SYSTEM_WALLET_SECRET_JSON must be a Solana keypair JSON array.");
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }

  const walletPath=process.env.SOLANA_WALLET_PATH;
  if(!walletPath) throw new Error("Set SYSTEM_WALLET_SECRET_JSON or SOLANA_WALLET_PATH for the system treasury signer.");
  const secret=JSON.parse(fs.readFileSync(path.resolve(walletPath),"utf8"));
  if(!Array.isArray(secret)) throw new Error("Wallet file must be a Solana keypair JSON array.");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

const network=arg("network",process.env.SOLANA_NETWORK||"devnet") as Cluster|"mainnet-beta";
if(!["devnet","mainnet-beta"].includes(network)) throw new Error(`Unsupported network: ${network}`);

if(process.env.AUTO_SWEEP_ENABLED!=="true"){
  console.log(JSON.stringify({status:"DISABLED",message:"Auto-sweep is safely disabled."}));
  process.exit(0);
}
if(network==="mainnet-beta"&&process.env.ALLOW_MAINNET!=="true"){
  throw new Error("Mainnet auto-sweep is safety-locked. Set ALLOW_MAINNET=true only after release approval.");
}

const mintAddress=arg("mint")||process.env.COH_MINT;
if(!mintAddress) throw new Error("Set COH_MINT or pass --mint <ADDRESS>.");

const destinationAddress=
  process.env.COH_DESTINATION_WALLET ||
  "pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t";

const signer=loadSystemSigner();
const mintPk=new PublicKey(mintAddress);
const destinationOwner=new PublicKey(destinationAddress);
const rpc=process.env.SOLANA_RPC_URL||clusterApiUrl(network as Cluster);
const connection=new Connection(rpc,"confirmed");

const mint=await getMint(connection,mintPk);
const sourceAta=await getAssociatedTokenAddress(mintPk,signer.publicKey);

let source;
try{
  source=await getAccount(connection,sourceAta);
}catch{
  console.log(JSON.stringify({
    status:"NO_SOURCE_TOKEN_ACCOUNT",
    network,
    mint:mintAddress,
    sourceOwner:signer.publicKey.toBase58(),
    sourceAta:sourceAta.toBase58(),
    destinationOwner:destinationOwner.toBase58()
  },null,2));
  process.exit(0);
}

if(source.amount===0n){
  console.log(JSON.stringify({
    status:"NOTHING_TO_SWEEP",
    network,
    mint:mintAddress,
    sourceOwner:signer.publicKey.toBase58(),
    sourceAta:sourceAta.toBase58(),
    destinationOwner:destinationOwner.toBase58()
  },null,2));
  process.exit(0);
}

const destinationAta=await getOrCreateAssociatedTokenAccount(
  connection,
  signer,
  mintPk,
  destinationOwner
);

const beforeDestination=destinationAta.amount;
const amount=source.amount;

const signature=await transferChecked(
  connection,
  signer,
  sourceAta,
  mintPk,
  destinationAta.address,
  signer,
  amount,
  mint.decimals
);

const sourceAfter=await getAccount(connection,sourceAta);
const destinationAfter=await getAccount(connection,destinationAta.address);

if(sourceAfter.amount!==0n){
  throw new Error(`Auto-sweep verification failed: source still has ${sourceAfter.amount.toString()} base units.`);
}
if(destinationAfter.amount!==beforeDestination+amount){
  throw new Error("Auto-sweep verification failed: destination balance did not increase by expected amount.");
}

console.log(JSON.stringify({
  status:"SWEEPED",
  network,
  mint:mintAddress,
  decimals:mint.decimals,
  sourceOwner:signer.publicKey.toBase58(),
  sourceAta:sourceAta.toBase58(),
  destinationOwner:destinationOwner.toBase58(),
  destinationAta:destinationAta.address.toBase58(),
  sweptBaseUnits:amount.toString(),
  destinationBalanceBaseUnits:destinationAfter.amount.toString(),
  signature
},null,2));
