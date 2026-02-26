import type { ReactNode } from 'react'

interface HorizontalScrollProps {
  children: ReactNode
  className?: string
}

function HorizontalScroll({ children, className }: HorizontalScrollProps) {
  return <div className={`h-scroll ${className ?? ''}`.trim()}>{children}</div>
}

export default HorizontalScroll
