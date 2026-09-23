// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title SignDAOVotingV2
/// @notice Hardened voting wrapper for the SignDAO hackathon prototype.
/// @dev
/// Security model:
/// - The official Semaphore contract owns proof verification, root validation and nullifier consumption.
/// - This contract is the admin of one append-only Semaphore group.
/// - The deployment admin may add members and create proposals, but cannot alter vote totals directly.
/// - A proof is bound to both its vote choice (message) and proposal (scope).
/// - msg.sender is deliberately NOT treated as voter identity, allowing relayed proof submission.
contract SignDAOVotingV2 {
    enum Choice {
        Invalid,
        Yes,
        No
    }

    struct Proposal {
        bytes32 metadataHash;
        uint64 startsAt;
        uint64 endsAt;
        uint256 yesVotes;
        uint256 noVotes;
        bool exists;
    }

    error Unauthorized();
    error ZeroAddress();
    error InvalidIdentityCommitment();
    error MemberAlreadyAdded(uint256 identityCommitment);
    error InvalidVotingWindow();
    error ProposalDoesNotExist(uint256 proposalId);
    error InvalidChoice();
    error VotingNotStarted(uint256 proposalId);
    error VotingEnded(uint256 proposalId);
    error ProofMessageMismatch(uint256 expected, uint256 actual);
    error ProofScopeMismatch(uint256 expected, uint256 actual);

    event MemberAdded(uint256 indexed identityCommitment);
    event ProposalCreated(
        uint256 indexed proposalId,
        bytes32 indexed metadataHash,
        uint64 startsAt,
        uint64 endsAt
    );
    event VoteCast(
        uint256 indexed proposalId,
        Choice indexed choice,
        uint256 indexed nullifier,
        address submitter
    );

    bytes32 public constant SCOPE_DOMAIN = keccak256("SignDAOVotingV2.vote");

    ISemaphore public immutable semaphore;
    address public immutable admin;
    uint256 public immutable groupId;

    uint256 public proposalCount;
    uint256 public memberCount;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => bool) public memberCommitments;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(ISemaphore semaphore_) {
        if (address(semaphore_) == address(0)) revert ZeroAddress();

        semaphore = semaphore_;
        admin = msg.sender;

        // The contract, not the deployer EOA, administers the Semaphore group.
        // Membership can therefore only change through the explicit onlyAdmin wrappers below.
        groupId = semaphore_.createGroup(address(this));
    }

    /// @notice Adds one Semaphore identity commitment to the SignDAO voting group.
    /// @dev Membership is intentionally append-only in V2 so historical-root validity cannot
    /// accidentally re-authorize a removed member.
    function addMember(uint256 identityCommitment) external onlyAdmin {
        _checkAndRecordMember(identityCommitment);
        semaphore.addMember(groupId, identityCommitment);

        emit MemberAdded(identityCommitment);
    }

    /// @notice Adds multiple identity commitments atomically.
    function addMembers(uint256[] calldata identityCommitments) external onlyAdmin {
        uint256 length = identityCommitments.length;

        for (uint256 i; i < length; ++i) {
            _checkAndRecordMember(identityCommitments[i]);
        }

        semaphore.addMembers(groupId, identityCommitments);

        for (uint256 i; i < length; ++i) {
            emit MemberAdded(identityCommitments[i]);
        }
    }

    /// @notice Creates a proposal with an explicit half-open voting window [startsAt, endsAt).
    function createProposal(
        bytes32 metadataHash,
        uint64 startsAt,
        uint64 endsAt
    ) external onlyAdmin returns (uint256 proposalId) {
        if (endsAt <= startsAt) revert InvalidVotingWindow();

        proposalId = ++proposalCount;
        proposals[proposalId] = Proposal({
            metadataHash: metadataHash,
            startsAt: startsAt,
            endsAt: endsAt,
            yesVotes: 0,
            noVotes: 0,
            exists: true
        });

        emit ProposalCreated(proposalId, metadataHash, startsAt, endsAt);
    }

    /// @notice Returns the exact Semaphore scope the frontend must use for a proposal proof.
    /// @dev Chain id + contract + group + proposal domain-separate nullifiers across deployments
    /// and allow one member to vote once per proposal rather than once per group forever.
    function scopeForProposal(uint256 proposalId) public view returns (uint256) {
        if (!proposals[proposalId].exists) revert ProposalDoesNotExist(proposalId);

        return uint256(
            keccak256(
                abi.encode(
                    SCOPE_DOMAIN,
                    block.chainid,
                    address(this),
                    groupId,
                    proposalId
                )
            )
        );
    }

    /// @notice Validates a Semaphore membership proof and counts a YES or NO vote.
    /// @dev Anyone may submit the transaction. Authorization comes from the ZK proof, not msg.sender.
    function castVote(
        uint256 proposalId,
        Choice choice,
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        Proposal storage proposal = proposals[proposalId];

        if (!proposal.exists) revert ProposalDoesNotExist(proposalId);
        if (choice != Choice.Yes && choice != Choice.No) revert InvalidChoice();

        if (block.timestamp < proposal.startsAt) revert VotingNotStarted(proposalId);
        if (block.timestamp >= proposal.endsAt) revert VotingEnded(proposalId);

        uint256 expectedMessage = uint256(choice);
        if (proof.message != expectedMessage) {
            revert ProofMessageMismatch(expectedMessage, proof.message);
        }

        uint256 expectedScope = scopeForProposal(proposalId);
        if (proof.scope != expectedScope) {
            revert ProofScopeMismatch(expectedScope, proof.scope);
        }

        // Semaphore validates group/root membership, verifies the Groth16 proof,
        // rejects an already-used nullifier, and consumes the nullifier atomically.
        semaphore.validateProof(groupId, proof);

        if (choice == Choice.Yes) {
            ++proposal.yesVotes;
        } else {
            ++proposal.noVotes;
        }

        emit VoteCast(proposalId, choice, proof.nullifier, msg.sender);
    }

    function _checkAndRecordMember(uint256 identityCommitment) private {
        if (identityCommitment == 0) revert InvalidIdentityCommitment();
        if (memberCommitments[identityCommitment]) {
            revert MemberAlreadyAdded(identityCommitment);
        }

        memberCommitments[identityCommitment] = true;
        ++memberCount;
    }
}
