interface CardProps { children: React.ReactNode; className?: string }

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white border border-black/[0.08] rounded-xl ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: CardProps) {
  return <div className={`p-5 border-b border-black/[0.08] ${className}`}>{children}</div>
}

export function CardBody({ children, className = '' }: CardProps) {
  return <div className={`p-5 ${className}`}>{children}</div>
}
