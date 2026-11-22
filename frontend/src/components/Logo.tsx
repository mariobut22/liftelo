/** Official Liftelo logo (docs/marketing/logo, concept 1). Files are served from /logo/*.svg. */
type LogoProps = {
  className?: string
}

/** Wordmark + mark for dark backgrounds (app sidebar). */
export function LogoLockupLight({ className = 'h-7 w-auto' }: LogoProps) {
  return <img src="/logo/liftelo-lockup-white.svg" alt="Liftelo" className={className} draggable={false} />
}

/** Mark only, white, for dark backgrounds (collapsed sidebar). */
export function LogoMarkLight({ className = 'h-7 w-7' }: LogoProps) {
  return <img src="/logo/liftelo-icon-white.svg" alt="Liftelo" className={className} draggable={false} />
}

/** Mark only, dark, for light backgrounds (mobile header, public pages). Switches to the white mark in dark mode. */
export function LogoMarkDark({ className = 'h-8 w-8' }: LogoProps) {
  return (
    <>
      <img src="/logo/liftelo-icon.svg" alt="Liftelo" className={`${className} dark:hidden`} draggable={false} />
      <img src="/logo/liftelo-icon-white.svg" alt="" aria-hidden="true" className={`${className} hidden dark:block`} draggable={false} />
    </>
  )
}
