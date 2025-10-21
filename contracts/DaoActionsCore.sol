// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// Circom Groth16 verifier ABI (expects a,b,c + input[4])
interface ISemaphoreGroth16Verifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[4] memory input
    ) external view returns (bool);
}

contract DaoActions {
    ISemaphoreGroth16Verifier public verifier =
        ISemaphoreGroth16Verifier(0x10d37E4cc006C49a05e3D5919519E25b6DdD2aEf);

    event VoteAccepted(
        uint256 merkleRoot,
        uint256 nullifierHash,
        uint256 signalField,
        uint256 externalNullifier
    );

    /// NOTE: `signalField` must already be the field-encoded signal used in proof generation.
    function submitVote(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256 merkleRoot,
        uint256 nullifierHash,
        uint256 signalField,
        uint256 externalNullifier
    ) external {
        uint256[4] memory input = [
            merkleRoot,
            nullifierHash,
            signalField,
            externalNullifier
        ];

        require(verifier.verifyProof(a, b, c, input), "Invalid ZK proof");

        // TODO: your DAO logic here (store vote, tally, stake, etc.)
        emit VoteAccepted(merkleRoot, nullifierHash, signalField, externalNullifier);
    }
}
