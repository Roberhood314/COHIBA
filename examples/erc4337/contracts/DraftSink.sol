// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;
/// @notice Synthetic effect sink. Payload is public on-chain; use no identity or sensitive drafts.
contract DraftSink {
    mapping(address => mapping(bytes32 => bytes32)) public payloadHashes;
    mapping(address => uint256) public effectCount;
    function commit(bytes32 resource, bytes calldata text) external {
        require(text.length > 0 && text.length <= 6000, "BYTES");
        require(keccak256(text) != keccak256(bytes("INJECT_FAILURE")), "INJECTED_FAILURE");
        payloadHashes[msg.sender][resource] = keccak256(text);
        effectCount[msg.sender]++;
    }
}
