# SignDAO — Gesture-Assisted Private Group Voting

SignDAO is an **ETHGlobal 2025 hackathon prototype** exploring an accessibility-focused voting flow that combines gesture recognition, Semaphore zero-knowledge membership proofs, Solidity, and a browser wallet.

The original prototype remains in this repository for historical transparency, alongside a **post-hackathon V2 security-hardening pass** rather than rewriting the original implementation.

## What the prototype demonstrated

- Python / MediaPipe gesture input
- browser-generated Semaphore identities
- Semaphore group membership
- Groth16 proof generation
- Solidity proof verification
- MetaMask-signed Sepolia transactions
- Next.js / Ethers v6 integration

The core integration path was:

```text
gesture input
    ↓
Semaphore identity + group
    ↓
Groth16 proof generation
    ↓
proof serialization / ABI packing
    ↓
Solidity verification
    ↓
Sepolia transaction
```

## Project status

This repository is **experimental** and should not be treated as production DAO infrastructure.

A later review of the hackathon implementation found several limitations in the legacy direct-verifier path:

- verifier replacement was not access-controlled;
- the wrapper did not itself bind a proof to an approved SignDAO group;
- the wrapper did not itself consume nullifiers for one-vote-per-scope enforcement;
- direct wallet submission exposed the transaction sender even when the Semaphore identity remained hidden;
- identity material was persisted and displayed for demo/debugging purposes.

These limitations are documented instead of being hidden.

## Hardened V2

The hardening work lives at:

- `signdao-zk-demo/apps/contracts/contracts/SignDAOVotingV2.sol`
- `signdao-zk-demo/apps/contracts/test/SignDAOVotingV2.ts`
- `docs/SIGNDAO_V2_SECURITY.md`

V2:

- delegates proof verification, accepted-root checks, and nullifier consumption to Semaphore v4.13.2;
- makes the voting contract the admin of its Semaphore group;
- uses append-only membership in this focused version;
- binds `proof.message` to YES / NO;
- binds `proof.scope` to chain + contract + group + proposal;
- enforces proposal voting windows;
- does not use `msg.sender` as voter identity, allowing relayed proof submission;
- exposes no function that directly changes vote totals.

The V2 work is a post-hackathon security exercise, not a claim that the original deployment already had these guarantees.

See [docs/SIGNDAO_V2_SECURITY.md](docs/SIGNDAO_V2_SECURITY.md).

## Gesture layer

The lightweight Flask bridge used by the web demo recognizes a simple thumb-up / thumb-down-style pose heuristic and returns YES / NO labels. It should be treated as a prototype input mechanism, not as a production-grade sign-language classifier.

A separate experimental recognizer in the repository includes normalization, confidence thresholds, smoothing, and optional KNN classification.

The blockchain security model must not depend on the gesture classifier being infallible.

## Legacy Sepolia deployments

These addresses are retained as historical prototype artifacts.

| Contract | Sepolia address | Purpose |
| --- | --- | --- |
| `DaoActionsZK.sol` | `0x7b8363901E588F44cD2904D61Ef5Ab83F59873f2` | legacy direct ZK-verifier wrapper |
| `SemaphoreVerifier.sol` | `0x185112CB3C2140858ff77C5B33F11Be8343ae3fc` | generated Groth16 verifier |
| `DaoActions.sol` | `0x1Fdf28577154106956cfE5086a7d7B17b6Da4C1b` | early stake/proposal demo |
| `GestureNFT.sol` | `0x8Ec061e0aF8A430eF1056ed377eDeAfB1cFE21cF` | gesture NFT prototype |

The generated verifier comes from the Semaphore/snarkjs toolchain; it is not represented as hand-authored cryptographic verifier logic.

## Repository structure

```text
contracts/
    DaoActions.sol
    DaoActionsCore.sol
    DaoActionsZK.sol
    GestureNFT.sol
    SemaphoreVerifier.sol

apps/backend/
    api.py
    gesture_recognition.py

signdao-zk-demo/
    apps/contracts/
        contracts/
            Feedback.sol
            SignDAOVotingV2.sol
        test/
            Feedback.ts
            SignDAOVotingV2.ts
    apps/web-app/

docs/
    SIGNDAO_V2_SECURITY.md
```

## Local development

Gesture bridge:

```bash
cd apps/backend
pip install -r requirements.txt
python api.py
```

Web app:

```bash
cd signdao-zk-demo
yarn install
yarn workspace monorepo-ethers-web-app dev
```

Contract tests:

```bash
cd signdao-zk-demo
yarn workspace monorepo-ethers-contracts test
```

## Privacy boundary

Semaphore can hide which group identity generated a valid proof. It does not automatically hide the account that broadcasts the Ethereum transaction.

The hardened contract therefore allows relayed submission and does not claim transport-layer anonymity.

## Project history

SignDAO was built to explore how accessibility interfaces, ZK membership, and on-chain governance primitives can be connected rapidly. The V2 work revisits that prototype with a security-review mindset: document assumptions, identify broken invariants, and harden them explicitly.
