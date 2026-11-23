import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../ui/button'
import { rmsFrequencyLabel } from '../../../lib/rmsFrequency'
import ShareLinkCard from '../ShareLinkCard'
import { InfoRow, Section } from './ProfileParts'

type LocationInfo = {
  address?: string | null
  contact_person?: string | null
  contact_phone?: string | null
  upravitelj?: string | null
  kljuc_strojarnice?: string | null
  notes?: string | null
  rms_frequency?: number | null
}

/** Info tab: all saved details of the location and (admin) the edit button and the building-manager share link. */
function InfoPanel({ location, locationId, isAdmin, onEdit }: { location: LocationInfo; locationId: number; isAdmin: boolean; onEdit: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <Section
        title={t('locations:locationDetail.infoPanel.details')}
        testId="info-details"
        action={
          isAdmin ? (
            <Button size="sm" variant="secondary" onClick={onEdit} data-testid="edit-location">
              <Pencil className="h-4 w-4" />
              {t('locations:locationDetail.editLocation')}
            </Button>
          ) : undefined
        }
      >
        <dl className="space-y-2.5">
          <InfoRow label={t('common:labels.address')}>{location.address || '—'}</InfoRow>
          <InfoRow label={t('locations:locationDetail.contactPerson2')}>{location.contact_person || '—'}</InfoRow>
          <InfoRow label={t('common:labels.phone')}>
            {location.contact_phone ? (
              <a className="underline underline-offset-2" href={`tel:${location.contact_phone.replace(/[^+\d]/g, '')}`}>
                {location.contact_phone}
              </a>
            ) : (
              '—'
            )}
          </InfoRow>
          <InfoRow label={t('locations:locationDetail.propertyManager2')}>{location.upravitelj || '—'}</InfoRow>
          <InfoRow label={t('locations:locationDetail.machineRoomKey2')}>{location.kljuc_strojarnice || '—'}</InfoRow>
          <InfoRow label={t('locations:locationDetail.rmsFrequency2')}>{rmsFrequencyLabel(t, location.rms_frequency ?? 1)}</InfoRow>
          <InfoRow label={t('common:labels.comment')}>{location.notes || '—'}</InfoRow>
        </dl>
      </Section>
      {isAdmin ? <ShareLinkCard locationId={locationId} /> : null}
    </div>
  )
}

export default InfoPanel
