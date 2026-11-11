# Liftelo SaaS Roadmap (Multi-Company, Trial, Billing, SSO)

## Goals
- Omoguciti self-serve registraciju i onboarding.
- Podrzati vise kompanija po istom korisniku (workspace model).
- Uvesti trial + subscription + seat billing.
- Uvesti Google/Apple login bez narusavanja tenant sigurnosti.
- Zadrzati stabilnost operativnih modula (RMS, Intervencije, Work Orders).

## Core Product Model

### 1) Identity vs Workspace
- **Identity (User account):** jedna osoba, jedan login (email/Google/Apple).
- **Workspace/Tenant (Company):** poslovni prostor s vlastitim podacima i billingom.
- **Membership:** korisnik moze biti clan vise kompanija, s razlicitim rolama po kompaniji.

### 2) Billing Scope
- Billing je na **company** razini, ne na global user razini.
- Plan i limiti (seats, feature flags) pripadaju kompaniji.

### 3) Role Scope
- Role su po membershipu (`user_companies.role`): owner, admin, technician/member.

## Non-Negotiable Safety Rules
- Svi read/write upiti moraju biti tenant-scoped (`company_id`).
- Entitlement lock (trial expired / unpaid) se provodi na backend middleware razini.
- Nema implicitnog cross-company pristupa.
- Invite flow nikad ne smije auto-spajati korisnike bez eksplicitnog membershipa.
- SSO se mapira na identity, ne direktno na company bez provjere membershipa.

## Data Model (Target)

### Existing
- `users`
- `companies`
- `user_companies`

### Add
- `company_subscriptions`
  - `company_id`
  - `status` (`trial`, `active`, `past_due`, `canceled`, `suspended`)
  - `plan_id`
  - `trial_ends_at`
  - `current_period_end`
- `subscription_plans`
  - naziv plana
  - limits (max admins, max technicians, max locations, feature flags)
- `user_identities`
  - `user_id`
  - `provider` (`local`, `google`, `apple`)
  - `provider_sub`
  - `email_at_link_time`
- `company_invites`
  - invite token, role, email, expires_at, company_id
- (optional) `company_usage_snapshots` za billing izvjestaje

## UX Model (Slack-like Workspace Switch)
- Jedan login -> vise workspaceova.
- U headeru/company switcher:
  - aktivna kompanija
  - popis dostupnih kompanija
  - "Create Company"
- UI i permissioni se racunaju iz:
  - `active_company_id` u sesiji
  - membership role za taj tenant

## Self-Serve Company Creation
Korisnik sam kreira novu kompaniju i postaje owner/admin.

### Rules
- Svaki registrirani korisnik moze kreirati kompaniju.
- Na create:
  1. kreira se `companies` red
  2. kreira se `user_companies` membership kao `owner` (ili `admin`)
  3. postavlja se inicijalni trial subscription
  4. userov `active_company_id` se prebacuje na novu kompaniju
- Ovo ne dira postojeca clanstva korisnika u drugim kompanijama.

### Guardrails
- Rate limit za create company endpoint.
- Audit log za create/rename/delete-sensitive operacije.
- Optional anti-abuse (max broj kompanija po useru na free tieru).

## Trial + Subscription Lifecycle

### Trial
- Default npr. 14 dana.
- Tijekom triala: puni pristup.

### Expired Trial / Past Due
- Prelazak u:
  - read-only mod za operativne write akcije
  - billing stranica ostaje dostupna
- Jasni banneri i upgrade CTA.

### Active Subscription
- Full access prema plan limits.
- Seat limit enforcement:
  - dodavanje novih clanova blokirano kad je limit probijen
  - postojeci clanovi nastavljaju raditi (po policyu)

## Invite & Membership Flow

### If invited email already exists
- Ne kreirati novi user.
- Kreirati samo membership (`user_companies`) za ciljnu kompaniju.

### If invited email does not exist
- Kreirati invite token.
- User kroz accept-invite flow kreira identity i automatski dobije membership.

## Google/Apple SSO Strategy
- OIDC providers.
- Login mapiranje:
  1. po `provider_sub`
  2. fallback po emailu (uz stroga pravila)
- Nakon login-a:
  - ucitati companies gdje user ima membership
  - ako vise kompanija, prikazati workspace picker.
- Nema auto-join po domeni bez invite/member pravila.

## Backend Enforcement Layers

### Middleware A: Auth
- Provjera sesije + identity.

### Middleware B: Company Context
- `active_company_id` mora biti u membership listi usera.

### Middleware C: Entitlements
- Provjera subscription statusa + plan limit/feature flag.
- Write endpointi blokirani kada treba.

### Middleware D: Role
- owner/admin/technician prava po aktivnoj kompaniji.

## Phased Delivery Plan

### Phase 1 - Foundation
- Standardizirati membership model kao source of truth.
- Stabilizirati active company switching i role refresh.
- Dodati `company_subscriptions`, `subscription_plans`.

### Phase 2 - Self-Serve Company
- `Create Company` flow + inicijalni trial.
- Workspace switcher UX hardening.

### Phase 3 - Billing Controls
- Trial countdown, expired behavior, seat limits.
- Upgrade prompts i lock pravila.

### Phase 4 - Invite/Membership Expansion
- Existing-user invite attach.
- Non-existing-user invite accept.

### Phase 5 - Google SSO
- OIDC login + identity linking + workspace selection.

### Phase 6 - Apple SSO
- Apple provider, relay email handling, account linking polish.

## Operational Checklist (Before Each Release)
- Tenant-safety regression test.
- Role/entitlement regression test.
- Session + active company switching test.
- PDF/export test pod subscription lock pravilima.
- Staging soak test + rollback plan.

## Immediate Next Step
Implementirati Phase 1 tech design doc + DB migration spec prije codinga.
