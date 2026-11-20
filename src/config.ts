// Salon contact details shown in the customer footer (from the salon's Safe Code profile).
export const SALON = {
  phone: '010 9492 8882',
  /** International format, digits only, for tel: and wa.me links. */
  phoneIntl: '+201094928882',
  whatsapp: '201094928882',
  facebook: 'https://www.facebook.com/share/1EmewG7EQh/',
  instagram: 'https://www.instagram.com/ahmed_ramdan_barbershop1',
  tiktok: 'https://www.tiktok.com/@a.ramadan204',
  snapchat: 'https://snapchat.com/t/tlcu1Fg1',
  instapay: 'https://ipn.eg/S/ahmedramadansamsam/instapay/2AVMpx',
  vodafoneCash: 'http://vf.eg/vfcash?id=mt&qrId=7UlDtX',
  reviews: 'https://share.google/koXic7i01aOFudBKO',
  /** Shop location (from the salon's Apple Maps pin). */
  location: { lat: 30.051039, lng: 31.355562 },
}

export const MAP_EMBED = `https://www.google.com/maps?q=${SALON.location.lat},${SALON.location.lng}&z=17&output=embed`
export const MAP_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${SALON.location.lat},${SALON.location.lng}`

/** Site credit shown at the bottom of the customer footer. */
export const DEVELOPER = {
  name: 'Omar Sherif',
  github: 'https://github.com/Omar-Sherif3444',
}
