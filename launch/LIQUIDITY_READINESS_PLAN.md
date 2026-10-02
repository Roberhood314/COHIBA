# COHIBA Liquidity Readiness Plan v1.0

## Status
**PREPARED — NOT APPROVED FOR ACTIVATION**

## Preconditions
No liquidity pool may be created until:
- independent audit gate is complete;
- legal release gate is complete;
- treasury multisig is active/tested;
- canonical Mainnet mint exists and is verified;
- mint/freeze authorities are verified revoked;
- explicit owner Mainnet authorization exists.

## Required launch record
Before pool creation, record:
- venue/DEX;
- canonical pair;
- initial asset amounts;
- source of liquidity;
- LP custody/lock/burn policy;
- slippage/price-impact assumptions;
- prohibited actions: wash trading, circular treasury volume, fake liquidity, undisclosed market support.

## Integrity rules
- no fake volume;
- no synthetic holder counts;
- no hidden mint authority;
- no claim of liquidity before on-chain pool evidence exists;
- any market-making arrangement must be disclosed and legally reviewed.

## Activation state
Preparation can be completed internally. Actual approval/activation remains a separate Mainnet gate.
