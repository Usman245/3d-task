/** Minimal pub/sub. Six event types and three subscribers do not need a library. */
export function createEmitter() {
  const listeners = new Map()

  return {
    on(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(handler)
      return () => listeners.get(type).delete(handler)
    },

    emit(type, payload) {
      const handlers = listeners.get(type)
      if (!handlers) return
      // Copy before iterating: a handler may unsubscribe during dispatch.
      for (const handler of [...handlers]) handler(payload)
    },

    clear() {
      listeners.clear()
    },
  }
}
