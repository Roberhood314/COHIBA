import fs from 'node:fs';
import path from 'node:path';
import {
  AbiCoder,
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  TypedDataEncoder,
  Wallet,
  getBytes,
  keccak256,
  toUtf8Bytes
} from 'ethers';
import { compile, entryArtifact } from '../test/runtime.mjs';
import {
  containedCall,
  delegationTypes,
  domain,
  operation,
  revocationTypes,
  signOperation,
  sinkInterface,
  userOpHash
} from '../adapter.mjs';

export const SEPOLIA_CHAIN_ID = 11155111n;
export const ENTRYPOINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
export const PUBLIC_TESTNET_EVIDENCE_VERSION = 'HS_ERC4337_SEPOLIA_EVIDENCE_1';

export function assertSepoliaConfig({ chainId, entryPoint = ENTRYPOINT_V07 } = {}) {
  if (BigInt(chainId) !== SEPOLIA_CHAIN_ID) throw new Error('SEPOLIA_ONLY');
  if (entryPoint.toLowerCase() !== ENTRYPOINT_V07.toLowerCase()) throw new Error('ENTRYPOINT_V07_REQUIRED');
  return true;
}

export function sanitizeEvidence(value) {
  const forbidden = /private.?key|mnemonic|seed|rpc.?url|authorization|api.?key/i;
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !forbidden.test(key))
      .map(([key, item]) => [key, sanitizeEvidence(item)]));
  }
  return value;
}

async function expectCallReject(provider, tx) {
  try {
    await provider.call(tx);
    return false;
  } catch {
    return true;
  }
}

export async function runSepoliaEvidence({
  rpcUrl = process.env.SEPOLIA_RPC_URL,
  deployerPrivateKey = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY,
  output = path.resolve(import.meta.dirname, '../evidence/sepolia.json')
} = {}) {
  if (!rpcUrl || !deployerPrivateKey) throw new Error('SEPOLIA_TEST_CREDENTIALS_REQUIRED');

  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  assertSepoliaConfig({ chainId: network.chainId });

  const entryCode = await provider.getCode(ENTRYPOINT_V07);
  if (entryCode === '0x') throw new Error('ENTRYPOINT_V07_NOT_DEPLOYED');

  const deployer = new Wallet(deployerPrivateKey, provider);
  const human = Wallet.createRandom();
  const agent = Wallet.createRandom();
  const built = compile();

  const sinkFactory = new ContractFactory(built.sink.abi, '0x' + built.sink.evm.bytecode.object, deployer);
  const sink = await sinkFactory.deploy();
  await sink.waitForDeployment();

  const accountFactory = new ContractFactory(built.account.abi, '0x' + built.account.evm.bytecode.object, deployer);
  const account = await accountFactory.deploy(human.address, ENTRYPOINT_V07, await sink.getAddress());
  await account.waitForDeployment();

  const accountAddress = await account.getAddress();
  const sinkAddress = await sink.getAddress();
  const entry = new Contract(ENTRYPOINT_V07, entryArtifact.abi, deployer);

  // Testnet-only prefund. The harness refuses every chain except Sepolia.
  const prefund = 20_000_000_000_000_000n;
  const funding = await deployer.sendTransaction({ to: accountAddress, value: prefund });
  await funding.wait();

  const latest = await provider.getBlock('latest');
  const now = BigInt(latest.timestamp);
  const resource = keccak256(toUtf8Bytes('cohiba:sepolia:synthetic-effect'));
  const grant = {
    agent: agent.address,
    target: sinkAddress,
    selector: sinkInterface.getFunction('commit').selector,
    resource,
    maxCalls: 2n,
    gasBudget: prefund,
    validAfter: now - 5n,
    validUntil: now + 1800n,
    epoch: 0n,
    salt: keccak256(toUtf8Bytes('cohiba-sepolia-e2e-v0.1')),
    entryPoint: ENTRYPOINT_V07
  };
  const humanSignature = await human.signTypedData(
    domain(SEPOLIA_CHAIN_ID, accountAddress),
    delegationTypes,
    grant
  );
  const delegationId = TypedDataEncoder.hash(
    domain(SEPOLIA_CHAIN_ID, accountAddress),
    delegationTypes,
    grant
  );

  const nonce = await entry.getNonce(accountAddress, 0);
  const make = async (text, nonceValue = nonce) => {
    const base = operation({
      sender: accountAddress,
      nonce: nonceValue,
      callData: containedCall(grant, humanSignature, toUtf8Bytes(text))
    });
    return signOperation(base, agent, ENTRYPOINT_V07, SEPOLIA_CHAIN_ID);
  };

  const op = await make('synthetic public-testnet effect');
  const onchainHash = await entry.getUserOpHash(op);
  const localHash = userOpHash(op, ENTRYPOINT_V07, SEPOLIA_CHAIN_ID);
  if (onchainHash.toLowerCase() !== localHash.toLowerCase()) throw new Error('USEROP_HASH_MISMATCH');

  const entryInterface = new Interface(entryArtifact.abi);
  const validData = entryInterface.encodeFunctionData('handleOps', [[op], deployer.address]);

  // Pre-broadcast revalidation against current Sepolia state.
  await provider.call({ from: deployer.address, to: ENTRYPOINT_V07, data: validData });

  const validTx = await deployer.sendTransaction({
    to: ENTRYPOINT_V07,
    data: validData,
    gasLimit: 5_000_000n
  });
  const validReceipt = await validTx.wait();
  const effectCount = await sink.effectCount(accountAddress);
  if (effectCount !== 1n) throw new Error('EXPECTED_ONE_EFFECT');

  // Replay is rejected by the canonical EntryPoint nonce after the committed effect.
  const replayRejected = await expectCallReject(provider, {
    from: deployer.address,
    to: ENTRYPOINT_V07,
    data: validData
  });

  // Payload mutation after the agent signature is rejected before another effect.
  const decoded = AbiCoder.defaultAbiCoder().decode(
    ['tuple(address agent,address target,bytes4 selector,bytes32 resource,uint256 maxCalls,uint256 gasBudget,uint48 validAfter,uint48 validUntil,uint256 epoch,bytes32 salt,address entryPoint)', 'bytes', 'bytes'],
    '0x' + op.callData.slice(10)
  );
  const mutatedCallData = op.callData.slice(0, 10) + AbiCoder.defaultAbiCoder().encode(
    ['tuple(address agent,address target,bytes4 selector,bytes32 resource,uint256 maxCalls,uint256 gasBudget,uint48 validAfter,uint48 validUntil,uint256 epoch,bytes32 salt,address entryPoint)', 'bytes', 'bytes'],
    [decoded[0], decoded[1], sinkInterface.encodeFunctionData('commit', [resource, toUtf8Bytes('mutated')])]
  ).slice(2);
  const mutated = { ...op, nonce: nonce + 1n, callData: mutatedCallData };
  const mutationRejected = await expectCallReject(provider, {
    from: deployer.address,
    to: ENTRYPOINT_V07,
    data: entryInterface.encodeFunctionData('handleOps', [[mutated], deployer.address])
  });

  // Permissionlessly relay a human-signed revocation, then prove the old grant cannot authorize a fresh nonce.
  const revokeSig = await human.signTypedData(
    domain(SEPOLIA_CHAIN_ID, accountAddress),
    revocationTypes,
    { delegationId, epoch: 0n }
  );
  const revokeTx = await account.connect(deployer).revokeWithSignature(delegationId, revokeSig);
  const revokeReceipt = await revokeTx.wait();
  const afterRevoke = await make('must be denied after revoke', nonce + 1n);
  const revokeRejected = await expectCallReject(provider, {
    from: deployer.address,
    to: ENTRYPOINT_V07,
    data: entryInterface.encodeFunctionData('handleOps', [[afterRevoke], deployer.address])
  });

  const finalEffectCount = await sink.effectCount(accountAddress);
  if (finalEffectCount !== 1n || !replayRejected || !mutationRejected || !revokeRejected) {
    throw new Error('SEPOLIA_ADVERSARIAL_EVIDENCE_INCOMPLETE');
  }

  const evidence = sanitizeEvidence({
    version: PUBLIC_TESTNET_EVIDENCE_VERSION,
    scope: 'ETHEREUM_SEPOLIA_ENTRYPOINT_V0_7_DIRECT_HANDLEOPS',
    publicNetwork: true,
    chainId: Number(SEPOLIA_CHAIN_ID),
    entryPoint: ENTRYPOINT_V07,
    bundlerRpcVerified: false,
    independentIntegration: false,
    productionReady: false,
    account: accountAddress,
    sink: sinkAddress,
    validUserOpHash: onchainHash,
    transactions: {
      funding: funding.hash,
      validEffect: validReceipt.hash,
      revocation: revokeReceipt.hash
    },
    observations: {
      exactEffectCommitted: true,
      effectCount: finalEffectCount.toString(),
      replayRejected,
      postSignatureMutationRejected: mutationRejected,
      humanSignedRevocationRejectedFreshEffect: revokeRejected,
      onchainAndLocalUserOpHashMatch: true
    }
  });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const evidence = await runSepoliaEvidence();
  console.log(JSON.stringify(evidence, null, 2));
}
