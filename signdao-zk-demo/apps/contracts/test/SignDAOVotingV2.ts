import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { Group, Identity, generateProof } from "@semaphore-protocol/core";
import { expect } from "chai";
import { ethers, run } from "hardhat";

describe("SignDAOVotingV2", () => {
    const YES = 1n;
    const NO = 2n;

    async function deployFixture() {
        const [admin, relayer, attacker] = await ethers.getSigners();

        const { semaphore } = await run("deploy:semaphore", { logs: false });
        const SemaphoreContract = semaphore;

        const Factory = await ethers.getContractFactory("SignDAOVotingV2");
        const voting = await Factory.deploy(await SemaphoreContract.getAddress());
        await voting.waitForDeployment();

        const groupId = await voting.groupId();
        const group = new Group();

        const alice = new Identity();
        const bob = new Identity();
        const mallory = new Identity();

        await voting.addMember(alice.commitment);
        group.addMember(alice.commitment);

        await voting.addMember(bob.commitment);
        group.addMember(bob.commitment);

        const now = await time.latest();
        const metadataHash = ethers.keccak256(ethers.toUtf8Bytes("Proposal 1"));

        await voting.createProposal(metadataHash, now, now + 3600);
        const proposalId = 1n;

        return {
            admin,
            relayer,
            attacker,
            SemaphoreContract,
            voting,
            groupId,
            group,
            alice,
            bob,
            mallory,
            proposalId
        };
    }

    async function makeProof(
        voting: any,
        identity: Identity,
        group: Group,
        proposalId: bigint,
        choice: bigint
    ) {
        const scope = await voting.scopeForProposal(proposalId);
        return generateProof(identity, group, choice, scope);
    }

    it("makes the voting contract the Semaphore group admin", async () => {
        const { SemaphoreContract, voting, groupId } = await loadFixture(deployFixture);

        expect(await SemaphoreContract.getGroupAdmin(groupId)).to.equal(
            await voting.getAddress()
        );
    });

    it("allows only the deployment admin to add members", async () => {
        const { voting, attacker } = await loadFixture(deployFixture);
        const identity = new Identity();

        await expect(
            voting.connect(attacker).addMember(identity.commitment)
        ).to.be.revertedWithCustomError(voting, "Unauthorized");
    });

    it("rejects duplicate identity commitments", async () => {
        const { voting, alice } = await loadFixture(deployFixture);

        await expect(voting.addMember(alice.commitment))
            .to.be.revertedWithCustomError(voting, "MemberAlreadyAdded")
            .withArgs(alice.commitment);
    });

    it("allows only the admin to create proposals", async () => {
        const { voting, attacker } = await loadFixture(deployFixture);
        const now = await time.latest();

        await expect(
            voting
                .connect(attacker)
                .createProposal(ethers.ZeroHash, now, now + 100)
        ).to.be.revertedWithCustomError(voting, "Unauthorized");
    });

    it("counts a valid YES vote", async () => {
        const { voting, group, alice, proposalId } = await loadFixture(deployFixture);
        const proof = await makeProof(voting, alice, group, proposalId, YES);

        await voting.castVote(proposalId, YES, proof);

        const proposal = await voting.proposals(proposalId);
        expect(proposal.yesVotes).to.equal(1n);
        expect(proposal.noVotes).to.equal(0n);
    });

    it("counts a valid NO vote", async () => {
        const { voting, group, alice, proposalId } = await loadFixture(deployFixture);
        const proof = await makeProof(voting, alice, group, proposalId, NO);

        await voting.castVote(proposalId, NO, proof);

        const proposal = await voting.proposals(proposalId);
        expect(proposal.yesVotes).to.equal(0n);
        expect(proposal.noVotes).to.equal(1n);
    });

    it("allows a relayer to submit a member's proof", async () => {
        const { voting, group, alice, relayer, proposalId } =
            await loadFixture(deployFixture);
        const proof = await makeProof(voting, alice, group, proposalId, YES);

        await expect(voting.connect(relayer).castVote(proposalId, YES, proof))
            .to.emit(voting, "VoteCast")
            .withArgs(proposalId, YES, proof.nullifier, relayer.address);
    });

    it("rejects replaying the same proof/nullifier", async () => {
        const { voting, group, alice, proposalId } = await loadFixture(deployFixture);
        const proof = await makeProof(voting, alice, group, proposalId, YES);

        await voting.castVote(proposalId, YES, proof);
        await expect(voting.castVote(proposalId, YES, proof)).to.be.reverted;

        const proposal = await voting.proposals(proposalId);
        expect(proposal.yesVotes).to.equal(1n);
    });

    it("allows the same identity to vote in different proposals", async () => {
        const { voting, group, alice, proposalId } = await loadFixture(deployFixture);
        const now = await time.latest();

        await voting.createProposal(
            ethers.keccak256(ethers.toUtf8Bytes("Proposal 2")),
            now,
            now + 3600
        );

        const proposal2 = 2n;
        const proof1 = await makeProof(voting, alice, group, proposalId, YES);
        const proof2 = await makeProof(voting, alice, group, proposal2, NO);

        await voting.castVote(proposalId, YES, proof1);
        await voting.castVote(proposal2, NO, proof2);

        expect((await voting.proposals(proposalId)).yesVotes).to.equal(1n);
        expect((await voting.proposals(proposal2)).noVotes).to.equal(1n);
        expect(proof1.nullifier).to.not.equal(proof2.nullifier);
    });

    it("rejects message substitution without consuming the valid proof", async () => {
        const { voting, group, alice, proposalId } = await loadFixture(deployFixture);
        const proof = await makeProof(voting, alice, group, proposalId, YES);

        await expect(voting.castVote(proposalId, NO, proof))
            .to.be.revertedWithCustomError(voting, "ProofMessageMismatch")
            .withArgs(NO, YES);

        await expect(voting.castVote(proposalId, YES, proof)).to.not.be.reverted;
        expect((await voting.proposals(proposalId)).yesVotes).to.equal(1n);
    });

    it("rejects a proof scoped to another proposal without consuming it", async () => {
        const { voting, group, alice, proposalId } = await loadFixture(deployFixture);
        const now = await time.latest();

        await voting.createProposal(
            ethers.keccak256(ethers.toUtf8Bytes("Proposal 2")),
            now,
            now + 3600
        );

        const proofForProposal1 = await makeProof(
            voting,
            alice,
            group,
            proposalId,
            YES
        );

        await expect(voting.castVote(2n, YES, proofForProposal1))
            .to.be.revertedWithCustomError(voting, "ProofScopeMismatch");

        await expect(
            voting.castVote(proposalId, YES, proofForProposal1)
        ).to.not.be.reverted;
    });

    it("rejects a valid proof from a foreign group", async () => {
        const { voting, mallory, proposalId } = await loadFixture(deployFixture);

        const foreignGroup = new Group();
        foreignGroup.addMember(mallory.commitment);

        const scope = await voting.scopeForProposal(proposalId);
        const foreignProof = await generateProof(mallory, foreignGroup, YES, scope);

        await expect(
            voting.castVote(proposalId, YES, foreignProof)
        ).to.be.reverted;

        expect((await voting.proposals(proposalId)).yesVotes).to.equal(0n);
    });

    it("rejects a malformed Groth16 proof without changing totals", async () => {
        const { voting, group, alice, proposalId } = await loadFixture(deployFixture);
        const proof = await makeProof(voting, alice, group, proposalId, YES);

        const malformed = {
            ...proof,
            points: [...proof.points] as bigint[]
        };
        malformed.points[0] = BigInt(malformed.points[0]) + 1n;

        await expect(
            voting.castVote(proposalId, YES, malformed)
        ).to.be.reverted;

        expect((await voting.proposals(proposalId)).yesVotes).to.equal(0n);
    });

    it("enforces the half-open voting window", async () => {
        const { voting, group, alice } = await loadFixture(deployFixture);
        const now = await time.latest();

        await voting.createProposal(
            ethers.keccak256(ethers.toUtf8Bytes("Future proposal")),
            now + 100,
            now + 200
        );

        const proposalId = 2n;
        const proof = await makeProof(voting, alice, group, proposalId, YES);

        await expect(voting.castVote(proposalId, YES, proof))
            .to.be.revertedWithCustomError(voting, "VotingNotStarted");

        await time.increaseTo(now + 100);
        await expect(voting.castVote(proposalId, YES, proof)).to.not.be.reverted;
    });

    it("rejects a vote at or after endsAt", async () => {
        const { voting, group, alice } = await loadFixture(deployFixture);
        const now = await time.latest();

        await voting.createProposal(
            ethers.keccak256(ethers.toUtf8Bytes("Short proposal")),
            now,
            now + 100
        );

        const proposalId = 2n;
        const proof = await makeProof(voting, alice, group, proposalId, YES);

        await time.increaseTo(now + 100);

        await expect(voting.castVote(proposalId, YES, proof))
            .to.be.revertedWithCustomError(voting, "VotingEnded");
    });

    it("domain-separates scopes across SignDAO deployments", async () => {
        const {
            SemaphoreContract,
            voting,
            group,
            alice,
            proposalId
        } = await loadFixture(deployFixture);

        const Factory = await ethers.getContractFactory("SignDAOVotingV2");
        const votingB = await Factory.deploy(await SemaphoreContract.getAddress());
        await votingB.waitForDeployment();

        await votingB.addMember(alice.commitment);
        const now = await time.latest();
        await votingB.createProposal(
            ethers.keccak256(ethers.toUtf8Bytes("Proposal 1")),
            now,
            now + 3600
        );

        const proofForA = await makeProof(voting, alice, group, proposalId, YES);

        await expect(votingB.castVote(1n, YES, proofForA))
            .to.be.revertedWithCustomError(votingB, "ProofScopeMismatch");
    });

    it("keeps totals equal to successful vote count", async () => {
        const { voting, group, alice, bob, proposalId } =
            await loadFixture(deployFixture);

        const aliceProof = await makeProof(voting, alice, group, proposalId, YES);
        const bobProof = await makeProof(voting, bob, group, proposalId, NO);

        await voting.castVote(proposalId, YES, aliceProof);
        await voting.castVote(proposalId, NO, bobProof);

        const proposal = await voting.proposals(proposalId);
        expect(proposal.yesVotes + proposal.noVotes).to.equal(2n);
    });
});
