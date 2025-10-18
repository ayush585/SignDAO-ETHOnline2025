// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DaoActions - tiny multi-action demo (stake/propose)
/// @notice "stake" accepts ETH and tracks balances; "propose" stores a short memo.
/// @dev Uses a generic performAction to keep your UX simple.
contract DaoActions {
    mapping(address => uint256) public stakes;
    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount);
    event Proposed(address indexed user, uint256 id, string memo);

    uint256 public proposalCount;
    mapping(uint256 => string) public proposals;

    /// @notice Generic entrypoint. Use:
    /// - actionType = "stake", send ETH in msg.value (amount param ignored)   OR
    /// - actionType = "propose", pass a memo string (amount ignored, no ETH)
    function performAction(
        string calldata actionType,
        uint256 amount,           // kept for API symmetry (ignored here)
        string calldata memo      // used only for "propose"
    ) external payable {
        bytes32 a = keccak256(bytes(actionType));

        if (a == keccak256("stake")) {
            // prefer msg.value so frontends can just send ETH with the call
            uint256 toStake = msg.value > 0 ? msg.value : amount;
            require(toStake > 0, "no amount");
            stakes[msg.sender] += toStake;
            totalStaked += toStake;
            emit Staked(msg.sender, toStake);
        } else if (a == keccak256("propose")) {
            proposalCount++;
            proposals[proposalCount] = memo;
            emit Proposed(msg.sender, proposalCount, memo);
        } else {
            revert("unknown action");
        }
    }

    // convenience reads
    function myStake(address user) external view returns (uint256) {
        return stakes[user];
    }

    function getProposal(uint256 id) external view returns (string memory) {
        return proposals[id];
    }
}
