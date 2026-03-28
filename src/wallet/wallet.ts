import { RelayMessage, PartyTransport } from "../network/relay.js";
import { DKGSession, type DKGOutput } from "../crypto/dkg.js";
import { SigningSession, combineSignatures } from "../crypto/tss.js";

export class MPCWallet{
    private partyId: number
    private threshold: number
    private totalParties: number
    private transport: PartyTransport
    private dkgOutput?: DKGOutput

    constructor(partyId: number, threshold: number, totalParties: number, transport: PartyTransport) {
        this.partyId = partyId
        this.threshold = threshold
        this.totalParties = totalParties
        this.transport = transport

    }

    async generateKey(): Promise<string>{
        const session = new DKGSession(this.partyId, this.threshold, this.totalParties)
        const broadcast = session.getRound1Broadcast()
        this.transport.send('DKG_BROADCAST', 'broadcast', broadcast)

        const otherBroadcasts = await this.transport.waitFor('DKG_BROADCAST', this.totalParties - 1)

        for (let i = 1; i <= this.totalParties; i++) {
            if (i === this.partyId) continue
            const share = session.getPrivateShareFor(i)
            this.transport.send('DKG_SHARE', i, share)
        }

        const otherShares = await this.transport.waitFor('DKG_SHARE', this.totalParties - 1);

        for (const msg of otherShares) {
            const share = msg.payload as any
            const matchingBroadcast = otherBroadcasts.find(
                b => (b.payload as any).fromPartyId === share.fromPartyId
            )!

            session.receiveShare(share, matchingBroadcast.payload as any)
        }

        this.dkgOutput = session.finalize()
        return this.dkgOutput.publicKey
    }

    async sign(messageHash: Uint8Array): Promise<{ r: bigint, s: bigint }> {
        
        if (!this.dkgOutput) throw new Error('Run generateKey() first')
        
        // Get -> Send -> Wait (Round 1)
        const session = new SigningSession(this.partyId, this.dkgOutput)
        const round1 = session.round1()
        this.transport.send('SIGN_ROUND1', 'broadcast', round1)
        const otherRound1 = await this.transport.waitFor('SIGN_ROUND1', this.threshold - 1)
        
        // Get -> Send -> Wait (Round 2)
        const round2 = session.round2()
        this.transport.send('SIGN_ROUND2', 'broadcast', round2)
        const otherRound2 = await this.transport.waitFor('SIGN_ROUND2', this.threshold - 1)

        const otherRound2Data = otherRound2.map(msg => msg.payload as any)
        const partial = session.partialSign(messageHash, otherRound2Data)

        this.transport.send('SIGN_PARTIAL', 'broadcast', partial)
        const otherPartials = await this.transport.waitFor('SIGN_PARTIAL', this.threshold - 1)
        const allPartials = [partial, ...otherPartials.map(msg => msg.payload as any)]

        return combineSignatures(allPartials)
    }

    getSecretShare(): string {
        if (!this.dkgOutput) throw new Error('Run generateKey() first')
        return this.dkgOutput.secretShare.toString(16).padStart(64, '0')
    }

    loadDKGOutput(publicKey: string, secretShare: string): void {
        this.dkgOutput = {
            partyId: this.partyId,
            secretShare: BigInt('0x' + secretShare),
            publicKey,
            commitments: new Map()
        }
    }
}

