// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ISemaphoreGroth16Verifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[4] memory input
    ) external view returns (bool);
}

contract DaoActionsZK {
    ISemaphoreGroth16Verifier public verifier =
        ISemaphoreGroth16Verifier(0x185112CB3C2140858ff77C5B33F11Be8343ae3fc); // NEW verifier

    event VoteAccepted(uint256 merkleRoot, uint256 nullifierHash, uint256 signalField, uint256 externalNullifier);

    function setVerifier(address v) external {  // optional but handy
        verifier = ISemaphoreGroth16Verifier(v);
    }

    function submitVote(
        uint256[2] calldata a,
        uint256[2][2] calldata b,      // remember: b must be transposed for Solidity
        uint256[2] calldata c,
        uint256 merkleRoot,
        uint256 nullifierHash,
        uint256 signalField,
        uint256 externalNullifier
    ) external {
        uint256[4] memory input = [merkleRoot, nullifierHash, signalField, externalNullifier];
        require(verifier.verifyProof(a, b, c, input), "Invalid ZK proof");
        emit VoteAccepted(merkleRoot, nullifierHash, signalField, externalNullifier);
    }
}
