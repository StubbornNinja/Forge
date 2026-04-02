export function StreamingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-[var(--input-bg)] backdrop-blur-sm border border-[var(--glass-border)] rounded-2xl px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
