import i18n, { normalizeLanguage } from '../i18n'
import { API_BASE_URL } from '../services/api'

/** URL of a PDF export. The PDF is generated in the language the user currently uses in the app (?lang=hr|en). */
export const pdfUrl = (apiPath: string, language?: string): string =>
  `${API_BASE_URL}${apiPath}?lang=${normalizeLanguage(language ?? i18n.language)}`
