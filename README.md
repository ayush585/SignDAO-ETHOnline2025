# SignDAO: Gesture-Driven DAO Inclusion
AI-powered oracle for sign language voting in DAOs, with ZK privacy.

## Problem
DAOs exclude 70M+ deaf users due to text-based governance.

## Solution
SignDAO uses AI to translate sign language gestures into on-chain votes, with ZK privacy for anonymity.

## Tech Stack
- AI: Python/MediaPipe
- Blockchain: Solidity/Remix, Semaphore (ZK), Sepolia
- Frontend: Next.js

## Impact
Enables inclusive Web3 for 1B+ underserved users.

### Contracts (Sepolia)
- DaoActions.sol @ `0x1Fdf28577154106956cfE5086a7d7B17b6Da4C1b` (verified)
- GestureNFT.sol @ `0x8Ec061e0aF8A430eF1056ed377eDeAfB1cFE21cF` (verified)
- ZK Verifier: 0x10d37E4cc006C49a05e3D5919519E25b6DdD2aEf (tx:0x20f9be9f2f2628a25f70d4e83b85a1d9d9533ef7c0f4599051c3f47305d90022)
- DaoActions: 0xa697B278ad81aeFC24D85ADE99828BFf8758cE60
  (verified on Sourcify & Routescan)


### ZK Privacy (Semaphore – Local Dev)
- Run Hardhat local chain:
  yarn workspace monorepo-ethers-contracts hardhat node
- In another terminal, start the web app:
  yarn workspace monorepo-ethers-web-app dev
- MetaMask → Add network:
  RPC https://127.0.0.1:8545  | Chain ID 31337 | Name Localhost 8545
- Import test account (from Hardhat logs) and open http://localhost:3000
  Create Identity → Join Group → Proofs → Send Feedback (zk proof).