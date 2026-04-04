interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--hover-bg)] ${className}`}
    />
  );
}

export function ConversationSkeleton() {
  return (
    <div className="px-2.5 py-2.5 space-y-2">
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-2.5 w-1/2" />
    </div>
  );
}

export function MessageSkeleton({ role }: { role: 'user' | 'assistant' }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2 py-3">
          <Skeleton className="h-3.5 w-48 ml-auto" />
          <Skeleton className="h-3.5 w-32 ml-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-3">
      <Skeleton className="h-3.5 w-full max-w-md" />
      <Skeleton className="h-3.5 w-full max-w-sm" />
      <Skeleton className="h-3.5 w-3/4 max-w-xs" />
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
