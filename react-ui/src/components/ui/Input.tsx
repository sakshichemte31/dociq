import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => (
    <div className="space-y-1.5">
      {label && <label className="block text-sm text-[#6B6B63]">{label}</label>}
      <input
        ref={ref}
        className={`w-full bg-[#F0EFE9] border text-[#1A1A18] rounded-lg px-3 py-2.5 text-sm
          focus:outline-none focus:border-accent-500 placeholder:text-[#A8A89C]
          ${error ? 'border-red-500' : 'border-black/10'}
          ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
