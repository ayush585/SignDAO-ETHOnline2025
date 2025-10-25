"use client"

import { useCallback, useEffect, useMemo } from "react"
import { ethers } from "ethers"
import { getBrowserProviderAndSigner } from "@/lib/eth"
import { useSyncExternalStore } from "react"

type WalletState = {
    address: string | null
    chainId: number | null
    connecting: boolean
    manuallyDisconnected: boolean
    lastTxHash: string | null
}

type WalletStore = {
    state: WalletState
    listeners: Set<() => void>
    initialized: boolean
}

const DEFAULT_STATE: WalletState = {
    address: null,
    chainId: null,
    connecting: false,
    manuallyDisconnected: false,
    lastTxHash: null
}

const store: WalletStore = {
    state: { ...DEFAULT_STATE },
    listeners: new Set(),
    initialized: false
}

function emit() {
    for (const listener of store.listeners) {
        listener()
    }
}

function setState(partial: Partial<WalletState>) {
    store.state = { ...store.state, ...partial }
    emit()
}

function getSnapshot() {
    return store.state
}

function subscribe(listener: () => void) {
    store.listeners.add(listener)
    return () => {
        store.listeners.delete(listener)
    }
}

async function refreshFromProvider() {
    if (typeof window === "undefined" || !window.ethereum) {
        setState({ address: null, chainId: null })
        return
    }

    try {
        const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[]
        const chainHex = (await window.ethereum.request({ method: "eth_chainId" }).catch(() => null)) as
            | string
            | null
        const parsedChainId = chainHex ? parseInt(chainHex, 16) : null

        if (!accounts || accounts.length === 0) {
            setState({ address: null, chainId: parsedChainId })
            return
        }

        if (store.state.manuallyDisconnected) {
            setState({ chainId: parsedChainId })
            return
        }

        const provider = new ethers.BrowserProvider(window.ethereum)
        const signer = await provider.getSigner()
        const address = await signer.getAddress()
        setState({ address, chainId: parsedChainId })
    } catch (error) {
        console.error("[wallet] refresh failed", error)
        setState({ address: null })
    }
}

async function handleAccountsChanged(accounts: string[]) {
    if (!accounts || accounts.length === 0) {
        setState({ address: null })
        return
    }

    if (store.state.manuallyDisconnected) {
        return
    }

    try {
        if (typeof window === "undefined" || !window.ethereum) {
            return
        }
        const provider = new ethers.BrowserProvider(window.ethereum)
        const signer = await provider.getSigner()
        const address = await signer.getAddress()
        setState({ address })
    } catch (error) {
        console.error("[wallet] failed to handle accountsChanged", error)
        setState({ address: null })
    }
}

function handleChainChanged(chainHex: string) {
    const parsedChainId = parseInt(chainHex, 16)
    setState({ chainId: parsedChainId })
    if (!store.state.manuallyDisconnected) {
        void refreshFromProvider()
    }
}

export function useWalletAddress() {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    useEffect(() => {
        if (store.initialized) {
            return
        }

        store.initialized = true
        void refreshFromProvider()

        const ethereum = typeof window !== "undefined" ? window.ethereum : undefined
        if (!ethereum?.on) {
            return
        }

        const accountsListener = (accounts: string[]) => {
            void handleAccountsChanged(accounts)
        }

        const chainListener = (chainId: string) => {
            handleChainChanged(chainId)
        }

        ethereum.on("accountsChanged", accountsListener)
        ethereum.on("chainChanged", chainListener)

        return () => {
            ethereum.removeListener?.("accountsChanged", accountsListener)
            ethereum.removeListener?.("chainChanged", chainListener)
        }
    }, [])

    const connect = useCallback(async () => {
        setState({ connecting: true, manuallyDisconnected: false })
        try {
            const { provider, signer } = await getBrowserProviderAndSigner()
            const address = await signer.getAddress()
            const net = await provider.getNetwork()
            setState({
                address,
                chainId: Number(net.chainId),
                connecting: false
            })
            return { provider, signer }
        } catch (error) {
            setState({ connecting: false })
            throw error
        }
    }, [])

    const disconnect = useCallback(() => {
        setState({
            address: null,
            chainId: store.state.chainId,
            manuallyDisconnected: true
        })
    }, [])

    const refresh = useCallback(() => {
        return refreshFromProvider()
    }, [])

    const setLastTxHash = useCallback((hash: string | null) => {
        setState({ lastTxHash: hash })
    }, [])

    return useMemo(
        () => ({
            address: snapshot.address,
            chainId: snapshot.chainId,
            connecting: snapshot.connecting,
            manuallyDisconnected: snapshot.manuallyDisconnected,
            lastTxHash: snapshot.lastTxHash,
            connect,
            disconnect,
            refresh,
            setLastTxHash
        }),
        [
            snapshot.address,
            snapshot.chainId,
            snapshot.connecting,
            snapshot.manuallyDisconnected,
            snapshot.lastTxHash,
            connect,
            disconnect,
            refresh,
            setLastTxHash
        ]
    )
}

export function useIsCorrectChain(expectedChainId: number) {
    const { chainId } = useWalletAddress()
    return chainId === null ? null : chainId === expectedChainId
}
