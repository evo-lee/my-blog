import type { ReactNode } from 'react';

interface Props {
  message: string;
  onConfirm: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}

// Tiny wrapper around window.confirm to avoid duplicating the same
// confirm-then-mutate pattern in admin lists.
export function ConfirmButton({ message, onConfirm, title, className, children }: Props) {
  return (
    <button
      type="button"
      title={title}
      className={className}
      onClick={() => {
        if (confirm(message)) onConfirm();
      }}
    >
      {children}
    </button>
  );
}
