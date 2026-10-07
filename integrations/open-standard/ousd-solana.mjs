import { PublicKey } from '@solana/web3.js';
import { unpackMint, getTransferHook, getTransferFeeConfig, getPausableConfig, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const OPEN_USD_SOLANA_MINT = 'ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB';
export const OPEN_USD_SOURCE = 'https://joinopenstandard.com/integrate';

/**
 * Read-only mainnet mint inspection. No wallet, signing, mint/burn or transfer.
 * Caller must supply a trusted mainnet connection; symbol alone is not identity.
 */
export async function inspectOpenUsdSolana(connection) {
  const expectedGenesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  const address = new PublicKey(OPEN_USD_SOLANA_MINT);
  const [genesis, account] = await Promise.all([connection.getGenesisHash(), connection.getAccountInfo(address, 'finalized')]);
  if (genesis !== expectedGenesis) throw new Error('OUSD_SOLANA_MAINNET_REQUIRED');
  if (!account) throw new Error('OUSD_MINT_NOT_FOUND');
  const program = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].find(p => account.owner.equals(p));
  if (!program) throw new Error('OUSD_UNSUPPORTED_TOKEN_PROGRAM');
  const mint = unpackMint(address, account, program);
  return {
    asset: 'Open USD', symbol: 'OUSD', network: 'solana-mainnet',
    mint: address.toBase58(), tokenProgram: program.toBase58(),
    decimals: mint.decimals,
    paused: Boolean(getPausableConfig(mint)?.paused),
    transferHook: getTransferHook(mint)?.programId?.toBase58() ?? null,
    transferFeeConfigured: Boolean(getTransferFeeConfig(mint)),
    supplyBaseUnits: mint.supply.toString(),
    mintAuthority: mint.mintAuthority?.toBase58() ?? null,
    freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
    source: OPEN_USD_SOURCE,
    executionAuthorized: false,
    providerConnected: false
  };
}

