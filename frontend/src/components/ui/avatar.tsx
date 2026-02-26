import * as React from 'react'

import { cn } from '../../lib/utils'

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200', className)}
      {...props}
    />
  )
)
Avatar.displayName = 'Avatar'

export { Avatar }
