import type { StructuredError } from '../../lib/types';
import { useUIStore } from '../../stores/uiStore';
import { useChatStore } from '../../stores/chatStore';

const CATEGORY_ICONS: Record<string, string> = {
  connection_failed: 'M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728',
  model_not_found: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  stream_interrupted: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  search_unavailable: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  file_upload_failed: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  general: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
};

interface ErrorBannerProps {
  error: StructuredError;
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  const { setSettingsOpen } = useUIStore();
  const clearError = useChatStore((s) => s.clearError);

  const iconPath = CATEGORY_ICONS[error.category] || CATEGORY_ICONS.general;

  const handleAction = () => {
    if (!error.action) return;
    switch (error.action.action_type) {
      case 'open_settings':
        setSettingsOpen(true);
        clearError();
        break;
      case 'retry':
        clearError();
        break;
    }
  };

  return (
    <div className="flex-shrink-0 mx-4 mt-2 animate-slideDown">
      <div className="glass border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
        {/* Icon */}
        <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
        </svg>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-300">{error.title}</p>
          <p className="text-xs text-text-muted mt-0.5">{error.description}</p>
        </div>

        {/* Action button */}
        {error.action && (
          <button
            onClick={handleAction}
            className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            {error.action.label}
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={clearError}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-[var(--hover-bg)] text-text-muted hover:text-text-primary transition-colors"
          aria-label="Dismiss error"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
