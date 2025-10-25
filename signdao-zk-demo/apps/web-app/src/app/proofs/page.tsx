"use client"

import Stepper from "@/components/Stepper"
import { useLogContext } from "@/context/LogContext"
import { useSemaphoreContext } from "@/context/SemaphoreContext"
import { useWalletAddress } from "@/lib/useWalletAddress"
import { assertDaoDeployed, assertFeedbackDeployed, getDaoWrite, getFeedbackWrite } from "@/lib/contracts"
import { generateProof, Group } from "@semaphore-protocol/core"
import { unpackGroth16Proof } from "@zk-kit/utils/proof-packing"
import { encodeBytes32String, keccak256, toBeHex } from "ethers"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSemaphoreIdentity from "@/hooks/useSemaphoreIdentity"

type GesturePayload = {
    gesture: string
    confidence: number
}

export default function ProofsPage() {
    const router = useRouter()
    const { setLog } = useLogContext()
    const { _users, _feedback, refreshFeedback, addFeedback } = useSemaphoreContext()
    const [_loading, setLoading] = useState(false)
    const { address, chainId, setLastTxHash } = useWalletAddress()
    const { _identity } = useSemaphoreIdentity()
    const isConnected = Boolean(address)
    const isCorrectChain = chainId === 11155111
    const canTransact = isConnected && isCorrectChain
    const [txInfo, setTxInfo] = useState<{ hash: string; message: string } | null>(null)
    const [gesture, setGesture] = useState<string>("")
    const [confidence, setConfidence] = useState<number | null>(null)
    const [error, setError] = useState<string>("")
    const lastGesture = useRef<string>("")
    const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const requestSepoliaSwitch = useCallback(async () => {
        try {
            await window.ethereum?.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0xaa36a7" }]
            })
        } catch (error) {
            console.error("[wallet] failed to switch chain from proofs page", error)
        }
    }, [])

    useEffect(() => {
        return () => {
            if (cooldownRef.current) {
                clearTimeout(cooldownRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (!canTransact && txInfo) {
            setTxInfo(null)
        }
    }, [canTransact, txInfo])

    useEffect(() => {
        let mounted = true

        const tick = () => {
            fetch("http://localhost:5000/gesture")
                .then((response) => {
                    if (!response.ok) {
                        throw new Error("Bad response")
                    }

                    return response.json()
                })
                .then((data: GesturePayload) => {
                    if (!mounted) {
                        return
                    }

                    setGesture(data?.gesture ?? "")
                    setConfidence(typeof data?.confidence === "number" ? data.confidence : null)
                    setError("")
                })
                .catch(() => {
                    if (!mounted) {
                        return
                    }

                    setGesture("")
                    setConfidence(null)
                    setError("API unreachable")
                })
        }

        tick()
        const id = setInterval(tick, 1500)

        return () => {
            mounted = false
            clearInterval(id)
        }
    }, [])

    useEffect(() => {
        if (_feedback.length > 0) {
            setLog(`${_feedback.length} feedback retrieved from the group 🤙🏽`)
        }
    }, [_feedback, setLog])

    const feedback = useMemo(() => [..._feedback].reverse(), [_feedback])

    const sendFeedback = useCallback(async () => {
        if (!isConnected) {
            setLog("Connect your wallet before posting feedback.")
            return
        }
        if (!isCorrectChain) {
            setLog("Switch to Sepolia to post feedback.")
            return
        }
        if (!_identity) {
            return
        }

        const feedbackMessage = prompt("Please enter your feedback:")

        if (feedbackMessage && _users) {
            setLoading(true)
            setTxInfo(null)

            setLog(`Posting your anonymous feedback...`)

            try {
                const group = new Group(_users)

                const message = encodeBytes32String(feedbackMessage)

                const { points, merkleTreeDepth, merkleTreeRoot, nullifier } = await generateProof(
                    _identity,
                    group,
                    message,
                    process.env.NEXT_PUBLIC_GROUP_ID as string
                )

                await assertFeedbackDeployed()
                const contract = await getFeedbackWrite()
                const tx = await contract.sendFeedback(merkleTreeDepth, merkleTreeRoot, nullifier, message, points)
                setTxInfo({ hash: tx.hash, message: "Feedback transaction sent." })
                setLastTxHash(tx.hash)
                setLog(`Waiting for confirmation… tx: ${tx.hash}`)
                await tx.wait()
                setTxInfo({ hash: tx.hash, message: "Feedback confirmed on Sepolia." })
                addFeedback(feedbackMessage)
                await refreshFeedback()
                setLog("✅ Your feedback has been posted 🎉")
            } catch (error) {
                console.error(error)

                const message =
                    error && typeof error === "object" && "message" in error
                        ? (error as { message?: string }).message
                        : "Some error occurred, please try again!"
                setLog(`❌ ${message}`)
                setTxInfo(null)
            } finally {
                setLoading(false)
            }
        }
    }, [
        _identity,
        _users,
        addFeedback,
        isConnected,
        isCorrectChain,
        refreshFeedback,
        setTxInfo,
        setLastTxHash,
        setLoading,
        setLog
    ])

    useEffect(() => {
        const isVoteGesture = gesture === "YES" || gesture === "NO"
        if (!isVoteGesture || gesture === lastGesture.current) {
            return
        }

        if (!isConnected) {
            setLog("Connect your wallet before voting.")
            return
        }

        if (!isCorrectChain) {
            setLog("Switch MetaMask to Sepolia before voting.")
            return
        }

        if (!_identity) {
            setLog("Semaphore identity not ready yet.")
            return
        }

        if (!_users || _users.length === 0) {
            setLog("No Semaphore members found for proof generation.")
            return
        }

        const groupId = process.env.NEXT_PUBLIC_GROUP_ID
        if (!groupId) {
            setLog("❌ Missing NEXT_PUBLIC_GROUP_ID configuration.")
            return
        }

        lastGesture.current = gesture
        if (cooldownRef.current) {
            clearTimeout(cooldownRef.current)
            cooldownRef.current = null
        }

        if (gesture !== "YES") {
            setLog("Detected NO gesture. Vote not submitted.")
            cooldownRef.current = setTimeout(() => {
                lastGesture.current = ""
                cooldownRef.current = null
            }, 5000)
            return
        }

        const signal = "1"
        const group = new Group(_users)
        const hashToField = (value: string | bigint) => {
            const bigintValue = typeof value === "bigint" ? value : BigInt(value)
            const hashed = keccak256(toBeHex(bigintValue, 32))
            return (BigInt(hashed) >> 8n).toString()
        }

        const run = async () => {
            try {
                setLog(`Detected ${gesture} gesture - generating ZK proof...`)

                const proof = await generateProof(_identity, group, signal, groupId)
                const unpacked = unpackGroth16Proof(proof.points)
                const signalField = hashToField((proof as any).message ?? signal)
                const externalNullifier = hashToField((proof as any).scope ?? groupId)

                const proofPayload = [
                    [unpacked.pi_a[0].toString(), unpacked.pi_a[1].toString()],
                    [
                        [unpacked.pi_b[0][0].toString(), unpacked.pi_b[0][1].toString()],
                        [unpacked.pi_b[1][0].toString(), unpacked.pi_b[1][1].toString()]
                    ],
                    [unpacked.pi_c[0].toString(), unpacked.pi_c[1].toString()],
                    proof.merkleTreeRoot.toString(),
                    proof.nullifier.toString(),
                    signalField,
                    externalNullifier
                ]

                setTxInfo(null)
                const hash = await submitVote(proofPayload, setLog)
                if (hash) {
                    setTxInfo({ hash, message: "Vote confirmed on Sepolia." })
                    setLastTxHash(hash)
                }
            } catch (err: unknown) {
                console.error(err)

                const message = err instanceof Error ? err.message : "Unknown error"
                setLog("❌ Error submitting vote: " + message)
            } finally {
                cooldownRef.current = setTimeout(() => {
                    lastGesture.current = ""
                    cooldownRef.current = null
                }, 5000)
            }
        }

        run()
    }, [gesture, _identity, _users, isConnected, isCorrectChain, setLastTxHash, setLog])

    return (
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
                        View on Etherscan ↗
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
                that they are part of a group and send their anonymous messages. Messages could be votes, leaks,
                reviews, feedback, etc.
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

            {feedback.length > 0 && (
                <div className="feedback-wrapper">
                    {feedback.map((f, i) => (
                        <div key={i}>
                            <p className="box box-text">{f}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="send-feedback-button">
                <button
                    className="button"
                    onClick={sendFeedback}
                    disabled={_loading || !canTransact}
                    title={!isConnected ? "Connect wallet first" : !isCorrectChain ? "Switch to Sepolia" : ""}
                >
                    <span>Send Feedback</span>
                    {_loading && <div className="loader"></div>}
                </button>
            </div>

            <div className="divider"></div>

            <Stepper step={3} onPrevClick={() => router.push("/group")} />
        </>
    )
}

async function submitVote(proofTuple: any[], setLog: (msg: string) => void): Promise<string | null> {
    try {
        await assertDaoDeployed()
        const contract = await getDaoWrite()

        setLog("Submitting vote tx…")
        const tx = await contract.submitVote(...proofTuple)
        console.log("tx hash:", tx.hash)

        setLog(`Waiting for confirmation… tx: ${tx.hash}`)
        await tx.wait()
        setLog(`✅ Vote confirmed on Sepolia — https://sepolia.etherscan.io/tx/${tx.hash}`)
        return tx.hash
    } catch (error: unknown) {
        console.error("❌ Transaction failed:", error)
        const message = error && typeof error === "object" && "message" in error ? (error as any).message : "Tx failed"
        setLog(`❌ Error submitting vote: ${message}`)
        return null
    }
}
