import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

export interface RelayMessage{
    toPartyId: number | 'broadcast' ,
    type: string,
    fromPartyId: number,
    payload: unknown,
    timestamp: number
}

export class RelayServer{
    private wss: WebSocketServer
    private parties: Map<number, WebSocket>

    private handleMessage(ws: WebSocket, data: any): void{
        const msg: RelayMessage = JSON.parse(data.toString())
        this.parties.set(msg.fromPartyId, ws)
        
        if (msg.toPartyId === 'broadcast') {
            for (const [id, client] of this.parties) {
                if (id !== msg.fromPartyId && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(msg))
                }
            }
        }
        else {
            const target = this.parties.get(msg.toPartyId)
            if (target?.readyState === WebSocket.OPEN) {
                target.send(JSON.stringify(msg))
            }
        }
    }

    constructor(port: number) {
        const server = createServer()
        this.wss = new WebSocketServer({ server })
        this.parties = new Map()

        server.listen(port, () => {
            console.log(`[Relay] Running on ws://localhost:${port}`)
        })

        this.wss.on('connection', (ws) => {
            ws.on('message', (data) => this.handleMessage(ws, data))
        })
    }
}

export class PartyTransport{
    private ws: WebSocket
    private handlers: Map<string, ((msg: RelayMessage) => void)[]>
    private partyId: number

    register(): void{
        this.send('REGISTER', 'broadcast', {})
    }

    constructor(partyId: number, relayUrl: string){
        this.handlers = new Map()
        this.ws = new WebSocket(relayUrl)
        this.partyId = partyId

        this.ws.on('message', (data: any) => {
            const msg: RelayMessage = JSON.parse(data.toString())
            const msgHandlers = this.handlers.get(msg.type) ?? []
            msgHandlers.forEach(h => h(msg))
        })
    }

    connect(): Promise<void>{
        return new Promise(resolve => {
            if (this.ws.readyState === WebSocket.OPEN) return resolve()
            this.ws.once('open', resolve)
        })
    }

    send(type: string, toPartyId: number | 'broadcast', payload: unknown): void{
        const msg: RelayMessage = {
            type,
            fromPartyId: this.partyId,
            toPartyId,
            payload,
            timestamp: Date.now()
        }
        this.ws.send(JSON.stringify(msg))
    }

    waitFor(type: string, count: number): Promise<RelayMessage[]>{
        return new Promise(resolve => {
            const collected: RelayMessage[] = []

            const handler = (msg:RelayMessage) => {
                collected.push(msg)
                if (collected.length >= count) {
                    resolve(collected)
                }
            }
            const existing = this.handlers.get(type) ?? []
            this.handlers.set(type, [...existing, handler])
        })
    }




}