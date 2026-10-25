export type BillingPlan = {
  id: number
  code: string
  name: string
  billing_interval: 'monthly' | 'yearly'
  price_cents: number
  seats_included: number
  trial_days: number
}

export type CompanySubscription = {
  id: number
  company_id: number
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended'
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  seats_override: number | null
  plan: BillingPlan
}

export type BillingCurrent = {
  company_id: number
  subscription: CompanySubscription | null
  usage: {
    active_members: number
    admins: number
    technicians: number
    seat_limit: number
    pending_invites: number
    reserved_seats: number
    seats_remaining: number
    can_add_members: boolean
  }
}
