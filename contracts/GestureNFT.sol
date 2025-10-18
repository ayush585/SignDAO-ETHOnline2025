// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title GestureNFT - NFTs generated from gesture landmark fingerprints
/// @notice Mints NFTs that store unique gesture hashes from gesture_recognition.py
contract GestureNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    mapping(uint256 => string) public tokenFingerprints;

    event NFTMinted(address indexed to, uint256 tokenId, string fingerprint);

    // ✅ Fixed constructor for OpenZeppelin v5+
    constructor() ERC721("GestureNFT", "GNFT") Ownable(msg.sender) {}

    /// @notice Mints a new NFT with a gesture fingerprint
    /// @param recipient Address receiving the NFT
    /// @param fingerprint Unique string hash of gesture metadata
    /// @return tokenId Newly minted NFT ID
    function mintNFT(address recipient, string memory fingerprint)
        public
        onlyOwner
        returns (uint256)
    {
        uint256 tokenId = ++nextTokenId;
        _safeMint(recipient, tokenId);
        tokenFingerprints[tokenId] = fingerprint;
        emit NFTMinted(recipient, tokenId, fingerprint);
        return tokenId;
    }

    /// @notice View stored fingerprint of a given NFT
    /// @param tokenId NFT ID to fetch fingerprint for
    /// @return fingerprint The stored fingerprint string
    function getFingerprint(uint256 tokenId)
        public
        view
        returns (string memory fingerprint)
    {
        return tokenFingerprints[tokenId];
    }
}
