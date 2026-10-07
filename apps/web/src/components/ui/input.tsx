import { forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Label = ({
  className = "",
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={`mb-1 block text-sm font-semibold text-slate-700 ${className}`} {...props} />
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", ...props }, ref) => (
    <select
      ref={ref}
      className={`rounded-lg border border-slate-300 bg-surface px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 ${className}`}
      {...props}
    />
  ),
);
Select.displayName = "Select";
