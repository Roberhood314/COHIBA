# COHIBA Mainnet, Liquidity & Organic Market Evidence Standard v1.0

## Status
**PRE-MAINNET — MAINNET EXECUTION NOT AUTHORIZED IN THIS DOCUMENT**

This document prepares the irreversible phase but does not authorize it.

## Mainnet prerequisite gates
- production commit frozen;
- verification/security CI green;
- independent security review completed;
- high/critical findings closed or documented;
- legal/compliance release review completed;
- canonical metadata reachable;
- signer verified and minimally funded;
- backup/restore drill completed;
- launch evidence capture ready;
- explicit final owner approval;
- Mainnet gate enabled only during approved release window.

## Launch evidence bundle
Capture:
- release commit SHA;
- evidence-manifest SHA-256;
- timestamp;
- signer public key;
- destination wallet;
- mint address;
- metadata PDA;
- mint creation signature;
- mint-to signature;
- freeze-authority revoke signature;
- mint-authority revoke signature;
- final supply;
- destination balance;
- explorer links;
- independent RPC verification;
- final `LOCKED_VERIFIED` record hash.

## Liquidity readiness
Before seeding a pool, publish an approved liquidity plan containing:
- venue;
- pair;
- starting token amount;
- paired asset amount;
- source of paired asset;
- LP custody;
- LP lock/burn policy if any;
- price-impact test sizes;
- treasury exposure limit;
- emergency/incident procedure;
- who can modify/remove liquidity.

No opening price or future market-cap promise should be presented as an expected return.

## Organic market evidence
The first market-evidence period should capture:
- pool address;
- pool age;
- reserve balances;
- unique traders where available;
- swap count;
- buy/sell distribution;
- volume source;
- price impact/slippage;
- liquidity changes;
- holder count from public sources;
- concentration of top token accounts;
- referral sources;
- evidence timestamp/provider.

## Integrity exclusions
Do not count:
- wash trades;
- founder/team circular trades intended to simulate demand;
- self-trading;
- fake holders;
- bot-generated volume represented as organic;
- undisclosed paid market-making represented as organic community demand.

## CMC/CoinGecko readiness
CMC currently expects, among other factors, a functional website/explorer and real public trading on an eligible market with material activity; CoinGecko evaluates liquidity, project/team presence, maturity and organic attention.

Tracked-listing requests should occur only after live evidence exists.

## Current blockers
- explicit Mainnet owner authorization: NOT PRESENT;
- independent external audit: NOT COMPLETED;
- external legal clearance: NOT COMPLETED;
- live pool: DOES NOT EXIST;
- organic market activity: DOES NOT EXIST.

These blockers are intentional and must not be bypassed.
