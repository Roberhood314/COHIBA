import { Connection, PublicKey, clusterApiUrl, type Cluster } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

function arg(name:string,fallback?:string){
  const i=process.argv.indexOf(`--${name}`);
  if(i>=0&&process.argv[i+1]) return process.argv[i+1];
  return fallback;
}
const network=arg("network","devnet") as Cluster|"mainnet-beta";
const mintAddress=arg("mint")||process.env.COH_MINT;
if(!mintAddress) throw new Error("Pass --mint <ADDRESS> or set COH_MINT.");
const rpc=process.env.SOLANA_RPC_URL||clusterApiUrl(network as Cluster);
const connection=new Connection(rpc,"confirmed");
const mint=await getMint(connection,new PublicKey(mintAddress));
const scale=10n**BigInt(mint.decimals);
const whole=mint.supply/scale;
const fraction=mint.supply%scale;
console.log(JSON.stringify({
  mint:mintAddress,network,decimals:mint.decimals,
  baseUnitSupply:mint.supply.toString(),
  uiSupply:fraction===0n?whole.toString():`${whole}.${fraction.toString().padStart(mint.decimals,"0")}`,
  mintAuthority:mint.mintAuthority?.toBase58()??null,
  freezeAuthority:mint.freezeAuthority?.toBase58()??null,
  authoritiesRevoked:mint.mintAuthority===null&&mint.freezeAuthority===null
},null,2));
