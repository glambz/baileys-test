import * as React from 'react';
import { cn } from '@/lib/utils';

interface ToggleGroupProps {
  type: 'single' | 'multiple';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}

interface ToggleGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  'aria-label'?: string;
}

const ToggleGroupContext = React.createContext<{
  type: 'single' | 'multiple';
  value: string | undefined;
  onSelect: (value: string) => void;
}>({ type: 'single', value: undefined, onSelect: () => {} });

export function ToggleGroup({
  type,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  children,
  ...rest
}: ToggleGroupProps) {
  const [internal, setInternal] = React.useState<string | undefined>(defaultValue);
  const active = value ?? internal;

  const onSelect = (v: string) => {
    if (type === 'single') {
      setInternal(v);
      onValueChange?.(v);
    }
  };

  return (
    <ToggleGroupContext.Provider value={{ type, value: active, onSelect }}>
      <div
        role="group"
        aria-label={rest['aria-label']}
        className={cn('inline-flex items-center gap-0.5', className, disabled && 'pointer-events-none opacity-50')}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export function ToggleGroupItem({
  value,
  className,
  children,
  ...rest
}: ToggleGroupItemProps) {
  const ctx = React.useContext(ToggleGroupContext);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      data-state={active ? 'on' : 'off'}
      onClick={() => ctx.onSelect(value)}
      className={cn(
        'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
