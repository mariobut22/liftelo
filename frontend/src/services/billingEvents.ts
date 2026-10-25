type PaymentRequiredPayload = {
  message: string
  url?: string
}

const EVENT_NAME = 'liftelo:payment-required'

export const emitPaymentRequired = (payload: PaymentRequiredPayload) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }))
}

export const onPaymentRequired = (handler: (payload: PaymentRequiredPayload) => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const listener = (event: Event) => {
    const custom = event as CustomEvent<PaymentRequiredPayload>
    if (!custom.detail) return
    handler(custom.detail)
  }

  window.addEventListener(EVENT_NAME, listener)
  return () => window.removeEventListener(EVENT_NAME, listener)
}
