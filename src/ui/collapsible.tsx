import { createContext, useContext, useState, type ReactNode } from 'react';

const CollapsibleContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => undefined,
});

export function Collapsible({
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  children,
}: {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = openProp ?? uncontrolled;
  const setOpen = (next: boolean) => {
    setUncontrolled(next);
    onOpenChange?.(next);
  };
  return (
    <CollapsibleContext.Provider value={{ open, setOpen }}>{children}</CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const state = useContext(CollapsibleContext);
  return (
    <button type="button" className={className} onClick={() => state.setOpen(!state.open)}>
      {children}
    </button>
  );
}

export function CollapsibleContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const state = useContext(CollapsibleContext);
  if (!state.open) return null;
  return <div className={className}>{children}</div>;
}
