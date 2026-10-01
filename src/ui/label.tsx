import type { LabelHTMLAttributes } from 'react';
import { cn } from '../cn';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('bc:text-sm', className)} {...props} />;
}
