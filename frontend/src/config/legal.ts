// Public legal pages (Terms, Privacy Policy, DPA). They live on the marketing site, not in the app.
// The final URLs are decided at go-live (docs/release-checklist.md): override them at build time with
//   VITE_LEGAL_PRIVACY_URL / VITE_LEGAL_TERMS_URL / VITE_LEGAL_DPA_URL            (all languages)
//   VITE_LEGAL_PRIVACY_URL_HR / _EN, VITE_LEGAL_TERMS_URL_HR / _EN, ...           (one language, wins over the generic one)
// Defaults match the file names of the drafts in docs/legal-drafts/site/.

export type LegalDocument = 'privacy' | 'terms' | 'dpa'
type LegalLanguage = 'hr' | 'en'

const SITE = 'https://liftelo.app'

const DEFAULT_URLS: Record<LegalLanguage, Record<LegalDocument, string>> = {
  hr: {
    privacy: `${SITE}/privatnost.html`,
    terms: `${SITE}/uvjeti.html`,
    dpa: `${SITE}/obrada-podataka.html`,
  },
  en: {
    privacy: `${SITE}/privacy.html`,
    terms: `${SITE}/terms.html`,
    dpa: `${SITE}/dpa.html`,
  },
}

const ENV = import.meta.env as Record<string, string | undefined>

const ENV_PREFIX: Record<LegalDocument, string> = {
  privacy: 'VITE_LEGAL_PRIVACY_URL',
  terms: 'VITE_LEGAL_TERMS_URL',
  dpa: 'VITE_LEGAL_DPA_URL',
}

export function legalUrl(document: LegalDocument, language: string): string {
  const lang: LegalLanguage = language === 'hr' ? 'hr' : 'en'
  const prefix = ENV_PREFIX[document]
  const specific = ENV[`${prefix}_${lang.toUpperCase()}`]?.trim()
  const generic = ENV[prefix]?.trim()
  return specific || generic || DEFAULT_URLS[lang][document]
}
