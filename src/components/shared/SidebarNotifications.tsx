import { useNotificationStore } from '../../stores/notificationStore';

export function SidebarNotifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const removeNotification = useNotificationStore((s) => s.removeNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="flex-shrink-0 px-1.5 pb-1 space-y-1">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 animate-slideDown"
        >
          {/* Arrow-up icon */}
          <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>

          {/* Message */}
          <span className="text-xs text-text-secondary flex-1 min-w-0 truncate">
            {n.message}
          </span>

          {/* Action button */}
          {n.action && (
            <button
              onClick={n.action.handler}
              className="flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
            >
              {n.action.label}
            </button>
          )}

          {/* Dismiss */}
          {n.dismissable && (
            <button
              onClick={() => removeNotification(n.id)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--hover-bg)] text-text-muted hover:text-text-primary transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
