// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC721Token is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {}

    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }

    function burn(uint256 tokenId) external {
        // passing msg.sender as auth checks owner/approved before burning
        _update(address(0), tokenId, msg.sender);
    }
}
