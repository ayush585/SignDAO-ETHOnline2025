# 🖐️ SignDAO — Gesture-Driven DAO Inclusion

**AI-powered oracle for sign language voting in DAOs, protected by Zero-Knowledge proofs.**

---

## 🧙‍♂️ Problem

DAO governance today is **text-centric**, excluding 70 million+ deaf or hard-of-hearing users who use sign language as their primary medium.

---

## 💡 Solution

**SignDAO** enables fully private, gesture-based DAO voting.
AI models recognize sign-language gestures → they’re converted to on-chain votes through **ZK-proofs** for anonymity and fairness.

**Inclusion + Privacy = Accessible Web3 governance.**

---

## ⚙️ Tech Stack

| Layer                           | Tools / Frameworks                               |
| ------------------------------- | ------------------------------------------------ |
| 🧠 **AI / Gesture Recognition** | Python · MediaPipe · FastAPI bridge              |
| ⛓️ **Blockchain / ZK**          | Solidity · Semaphore · Hardhat · Sepolia Testnet |
| 🌐 **Frontend**                 | Next.js · Ethers v6 · Tailwind · MetaMask signer |
| 🔐 **ZK Proofs**                | Groth16 · Semaphore circuits                     |
| 🧱 **Infra**                    | Routescan + Sourcify verified contracts          |

---

## 🌍 Impact

Brings 1 B+ underserved users into on-chain governance.
Every DAO member can vote *by signing*, not typing.

---

## 🔜 Verified Contracts (Sepolia Testnet – Chain 11155111)

| Contract                        | Address                                                                                                                                                | Description                               | Verification           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------- |
| **DaoActionsZK.sol**            | [`0x7b8363901E588F44cD2904D61Ef5Ab83F59873f2`](https://testnet.routescan.io/address/0x7b8363901E588F44cD2904D61Ef5Ab83F59873f2/contract/11155111/code) | Main DAO logic + ZK vote verification     | ✅ Sourcify + Routescan |
| **SemaphoreVerifier.sol**       | [`0x185112CB3C2140858ff77C5B33F11Be8343ae3fc`](https://testnet.routescan.io/address/0x185112CB3C2140858ff77C5B33F11Be8343ae3fc/contract/11155111/code) | Groth16 proof verifier                    | ✅ Sourcify + Routescan |
| **DaoActions.sol**              | `0x1Fdf28577154106956cfE5086a7d7B17b6Da4C1b`                                                                                                           | Base DAO module (verified)                | ✅                      |
| **GestureNFT.sol**              | `0x8Ec061e0aF8A430eF1056ed377eDeAfB1cFE21cF`                                                                                                           | Gesture reputation NFTs                   | ✅                      |
| **DaoActionsZK (frontend env)** | `NEXT_PUBLIC_DAO_ACTIONS_ADDR` → Sepolia                                                                                                               | Used for group & vote writes via MetaMask | ✅                      |

---

## 🕵️‍♂️ DApp Flow

1. **Connect Wallet** → MetaMask (Sepolia)
2. **Create Identity** → Semaphore commitment
3. **Create / Join Group** → On-chain via MetaMask signer
4. **Make Gesture Vote** → ZK proof generated & verified
5. **Confirm Tx** → View on Sepolia Etherscan

All writes use the **MetaMask signer** (0xb9326…9636) — no private keys or backend wallets required.

---

## 🔧 Local Dev (Frontend + AI Bridge)

### Frontend

```bash
cd signdao-zk-demo/apps/web-app
npm install
npm run dev
# Visit http://localhost:3000
```

### Gesture Bridge (Python)

```bash
cd apps/backend
pip install -r requirements.txt
python api.py
# Visit http://localhost:5000/gesture
```

### MetaMask Setup

* Network: **Sepolia Testnet**
  RPC: `https://rpc.sepolia.org`
  Chain ID: 11155111
* Fund account with Sepolia ETH ([https://sepoliafaucet.com](https://sepoliafaucet.com))
* Connected wallet must match deployed admin (`0xb9326...9636`).

---

## 🧠 Local ZK Development (optional)

```bash
yarn workspace monorepo-ethers-contracts hardhat node
yarn workspace monorepo-ethers-web-app dev
```

Use this only for circuit testing; production writes are on **Sepolia**.

---

## ✅ Status

* [x] Wallet UX – Connect / Disconnect / Balance
* [x] On-chain group creation + joining
* [x] ZK gesture proofs (Groth16)
* [x] Verified contracts
* [x] Inclusive voting flow (end-to-end)

---

## 👮‍♂️ Demo Checklist for Judges

1. Click **Connect Wallet** → choose MetaMask (Sepolia).
2. Click **Create Group** → approve tx → Etherscan link shows.
3. Click **Join Group** → approve tx → member appears.
4. Perform a gesture → verify proof → vote recorded.
5. Confirm on Sepolia explorer.

---

## 🏁 Tagline

**“Your voice on-chain — even if it’s silent.”** 🦟

---

### ✅ Key Fixes Reflected Here

* Removed all localhost RPC mentions (`127.0.0.1:8545`).
* Removed server wallet instructions (`ETHEREUM_PRIVATE_KEY`).
* Clarified that **all writes are now via MetaMask signer**.
* Updated verified contract addresses.

---

## ⚙️ How It Works (Technical Overview)

SignDAO bridges **AI gesture recognition** and **ZK-secure blockchain voting** in five coordinated layers:

### 1. Gesture Capture & AI Recognition

* The **frontend** or **Python FastAPI backend** captures webcam frames.
* **MediaPipe** models classify each frame into a specific gesture label (e.g., YES, NO, ABSTAIN).
* The AI inference output is converted into an encoded signal string (ASCII or base64).

### 2. Signal Commitment & Identity Generation

* Users create a **Semaphore identity commitment** locally in the browser.
* This identity stays private — only its hash (the commitment) is stored on-chain in a Semaphore Group.
* Each member’s commitment is added via `DaoActionsZK.joinGroup()` (MetaMask write on Sepolia).

### 3. ZK Proof Generation (Groth16)

* When a user performs a gesture vote, the gesture label becomes the `signal` input to a **Groth16 circuit**.
* Using `snarkjs` + Semaphore circuit files, the app generates a **ZK proof** that:

  * The voter belongs to a valid group (inclusion proof), and
  * The same voter cannot double-vote (nullifier hash check).
* No identity data or gesture content is leaked.

### 4. On-chain Verification & DAO Logic

* The ZK proof is verified on-chain by **SemaphoreVerifier.sol**.
* Once verified, **DaoActionsZK.sol** records the anonymized vote result in its DAO state.
* Each transaction is visible on Sepolia Etherscan but contains no personal info.

### 5. Feedback & Transparency

* The frontend shows live vote confirmation with a Sepolia Etherscan link.
* Each successful tx updates the global group list and the user’s “last transaction” pill in the header.
* All reads (vote count, group members, etc.) use `NEXT_PUBLIC_SEPOLIA_RPC` for speed and consistency.

---

**In essence:**

> AI interprets the gesture → browser proves identity → ZK circuit hides the voter → MetaMask finalizes the vote.

This chain of trust ensures a **private, accessible, and verifiable** democratic process — on-chain, for everyone.
