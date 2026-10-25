import type { ReactNode } from 'react';

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="animate-slide-in">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#f5ebd6]">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-[#bda782]">{description}</p>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-[#f5ebd6]">{title}</p>
      {body ? <p className="mt-1 max-w-md text-sm text-[#bda782]">{body}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Agents are working…' }: { label?: string }) {
  return (
    <div className="card animate-pulse space-y-3 px-6 py-6" aria-busy="true">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-4 w-1/2" />
      <p className="pt-1 text-sm text-[#bda782]">{label}</p>
    </div>
  );
}
