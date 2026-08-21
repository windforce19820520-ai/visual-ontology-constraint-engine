export interface RequestQuotaState {
  day: string
  active: number
  dailyCalls: number
  sessionCalls: Record<string, number>
  clientCalls: Record<string, number>
  providerRecent: Record<string, number[]>
}

export interface RequestQuotaStore {
  transaction<T>(operation: (state: RequestQuotaState) => T): T
}

export class InMemoryRequestQuotaStore implements RequestQuotaStore {
  private readonly state: RequestQuotaState = { day: '', active: 0, dailyCalls: 0, sessionCalls: {}, clientCalls: {}, providerRecent: {} }
  transaction<T>(operation: (state: RequestQuotaState) => T): T { return operation(this.state) }
}

export interface RequestQuotaLimits {
  perSessionCalls: number
  perClientCalls: number
  dailyCalls: number
  maxConcurrent: number
  providerCallsPerMinute: Readonly<Record<string, number>>
  now?: () => number
}

export interface RequestQuotaReservation { id: string }

export class RequestQuotaGate {
  private sequence = 0
  constructor(readonly store: RequestQuotaStore, readonly limits: RequestQuotaLimits) {
    for (const value of [limits.perSessionCalls, limits.perClientCalls, limits.dailyCalls, limits.maxConcurrent]) if (!Number.isInteger(value) || value <= 0) throw new Error('PLAYGROUND_QUOTA_LIMIT_INVALID')
  }
  private now(): number { return (this.limits.now ?? Date.now)() }
  reserve(identity: { sessionId: string; clientId: string; provider: string }): RequestQuotaReservation {
    const now = this.now()
    return this.store.transaction((state) => {
      const day = new Date(now).toISOString().slice(0, 10)
      if (state.day !== day) {
        state.day = day; state.dailyCalls = 0; state.sessionCalls = {}; state.clientCalls = {}; state.providerRecent = {}
      }
      const recent = (state.providerRecent[identity.provider] ?? []).filter((at) => now - at < 60_000)
      const providerLimit = this.limits.providerCallsPerMinute[identity.provider]
      if (state.active >= this.limits.maxConcurrent) throw new Error('RATE_LIMIT_CONCURRENCY_EXCEEDED')
      if ((state.sessionCalls[identity.sessionId] ?? 0) >= this.limits.perSessionCalls) throw new Error('SESSION_QUOTA_EXCEEDED')
      if ((state.clientCalls[identity.clientId] ?? 0) >= this.limits.perClientCalls) throw new Error('CLIENT_QUOTA_EXCEEDED')
      if (state.dailyCalls >= this.limits.dailyCalls) throw new Error('DAILY_CALL_BUDGET_EXCEEDED')
      if (providerLimit !== undefined && recent.length >= providerLimit) throw new Error('PROVIDER_RATE_LIMIT_EXCEEDED')
      state.active += 1
      state.dailyCalls += 1
      state.sessionCalls[identity.sessionId] = (state.sessionCalls[identity.sessionId] ?? 0) + 1
      state.clientCalls[identity.clientId] = (state.clientCalls[identity.clientId] ?? 0) + 1
      state.providerRecent[identity.provider] = [...recent, now]
      return { id: `request-quota-${++this.sequence}` }
    })
  }
  release(_reservation: RequestQuotaReservation): void { this.store.transaction((state) => { state.active = Math.max(0, state.active - 1) }) }
  snapshot(): RequestQuotaState { return this.store.transaction((state) => JSON.parse(JSON.stringify(state)) as RequestQuotaState) }
}
