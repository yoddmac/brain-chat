import { createContext, useContext, useState, type ReactNode } from 'react';
import { cn } from '../cn';

const TabsContext = createContext<{ value: string; setValue: (value: string) => void }>({
  value: '',
  setValue: () => undefined,
});

export function Tabs({
  defaultValue,
  className,
  children,
}: {
  defaultValue: string;
  className?: string;
  children: ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('bc:flex', className)}>{children}</div>;
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const tabs = useContext(TabsContext);
  const selected = tabs.value === value;
  return (
    <button
      type="button"
      className={cn('bc:flex-1 bc:rounded-md', selected && 'bc:bg-white', className)}
      onClick={() => tabs.setValue(value)}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const tabs = useContext(TabsContext);
  if (tabs.value !== value) return null;
  return <div className={className}>{children}</div>;
}
