import { Trans, useTranslation } from 'react-i18next'

import { legalUrl } from '../../config/legal'

type LegalConsentProps = {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

const linkClass = 'font-medium text-slate-900 underline underline-offset-2'

/** Checkbox "I accept the Terms and the Privacy Policy" with links to the public legal pages. */
function LegalConsent({ id = 'accept_terms', checked, onChange }: LegalConsentProps) {
  const { i18n } = useTranslation()

  return (
    <div className="flex items-start gap-3 text-sm text-slate-600">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
        required
      />
      <label htmlFor={id}>
        <Trans
          i18nKey="auth:legal.acceptTermsAndPrivacy"
          components={{
            terms: <a href={legalUrl('terms', i18n.language)} target="_blank" rel="noopener noreferrer" className={linkClass} />,
            privacy: <a href={legalUrl('privacy', i18n.language)} target="_blank" rel="noopener noreferrer" className={linkClass} />,
          }}
        />
      </label>
    </div>
  )
}

export default LegalConsent
