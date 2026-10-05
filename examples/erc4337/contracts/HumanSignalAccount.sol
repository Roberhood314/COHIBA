// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {IAccountExecute} from "@account-abstraction/contracts/interfaces/IAccountExecute.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IDraftSink { function commit(bytes32 resource, bytes calldata text) external; }

/// @notice EXPERIMENTAL: fixed-effect ERC-4337 v0.7 reference account, not a general wallet.
/// Human means the configured owner key; no proof of personhood is inferred on-chain.
contract HumanSignalAccount is IAccount, IAccountExecute, EIP712 {
    struct Delegation {
        address agent;
        address target;
        bytes4 selector;
        bytes32 resource;
        uint256 maxCalls;
        uint256 gasBudget;
        uint48 validAfter;
        uint48 validUntil;
        uint256 epoch;
        bytes32 salt;
        address entryPoint;
    }
    bytes32 public constant DELEGATION_TYPEHASH = keccak256("Delegation(address agent,address target,bytes4 selector,bytes32 resource,uint256 maxCalls,uint256 gasBudget,uint48 validAfter,uint48 validUntil,uint256 epoch,bytes32 salt,address entryPoint)");
    bytes32 public constant REVOCATION_TYPEHASH = keccak256("Revocation(bytes32 delegationId,uint256 epoch)");
    address public immutable owner;
    address public immutable entryPoint;
    address public immutable target;
    bytes32 public immutable targetCodeHash;
    uint256 public authorityEpoch;
    mapping(bytes32 => bool) public revoked;
    mapping(bytes32 => uint256) public usedCalls;
    mapping(bytes32 => uint256) public reservedGasCost;
    mapping(bytes32 => bytes32) private admitted;
    bool private executing;
    event DelegationRevoked(bytes32 indexed delegationId);
    event AuthorityEpochChanged(uint256 epoch);
    event ContainedEffect(bytes32 indexed operationHash, bytes32 indexed delegationId, bytes32 resource, bytes32 payloadHash);

    constructor(address humanOwner, address trustedEntryPoint, address fixedTarget) EIP712("HumanSignalERC4337", "1") {
        require(humanOwner != address(0) && trustedEntryPoint.code.length > 0 && fixedTarget.code.length > 0, "CONFIG");
        owner = humanOwner; entryPoint = trustedEntryPoint; target = fixedTarget; targetCodeHash = fixedTarget.codehash;
    }
    receive() external payable {}
    modifier onlyEntryPoint() { require(msg.sender == entryPoint, "ENTRY_POINT"); _; }
    function delegationId(Delegation memory d) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(DELEGATION_TYPEHASH,d.agent,d.target,d.selector,d.resource,d.maxCalls,d.gasBudget,d.validAfter,d.validUntil,d.epoch,d.salt,d.entryPoint)));
    }
    function _signedBy(bytes32 digest, bytes memory signature, address signer) private pure returns (bool) {
        (address recovered,ECDSA.RecoverError error,) = ECDSA.tryRecover(digest,signature);
        return error == ECDSA.RecoverError.NoError && recovered == signer && signer != address(0);
    }
    function _revocationDigest(bytes32 id) private view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(REVOCATION_TYPEHASH,id,authorityEpoch)));
    }
    function revokeGrant(bytes32 id) external { require(msg.sender == owner, "OWNER"); _revoke(id); }
    function revokeWithSignature(bytes32 id, bytes calldata humanSignature) external {
        require(_signedBy(_revocationDigest(id),humanSignature,owner), "HUMAN_SIGNATURE"); _revoke(id);
    }
    function _revoke(bytes32 id) private { revoked[id] = true; emit DelegationRevoked(id); }
    function invalidateEpoch() external { require(msg.sender == owner, "OWNER"); authorityEpoch++; emit AuthorityEpochChanged(authorityEpoch); }

    function _intent(PackedUserOperation calldata op) private view returns (Delegation memory d, bytes32 id, bytes memory text, bool humanValid) {
        require(op.sender == address(this) && op.initCode.length == 0 && op.paymasterAndData.length == 0, "PROFILE");
        require(op.callData.length >= 4 && op.callData.length <= 8192 && bytes4(op.callData[:4]) == this.executeUserOp.selector, "ADAPTER");
        bytes memory humanSignature; bytes memory data;
        (d,humanSignature,data) = abi.decode(op.callData[4:],(Delegation,bytes,bytes));
        require(keccak256(op.callData) == keccak256(abi.encodePacked(this.executeUserOp.selector,abi.encode(d,humanSignature,data))), "CANONICAL_INTENT");
        require(d.agent != address(0) && d.agent != owner && d.entryPoint == entryPoint && d.target == target && d.selector == IDraftSink.commit.selector, "SCOPE");
        require(d.epoch == authorityEpoch && d.maxCalls > 0 && d.gasBudget > 0 && d.validUntil > d.validAfter, "AUTHORITY");
        require(data.length >= 4 && data.length <= 6116 && bytes4(data) == d.selector, "EFFECT_SELECTOR");
        bytes32 resource;
        // bytes slicing requires calldata: decode the body after copying the selector away.
        bytes memory body = new bytes(data.length - 4);
        assembly ("memory-safe") {
            let source := add(data,36)
            let destination := add(body,32)
            let end := add(destination,mload(body))
            for {} lt(destination,end) { destination := add(destination,32) source := add(source,32) } {
                mstore(destination,mload(source))
            }
        }
        (resource,text) = abi.decode(body,(bytes32,bytes));
        require(resource == d.resource && text.length > 0 && text.length <= 6000, "EFFECT_RESOURCE");
        require(keccak256(data) == keccak256(abi.encodeCall(IDraftSink.commit,(resource,text))), "CANONICAL_EFFECT");
        id = delegationId(d);
        require(!revoked[id] && usedCalls[id] < d.maxCalls, "REVOKED_OR_EXHAUSTED");
        humanValid = _signedBy(id,humanSignature,owner);
    }
    function validateUserOp(PackedUserOperation calldata op, bytes32 opHash, uint256 missingAccountFunds) external onlyEntryPoint returns (uint256 validationData) {
        bool valid;
        if(op.callData.length >= 4 && bytes4(op.callData[:4]) == this.revokeWithSignature.selector) {
            require(op.sender == address(this) && op.initCode.length == 0 && op.paymasterAndData.length == 0, "PROFILE");
            (bytes32 id,bytes memory signature) = abi.decode(op.callData[4:],(bytes32,bytes));
            require(keccak256(op.callData) == keccak256(abi.encodeCall(this.revokeWithSignature,(id,signature))), "CANONICAL_REVOCATION");
            valid = _signedBy(_revocationDigest(id),signature,owner) && _signedBy(MessageHashUtils.toEthSignedMessageHash(opHash),op.signature,owner);
        } else {
            (Delegation memory d,bytes32 id,,bool humanValid) = _intent(op);
            valid = humanValid && _signedBy(MessageHashUtils.toEthSignedMessageHash(opHash),op.signature,d.agent);
            validationData = uint256(d.validUntil) << 160 | uint256(d.validAfter) << 208;
            if(valid) {
                uint256 gasLimit = uint128(uint256(op.accountGasLimits)) + uint256(uint128(uint256(op.accountGasLimits) >> 128)) + op.preVerificationGas;
                uint256 maxCost = gasLimit * uint128(uint256(op.gasFees));
                require(reservedGasCost[id] <= d.gasBudget && maxCost <= d.gasBudget - reservedGasCost[id], "GAS_BUDGET");
                require(admitted[opHash] == bytes32(0), "OPERATION_REPLAY");
                reservedGasCost[id] += maxCost; admitted[opHash] = id;
            }
        }
        if(missingAccountFunds > 0) { (bool paid,) = payable(entryPoint).call{value:missingAccountFunds}(""); paid; }
        if(!valid) validationData |= 1;
    }
    function executeUserOp(PackedUserOperation calldata op, bytes32 opHash) external onlyEntryPoint {
        require(!executing, "REENTRANCY"); executing = true;
        (Delegation memory d,bytes32 id,bytes memory text,bool humanValid) = _intent(op);
        require(humanValid && _signedBy(MessageHashUtils.toEthSignedMessageHash(opHash),op.signature,d.agent), "SIGNATURE");
        require(admitted[opHash] == id, "NOT_ADMITTED");
        require(block.timestamp >= d.validAfter && block.timestamp < d.validUntil, "EXPIRED_AT_EXECUTION");
        require(target.codehash == targetCodeHash, "TARGET_CODE_CHANGED");
        delete admitted[opHash]; usedCalls[id]++;
        IDraftSink(target).commit(d.resource,text); // one fixed CALL; no value, delegatecall, batch or arbitrary target
        emit ContainedEffect(opHash,id,d.resource,keccak256(text));
        executing = false;
    }
}
