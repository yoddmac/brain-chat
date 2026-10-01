import type { ReactNode } from 'react';

export function Dialog({
  open,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="bc:fixed bc:inset-0 bc:z-50 bc:flex bc:items-center bc:justify-center bc:bg-black/40 bc:p-4">
      {children}
    </div>
  );
}

export function DialogContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ?? 'bc:max-h-[80vh] bc:w-full bc:max-w-3xl bc:overflow-auto bc:rounded-xl bc:bg-white bc:p-4'}>{children}</div>;
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ?? 'bc:mb-3'}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={className ?? 'bc:text-base bc:font-semibold'}>{children}</h2>;
}

export function DialogDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={className ?? 'bc:text-sm bc:text-[#737373]'}>{children}</p>;
}
