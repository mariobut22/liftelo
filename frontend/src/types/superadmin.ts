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

/** ---- Phase 3 "nadzor" (GET /api/superadmin/{revenue,health,audit,growth}) ---- */

export interface SuperadminRevenue {
  currency: string
  summary: {
    /** monthly recurring revenue in cents: status active, workspace not locked, plan price > 0, not a free period granted by a superadmin */
    mrr_cents: number
    mrr_stripe_cents: number
    mrr_manual_cents: number
    arr_cents: number
    paying_companies: number
    free_granted: number
    active_free_plan: number
    trial_active: number
    trial_expired: number
    past_due: number
    suspended: number
    canceled: number
    companies_total: number
    without_subscription: number
  }
  by_plan: Array<{
    plan_code: string
    plan_name: string
    price_cents: number | null
    total: number
    trial: number
    paying: number
    free_granted: number
    other: number
    mrr_cents: number
  }>
  upcoming_trials: Array<{ company_id: number; company_name: string; plan_code: string; trial_ends_at: string | null }>
  churn: { canceled_last_30_days: number; canceled_total: number; basis: string }
  conversion: { cohort_trials_ended_90d: number; converted_to_paid: number; rate: number | null; basis: string }
}

export interface SuperadminHealth {
  generated_at: string
  database: { ok: boolean; ping_ms: number | null }
  outbox:
    | { available: false }
    | {
        available: true
        pending: number
        sending: number
        sent: number
        failed: number
        sent_last_24h: number
        failed_last_24h: number
        pending_last_24h: number
        oldest_pending_at: string | null
        last_failed: Array<{ id: number; type: string | null; company_id: number | null; attempts: number; created_at: string | null; error: string | null }>
      }
  billing:
    | { available: false }
    | {
        available: true
        last_event_at: string | null
        last_7_days: { processed: number; ignored: number; failed: number }
        last_failed: Array<{ id: number; provider: string; event_type: string | null; processed_at: string | null; error: string | null }>
      }
  uploads: { available: boolean; files: number; bytes: number; truncated: boolean }
  app: { version: string | null; commit: string | null; node: string; env: string | null; uptime_seconds: number; started_at: string }
}

export interface SuperadminAuditEntry {
  id: number
  created_at: string | null
  action: string
  user_id: number | null
  user_email: string | null
  company_id: number | null
  company_name: string | null
  /** sanitized by the backend (secret-looking keys replaced, long text cut) */
  metadata: Record<string, unknown> | null
}

export interface SuperadminAuditPage {
  limit: number
  offset: number
  has_more: boolean
  rows: SuperadminAuditEntry[]
  /** distinct action names, only on the first page (offset 0) */
  actions?: string[]
}

export interface SuperadminAuditFilters {
  company_id?: string
  user_id?: string
  action?: string
  scope?: 'superadmin'
  from?: string
  to?: string
}

export interface SuperadminGrowth {
  weeks: Array<{ week_start: string; new_companies: number; new_users: number; active_companies: number }>
  totals: { new_companies: number; new_users: number }
}
