export type SuperadminSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended'

/** Subscription of a company (company_subscriptions + subscription_plans). `null` on the row = company has no subscription row. */
export interface SuperadminSubscription {
  status: SuperadminSubscriptionStatus
  plan_code: string
  plan_name: string
  /** monthly plan price in cents (EUR) */
  price_cents: number | null
  trial_ends_at: string | null
  current_period_start?: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  /** Stripe customer is linked (the id itself is never sent) */
  has_stripe: boolean
  /** a Stripe subscription is linked: plan/trial/grant/suspend/cancel actions are refused (409 stripe_managed) */
  stripe_managed?: boolean
}

export interface SuperadminCompanyRow {
  id: number
  name: string
  created_at: string
  /** real subscription status; null = no subscription row */
  subscription_status: SuperadminSubscriptionStatus | null
  subscription_plan: string | null
  subscription: SuperadminSubscription | null
  /** effective limits (company override else plan); null = unlimited */
  limits: {
    admin: number | null
    technician: number | null
    admin_override: boolean
    technician_override: boolean
  }
  /** active members per role (user_companies JOIN users, is_active = 1) */
  usage: { admins: number; technicians: number; viewers: number }
  /** derived by getAccessState: locked workspace and why */
  access: { locked: boolean; reason: 'subscription_inactive' | 'trial_expired' | null }
  /** active members (user_companies) */
  total_users: number
  total_locations: number
  total_rms: number
  total_interventions: number
  total_work_orders: number
  /** latest RMS / intervention / work order creation or recorded login; null = none */
  last_activity_at: string | null
  last_login_at: string | null
}

export interface SuperadminStats {
  totalCompanies: number
  totalUsers: number
  totalRms: number
  totalInterventions: number
  /** companies per plan code ('none' = no subscription) */
  byPlan?: Record<string, number>
  /** companies per subscription status ('none' = no subscription) */
  byStatus?: Record<string, number>
}

export type CompanyMemberRole = 'admin' | 'technician' | 'viewer'

export interface SuperadminMember {
  id: number
  email: string | null
  full_name: string | null
  role: CompanyMemberRole
  is_active: boolean
  disabled_at: string | null
  is_superadmin: boolean
  is_self: boolean
  /** memberships in OTHER companies (disabling affects the whole account) */
  other_companies: number
  joined_at: string | null
  last_login_at: string | null
}

export interface SuperadminInvitation {
  id: number
  email: string
  role: CompanyMemberRole
  expires_at: string | null
  created_at: string | null
}

export interface SuperadminAuditMetadata {
  reason?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  target_user_id?: number
  target_email?: string
  months?: number
  restored_status?: string
  other_companies?: number
  attempted_action?: string
}

export interface SuperadminAuditRow {
  id: number
  action: string
  user_id: number | null
  user_email: string | null
  created_at: string | null
  /** only filled for superadmin_* actions */
  metadata: SuperadminAuditMetadata | null
}

export interface SuperadminPlanOption {
  code: string
  name: string
  price_cents: number | null
  admin_limit: number | null
  technician_limit: number | null
  trial_days: number
}

export interface SuperadminCompanyDetail extends SuperadminCompanyRow {
  total_elevators: number
  /** limits of the plan itself (without company overrides); null = unlimited */
  plan_limits: { admin: number | null; technician: number | null }
  members: SuperadminMember[]
  invitations: SuperadminInvitation[]
  audit: SuperadminAuditRow[]
  plans: SuperadminPlanOption[]
}

export type SuperadminActionPath =
  | 'plan'
  | 'trial'
  | 'grant-free-period'
  | 'limits'
  | 'suspend'
  | 'unsuspend'
  | 'cancel'
  | `users/${number}/disable`
  | `users/${number}/enable`
  | `users/${number}/remove`
  | `users/${number}/role`
