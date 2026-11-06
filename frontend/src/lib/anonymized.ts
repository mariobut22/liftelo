// Users whose personal data was erased (backend: utils/userPrivacy.js) keep their account row with a placeholder e-mail.
const ANONYMIZED_EMAIL_SUFFIX = '@anonymized.invalid'

export const isAnonymizedEmail = (email?: string | null) => Boolean(email && email.toLowerCase().endsWith(ANONYMIZED_EMAIL_SUFFIX))

/** 'removed-user-12@anonymized.invalid' -> 12 (null when the e-mail is not a placeholder) */
export const anonymizedUserNumber = (email?: string | null): number | null => {
  const match = /^removed-user-(\d+)@/i.exec(email || '')
  return isAnonymizedEmail(email) && match ? Number(match[1]) : null
}
