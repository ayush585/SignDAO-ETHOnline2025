"use client";

import Stepper from "@/components/Stepper";
import ClientOnly from "@/components/ClientOnly";
import { useLogContext } from "@/context/LogContext";
import { useSemaphoreContext } from "@/context/SemaphoreContext";
import { useWalletAddress } from "@/lib/useWalletAddress";
import {
  assertDaoDeployed,
  getDaoWrite,
  getFeedbackWriteOrNull,
  getGroupMerkleRoot,
  DAO_ADDR,
  FB_ADDR
} from "@/lib/contracts";
import { getReadProvider } from "@/lib/eth";
import { generateProof, Group } from "@semaphore-protocol/core";
import { unpackGroth16Proof } from "@zk-kit/utils/proof-packing";
import { encodeBytes32String, keccak256, toBeHex } from "ethers";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSemaphoreIdentity from "@/hooks/useSemaphoreIdentity";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";
const GESTURE_YES = "YES";
const GESTURE_NO = "NO";
const COOLDOWN_MS = 5000;

type GesturePayload = {
  gesture: string;
  confidence: number;
};

type TxInfo = {
  hash: string;
  message: string;
};

type VoteProofTuple = [
  [bigint, bigint],
  [[bigint, bigint], [bigint, bigint]],
  [bigint, bigint],
  bigint,
  bigint,
  bigint,
  bigint
];

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return "Transaction failed. Please try again.";
}

function hashToField(value: string | bigint): bigint {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  const hashed = keccak256(toBeHex(bigintValue, 32));
  return BigInt(hashed) >> 8n;
}

async function submitVoteTransaction(
  proofTuple: VoteProofTuple,
  setLog: (msg: string) => void
): Promise<string | null> {
  try {
    await assertDaoDeployed();
    const contract = await getDaoWrite();
    setLog("Submitting vote transaction...");
    const tx = await contract.submitVote(...proofTuple);
    setLog(`Waiting for confirmation... tx: ${tx.hash}`);
    await tx.wait();
    setLog(`Vote confirmed on Sepolia: https://sepolia.etherscan.io/tx/${tx.hash}`);
    return tx.hash as string;
  } catch (error) {
    console.error("Transaction failed:", error);
    setLog(`Error submitting vote: ${extractErrorMessage(error)}`);
    return null;
  }
}

export default function ProofsPage() {
  const router = useRouter();
  const { setLog } = useLogContext();
  const { _users, _feedback, refreshFeedback, addFeedback } = useSemaphoreContext();
  const { address, chainId, setLastTxHash } = useWalletAddress();
  const { _identity } = useSemaphoreIdentity();

  const [isSubmittingFeedback, setSubmittingFeedback] = useState(false);
  const [isSubmittingVote, setSubmittingVote] = useState(false);
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);
  const [gesture, setGesture] = useState<string>("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const lastGesture = useRef<string>("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [feedbackReady, setFeedbackReady] = useState(false);
  const [feedbackChecked, setFeedbackChecked] = useState(false);

  const isConnected = Boolean(address);
  const isCorrectChain = chainId === SEPOLIA_CHAIN_ID;
  const canTransact = isConnected && isCorrectChain;
  const groupId = process.env.NEXT_PUBLIC_GROUP_ID;
  const groupIdBigInt = useMemo(() => (groupId ? BigInt(groupId) : null), [groupId]);

  const requestSepoliaSwitch = useCallback(async () => {
    try {
      await window.ethereum?.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_HEX }]
      });
    } catch (switchError) {
      console.error("[wallet] failed to switch chain from proofs page", switchError);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) {
        clearTimeout(cooldownRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!canTransact && txInfo) {
      setTxInfo(null);
    }
  }, [canTransact, txInfo]);

  useEffect(() => {
    let cancelled = false;

    async function checkFeedbackContract() {
      const feedbackAddress = (FB_ADDR || "") as string;
      if (!feedbackAddress) {
        setFeedbackReady(false);
        setFeedbackChecked(true);
        return;
      }
      try {
        const code = await getReadProvider().getCode(feedbackAddress);
        if (!cancelled) {
          setFeedbackReady(Boolean(code && code !== "0x"));
          setFeedbackChecked(true);
        }
      } catch (err) {
        console.error("[feedback] failed to read bytecode", err);
        if (!cancelled) {
          setFeedbackReady(false);
          setFeedbackChecked(true);
        }
      }
    }

    void checkFeedbackContract();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const tick = () => {
      fetch("http://localhost:5000/gesture")
        .then((response) => {
          if (!response.ok) {
            throw new Error("Bad response");
          }
          return response.json();
        })
        .then((data: GesturePayload) => {
          if (!mounted) {
            return;
          }
          setGesture(data?.gesture ?? "");
          setConfidence(typeof data?.confidence === "number" ? data.confidence : null);
          setError("");
        })
        .catch(() => {
          if (!mounted) {
            return;
          }
          setGesture("");
          setConfidence(null);
          setError("Gesture API unreachable");
        });
    };

    tick();
    const id = setInterval(tick, 1500);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (_feedback.length > 0) {
      setLog(`${_feedback.length} feedback item(s) loaded from the group.`);
    }
  }, [_feedback, setLog]);

  const feedbackList = useMemo(() => [..._feedback].reverse(), [_feedback]);

  const sendFeedback = useCallback(async () => {
    if (!isConnected) {
      setLog("Connect your wallet before posting feedback.");
      return;
    }
    if (!isCorrectChain) {
      setLog("Switch MetaMask to Sepolia before posting feedback.");
      return;
    }
    if (!_identity) {
      setLog("Semaphore identity not ready yet.");
      return;
    }
    if (!_users || _users.length === 0) {
      setLog("No Semaphore members found for proof generation.");
      return;
    }
    if (!groupIdBigInt) {
      setLog("Missing NEXT_PUBLIC_GROUP_ID configuration.");
      return;
    }
    if (!feedbackReady) {
      setLog("Feedback contract not configured.");
      return;
    }

    const feedbackMessage = prompt("Please enter your feedback:");
    if (!feedbackMessage) {
      return;
    }

    setSubmittingFeedback(true);
    setTxInfo(null);
    setLog("Posting your anonymous feedback...");

    try {
      const group = new Group(_users);
      const signal = encodeBytes32String(feedbackMessage);
      const { points, merkleTreeDepth, merkleTreeRoot, nullifier } = await generateProof(
        _identity,
        group,
        signal,
        groupIdBigInt
      );

      const fbContract = await getFeedbackWriteOrNull();
      if (!fbContract) {
        setLog("Feedback contract not configured.");
        return;
      }

      const tx = await fbContract.sendFeedback(merkleTreeDepth, merkleTreeRoot, nullifier, signal, points);
      setLog(`Waiting for confirmation... tx: ${tx.hash}`);
      await tx.wait();
      setTxInfo({ hash: tx.hash, message: "Feedback confirmed on Sepolia." });
      setLastTxHash(tx.hash);
      addFeedback(feedbackMessage);
      await refreshFeedback();
      setLog("Feedback recorded and list refreshed.");
    } catch (submitError) {
      console.error(submitError);
      setLog(`Error posting feedback: ${extractErrorMessage(submitError)}`);
      setTxInfo(null);
    } finally {
      setSubmittingFeedback(false);
    }
  }, [
    _identity,
    _users,
    addFeedback,
    groupIdBigInt,
    isConnected,
    isCorrectChain,
    refreshFeedback,
    setLastTxHash,
    setLog,
    feedbackReady
  ]);

  useEffect(() => {
    const isVoteGesture = gesture === GESTURE_YES || gesture === GESTURE_NO;
    if (!isVoteGesture || gesture === lastGesture.current) {
      return;
    }

    if (!isConnected) {
      setLog("Connect your wallet before voting.");
      return;
    }

    if (!isCorrectChain) {
      setLog("Switch MetaMask to Sepolia before voting.");
      return;
    }

    if (!_identity) {
      setLog("Semaphore identity not ready yet.");
      return;
    }

    if (!_users || _users.length === 0) {
      setLog("No Semaphore members found for proof generation.");
      return;
    }

    if (!groupIdBigInt) {
      setLog("Missing NEXT_PUBLIC_GROUP_ID configuration.");
      return;
    }

    lastGesture.current = gesture;
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current);
      cooldownRef.current = null;
    }

    if (gesture !== GESTURE_YES) {
      setLog("Detected NO gesture. Vote not submitted.");
      cooldownRef.current = setTimeout(() => {
        lastGesture.current = "";
        cooldownRef.current = null;
      }, COOLDOWN_MS);
      return;
    }

    const signal = "1";
    const group = new Group(_users);

    const run = async () => {
      try {
        setLog(`Detected ${gesture} gesture - generating ZK proof...`);

        const proof = await generateProof(_identity, group, signal, groupIdBigInt);
        const unpacked = unpackGroth16Proof(proof.points);
        const piA: [bigint, bigint] = [BigInt(unpacked.pi_a[0]), BigInt(unpacked.pi_a[1])];
        const piB: [[bigint, bigint], [bigint, bigint]] = [
          [BigInt(unpacked.pi_b[0][0]), BigInt(unpacked.pi_b[0][1])],
          [BigInt(unpacked.pi_b[1][0]), BigInt(unpacked.pi_b[1][1])]
        ];
        const piC: [bigint, bigint] = [BigInt(unpacked.pi_c[0]), BigInt(unpacked.pi_c[1])];
        const merkleRootOnChain = await getGroupMerkleRoot(groupIdBigInt);
        const proofMerkleRoot = BigInt(proof.merkleTreeRoot);
        if (merkleRootOnChain !== proofMerkleRoot) {
          setLog("On-chain Merkle root mismatch. Refresh the group before voting.");
          return;
        }
        const signalField = hashToField((proof as any).message ?? signal);
        const externalNullifier = hashToField((proof as any).scope ?? groupIdBigInt);
        const proofPayload: VoteProofTuple = [
          piA,
          piB,
          piC,
          merkleRootOnChain,
          BigInt(proof.nullifier),
          signalField,
          externalNullifier
        ];

        setTxInfo(null);
        const hash = await submitVoteTransaction(proofPayload, setLog);
        if (hash) {
          setTxInfo({ hash, message: "Vote confirmed on Sepolia." });
          setLastTxHash(hash);
        }
      } catch (voteError) {
        console.error(voteError);
        setLog(`Error submitting vote: ${extractErrorMessage(voteError)}`);
      } finally {
        cooldownRef.current = setTimeout(() => {
          lastGesture.current = "";
          cooldownRef.current = null;
        }, COOLDOWN_MS);
      }
    };

    void run();
  }, [
    gesture,
    _identity,
    _users,
    groupIdBigInt,
    isConnected,
    isCorrectChain,
    setLastTxHash,
    setLog
  ]);

  const handleSubmitVote = useCallback(async () => {
    if (isSubmittingVote) {
      return;
    }

    if (!isConnected) {
      setLog("Connect your wallet before voting.");
      return;
    }

    if (!isCorrectChain) {
      setLog("Switch MetaMask to Sepolia before voting.");
      return;
    }

    if (!_identity) {
      setLog("Semaphore identity not ready yet.");
      return;
    }

    if (!_users || _users.length === 0) {
      setLog("No Semaphore members found for proof generation.");
      return;
    }

    if (!groupIdBigInt) {
      setLog("Missing NEXT_PUBLIC_GROUP_ID configuration.");
      return;
    }

    const signal = "1";
    const group = new Group(_users);

    setSubmittingVote(true);
    setTxInfo(null);
    setLog("Generating vote proof...");

    try {
      const proof = await generateProof(_identity, group, signal, groupIdBigInt);
      const unpacked = unpackGroth16Proof(proof.points);
      const piA: [bigint, bigint] = [BigInt(unpacked.pi_a[0]), BigInt(unpacked.pi_a[1])];
      const piB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(unpacked.pi_b[0][0]), BigInt(unpacked.pi_b[0][1])],
        [BigInt(unpacked.pi_b[1][0]), BigInt(unpacked.pi_b[1][1])]
      ];
      const piC: [bigint, bigint] = [BigInt(unpacked.pi_c[0]), BigInt(unpacked.pi_c[1])];
      const merkleRootOnChain = await getGroupMerkleRoot(groupIdBigInt);
      const proofMerkleRoot = BigInt(proof.merkleTreeRoot);
      if (merkleRootOnChain !== proofMerkleRoot) {
        setLog("On-chain Merkle root mismatch. Refresh the group before voting.");
        return;
      }
      const signalField = hashToField((proof as any).message ?? signal);
      const externalNullifier = hashToField((proof as any).scope ?? groupIdBigInt);
      const proofPayload: VoteProofTuple = [
        piA,
        piB,
        piC,
        merkleRootOnChain,
        BigInt(proof.nullifier),
        signalField,
        externalNullifier
      ];

      const hash = await submitVoteTransaction(proofPayload, setLog);
      if (hash) {
        setTxInfo({ hash, message: "Vote confirmed on Sepolia." });
        setLastTxHash(hash);
      }
    } catch (voteError) {
      console.error(voteError);
      setLog(`Error submitting vote: ${extractErrorMessage(voteError)}`);
    } finally {
      setSubmittingVote(false);
    }
  }, [
    _identity,
    _users,
    groupIdBigInt,
    isConnected,
    isCorrectChain,
    isSubmittingVote,
    setLastTxHash,
    setLog
  ]);

  const voteDisabled =
    isSubmittingVote ||
    !canTransact ||
    !_identity ||
    !_users ||
    _users.length === 0 ||
    !groupIdBigInt;
  const voteTooltip = !isConnected
    ? "Connect wallet first"
    : !isCorrectChain
    ? "Switch to Sepolia"
    : !_identity
    ? "Semaphore identity not ready"
    : !_users || _users.length === 0
    ? "No Semaphore members found"
    : !groupIdBigInt
    ? "Configure NEXT_PUBLIC_GROUP_ID"
    : "";

  const feedbackDisabled = !feedbackChecked || !feedbackReady;
  const feedbackTooltip = !feedbackChecked
    ? "Checking feedback contract..."
    : !feedbackReady
    ? "Feedback contract not configured"
    : !isConnected
    ? "Connect wallet first"
    : !isCorrectChain
    ? "Switch to Sepolia"
    : "";

  return (
    <ClientOnly>
      <>
        {!isConnected && (
          <div className="wallet-guard" role="alert">
            Connect your wallet to interact with proofs.
          </div>
        )}
        {isConnected && !isCorrectChain && (
          <div className="wallet-guard" role="alert">
            <span>Switch your wallet to Sepolia to continue.</span>
            <button type="button" onClick={requestSepoliaSwitch}>
              Switch to Sepolia
            </button>
          </div>
        )}
        {txInfo && (
          <div className="tx-toast" role="status">
            <span>{txInfo.message}</span>
            <a
              href={`https://sepolia.etherscan.io/tx/${txInfo.hash}`}
              target="_blank"
              rel="noreferrer noopener nofollow"
            >
              View on Etherscan
            </a>
          </div>
        )}
        <section className="gesture-vote">
          <h2>Gesture Vote</h2>
          <p>Gesture: {gesture ? gesture : "Waiting..."}</p>
          <p>Confidence: {confidence !== null ? confidence.toFixed(2) : "-"}</p>
        {error && (
          <p style={{ color: "red", fontSize: "0.85rem" }} role="alert">
            {error}
          </p>
        )}
      </section>

      <div className="submit-vote-button">
        <button
          className="button"
          onClick={handleSubmitVote}
          disabled={voteDisabled}
          title={voteTooltip}
          type="button"
        >
          <span>Submit Vote</span>
          {isSubmittingVote && <div className="loader"></div>}
        </button>
      </div>

      <h2>Proofs</h2>

        <p>
          Semaphore members can anonymously{" "}
          <a
            href="https://docs.semaphore.pse.dev/guides/proofs"
            target="_blank"
            rel="noreferrer noopener nofollow"
          >
            prove
          </a>{" "}
          that they are part of a group and send their anonymous messages. DaoActionsZK contract: {DAO_ADDR}.
        </p>

        <div className="divider"></div>

        <div className="text-top">
          <h3>Feedback ({_feedback.length})</h3>
          <button className="refresh-button" onClick={refreshFeedback}>
            <span className="refresh-span">
              <svg viewBox="0 0 24 24" focusable="false" className="refresh-icon">
                <path
                  fill="currentColor"
                  d="M5.463 4.43301C7.27756 2.86067 9.59899 1.99666 12 2.00001C17.523 2.00001 22 6.47701 22 12C22 14.136 21.33 16.116 20.19 17.74L17 12H20C20.0001 10.4316 19.5392 8.89781 18.6747 7.58927C17.8101 6.28072 16.5799 5.25517 15.1372 4.64013C13.6944 4.0251 12.1027 3.84771 10.56 4.13003C9.0172 4.41234 7.59145 5.14191 6.46 6.22801L5.463 4.43301ZM18.537 19.567C16.7224 21.1393 14.401 22.0034 12 22C6.477 22 2 17.523 2 12C2 9.86401 2.67 7.88401 3.81 6.26001L7 12H4C3.99987 13.5684 4.46075 15.1022 5.32534 16.4108C6.18992 17.7193 7.42007 18.7449 8.86282 19.3599C10.3056 19.9749 11.8973 20.1523 13.44 19.87C14.9828 19.5877 16.4085 18.8581 17.54 17.772L18.537 19.567Z"
                ></path>
              </svg>
            </span>
            Refresh
          </button>
        </div>

        {feedbackList.length > 0 && (
          <div className="feedback-wrapper">
            {feedbackList.map((feedbackItem, index) => (
              <div key={index}>
                <p className="box box-text">{feedbackItem}</p>
              </div>
            ))}
          </div>
        )}

        <div className="send-feedback-button">
          <button
            className="button"
            onClick={sendFeedback}
            disabled={feedbackDisabled || isSubmittingFeedback || !canTransact}
            title={feedbackTooltip}
          >
            <span>Send Feedback</span>
            {isSubmittingFeedback && <div className="loader"></div>}
          </button>
        </div>

        <div className="divider"></div>

        <Stepper step={3} onPrevClick={() => router.push("/group")} />
      </>
    </ClientOnly>
  );
}
