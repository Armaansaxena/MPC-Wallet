import { randomScalar, polyEval, scalarAdd, scalarMul, scalarInv, scalarMultG, pointAdd, pointFromHex, pointToHex, type Scalar, type Point } from './field.js'

export interface DKGRound1Broadcast{
    fromPartyId: number,
    commitments: string[]
}

export interface DKGPrivateShare{
    fromPartyId: number,
    toPartyId: number,
    privateShare: string
}

export interface DKGOutput{
    partyId: number,
    secretShare: Scalar,
    publicKey: string,
    commitments: Map<number,string[]>
}

export class DKGSession{
    private partyId: number
    private threshold: number
    private totalParties: number

    private polynomial: Scalar[]
    private recievedShares: Map<number, Scalar>
    private recievedBroadcasts: Map<number, DKGRound1Broadcast>

    constructor (partyId: number, threshold: number, totalParties: number){
        this.partyId = partyId;
        this.threshold = threshold;
        this.totalParties = totalParties;

        this.polynomial = []
        this.recievedShares = new Map()
        this.recievedBroadcasts = new Map()
    }

    generatePolynomial(): void {
        for (let i = 0; i < this.threshold; i++) {
            let generatedPolynomial = randomScalar();
            this.polynomial.push(generatedPolynomial);
        }
    }

    getRound1Broadcast(): DKGRound1Broadcast{
        this.generatePolynomial();
        const commitment = this.polynomial.map(coeff => pointToHex(scalarMultG(coeff)));

        return {
            fromPartyId: this.partyId,
            commitments: commitment
        }
    }

    getPrivateShareFor(targetId: number): DKGPrivateShare{
        let result = 0n
        let xPow = 1n  // this tracks x^i — starts at x^0 = 1
        const x = BigInt(targetId)
        for (let i = 0; i < this.polynomial.length; i++) {
            const term = scalarMul(this.polynomial[i], xPow)
            result = scalarAdd(result, term)
            xPow = scalarMul(xPow, x)  // x^i becomes x^(i+1)
        }
        const ans = result.toString(16).padStart(64, '0')
        return {
            fromPartyId: this.partyId,
            toPartyId: targetId,
            privateShare: ans
        }
    }

    receiveShare(privateShare: DKGPrivateShare, broadcast: DKGRound1Broadcast): void{
        const x = BigInt(this.partyId)
        let xPow = x;
        let expected = pointFromHex(broadcast.commitments[0])

        const share = BigInt('0x' + privateShare.privateShare)
        const actual = scalarMultG(share);

        for (let i = 1; i < broadcast.commitments.length; i++) {
            const ci = pointFromHex(broadcast.commitments[i])
            expected = pointAdd(expected, ci.multiply(xPow))
            xPow = scalarMul(xPow, x)
        }

       if (pointToHex(actual) !== pointToHex(expected)) {
            throw new Error(`Invalid share from party ${privateShare.fromPartyId}`)
        }
        this.recievedShares.set(privateShare.fromPartyId, share)
        this.recievedBroadcasts.set(privateShare.fromPartyId, broadcast)
    }

    finalize(): DKGOutput{
        let secretShare = polyEval(this.polynomial, BigInt(this.partyId))
        for (const share of this.recievedShares.values()) {
            secretShare = scalarAdd(secretShare, share);
        }

        let publicKeyPoint = scalarMultG(this.polynomial[0]);

        for (const broadcast of this.recievedBroadcasts.values()) {
            publicKeyPoint = pointAdd(publicKeyPoint, pointFromHex(broadcast.commitments[0]));    
        }

        const pubKey = pointToHex(publicKeyPoint);

        const allCommitments = new Map<number, string[]>()
        for (const [id, broadcast] of this.recievedBroadcasts.entries()) {
            allCommitments.set(id, broadcast.commitments)
        }

        return {
            partyId: this.partyId,
            secretShare: secretShare,
            publicKey: pubKey,
            commitments: allCommitments
        }
        
    }

}