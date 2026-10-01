import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  size?: 'sm' | 'md';
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'bc:inline-flex bc:items-center bc:justify-center bc:rounded-md bc:font-medium bc:disabled:opacity-50',
        variant === 'primary' && 'bc:bg-[#004AEB] bc:text-white',
        variant === 'secondary' && 'bc:border bc:border-[#E5E5E5] bc:bg-white bc:text-[#171717]',
        variant === 'tertiary' && 'bc:bg-transparent bc:text-[#171717]',
        variant === 'ghost' && 'bc:bg-transparent',
        size === 'sm' ? 'bc:h-8 bc:px-3 bc:text-sm' : 'bc:h-10 bc:px-4 bc:text-sm',
        className,
      )}
      {...props}
    />
  );
}
