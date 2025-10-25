"use client"

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react"
import { ethers } from "ethers"
import GroupManagerAbi from "@/lib/abi/GroupManager.json"
import { getReadProvider } from "@/lib/eth"

export type SemaphoreContextType = {
    _users: string[]
    _feedback: string[]
    refreshUsers: () => Promise<void>
    addUser: (user: string) => void
    refreshFeedback: () => Promise<void>
    addFeedback: (feedback: string) => void
}

const SemaphoreContext = createContext<SemaphoreContextType | null>(null)

const GROUP_ADDR = process.env.NEXT_PUBLIC_GROUP_MANAGER_ADDR as `0x${string}`
if (!GROUP_ADDR) {
    throw new Error("NEXT_PUBLIC_GROUP_MANAGER_ADDR missing")
}
const GROUP_ID = BigInt(process.env.NEXT_PUBLIC_GROUP_ID || "1001")
const groupRead = new ethers.Contract(GROUP_ADDR, GroupManagerAbi, getReadProvider())

interface ProviderProps {
    children: ReactNode
}

export const SemaphoreContextProvider: React.FC<ProviderProps> = ({ children }) => {
    const [_users, setUsers] = useState<string[]>([])
    const [_feedback, setFeedback] = useState<string[]>([])
    const refreshUsers = useCallback(async (): Promise<void> => {
        try {
            const members: bigint[] = await groupRead.getGroupMembers(GROUP_ID)
            setUsers(members.map((member) => member.toString()))
        } catch {
            setUsers([])
        }
    }, [])

    const addUser = useCallback((user: string) => {
        setUsers((prev) => (prev.includes(user) ? prev : [...prev, user]))
    }, [])

    const refreshFeedback = useCallback(async (): Promise<void> => {
        setFeedback([])
    }, [])

    const addFeedback = useCallback((feedback: string) => {
        setFeedback((prev) => [...prev, feedback])
    }, [])

    useEffect(() => {
        refreshUsers()
        refreshFeedback()
    }, [refreshFeedback, refreshUsers])

    return (
        <SemaphoreContext.Provider
            value={{
                _users,
                _feedback,
                refreshUsers,
                addUser,
                refreshFeedback,
                addFeedback
            }}
        >
            {children}
        </SemaphoreContext.Provider>
    )
}

export const useSemaphoreContext = () => {
    const context = useContext(SemaphoreContext)
    if (context === null) {
        throw new Error("SemaphoreContext must be used within a SemaphoreContextProvider")
    }
    return context
}
