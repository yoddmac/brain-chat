import { createContext, useContext, type ReactNode } from 'react';

const RadioContext = createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
}>({});

export function RadioGroup({
  value,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RadioContext.Provider value={{ value, onValueChange }}>
      <div role="radiogroup" className={className}>
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export function RadioGroupItem({ value, id }: { value: string; id?: string }) {
  const group = useContext(RadioContext);
  return (
    <input
      id={id}
      type="radio"
      checked={group.value === value}
      onChange={() => group.onValueChange?.(value)}
    />
  );
}
