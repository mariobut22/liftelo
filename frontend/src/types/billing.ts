export type BillingPlan = {
  id: number
  code: string
  name: string
  billing_interval: 'monthly' | 'yearly'
  price_cents: number
  seats_included: number
  admin_limit: number | null
  technician_limit: number | null
  trial_days: number
  stripe_price_id?: string | null
}

export type CompanySubscription = {
  id: number
  company_id: number
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended'
  trial_ends_at: string | null
  current_period_start?: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  seats_override: number | null
  admin_limit_override: number | null
  technician_limit_override: number | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  plan: BillingPlan
}

export type BillingCurrent = {
  company_id: number
  access?: { locked: boolean; reason: 'trial_expired' | 'subscription_inactive' | null }
  subscription: CompanySubscription | null
  usage: {
    active_members: number
    admins: number
    technicians: number
    admin_limit: number | null
    technician_limit: number | null
    pending_invites: number
    pending_admin_invites: number
    pending_technician_invites: number
    admins_remaining: number | null
    technicians_remaining: number | null
    can_add_admin: boolean
    can_add_technician: boolean
  }
}
