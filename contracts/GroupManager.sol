// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GroupManager {
    struct Group { address admin; uint256[] members; }
    mapping(uint256 => Group) private groups;
    event GroupCreated(uint256 groupId, address admin);
    event MemberAdded(uint256 groupId, uint256 identityCommitment);

    function createGroup(uint256 groupId, uint8 /*depth*/, address admin) external {
        require(groups[groupId].admin == address(0), "Group exists");
        groups[groupId].admin = admin;
        emit GroupCreated(groupId, admin);
    }
    function joinGroup(uint256 groupId, uint256 identityCommitment) external {
        require(groups[groupId].admin != address(0), "No such group");
        groups[groupId].members.push(identityCommitment);
        emit MemberAdded(groupId, identityCommitment);
    }
    function getGroupAdmin(uint256 groupId) external view returns (address) {
        return groups[groupId].admin;
    }
    function getGroupMembers(uint256 groupId) external view returns (uint256[] memory) {
        return groups[groupId].members;
    }
}
