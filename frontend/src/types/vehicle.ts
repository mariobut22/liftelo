export interface Vehicle {
  id: number
  name: string
  year: number
  last_registration_date: string
  registration_expiry_date: string
  image_path?: string | null
}
