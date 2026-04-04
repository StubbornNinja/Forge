import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSidecarStore } from '../../stores/sidecarStore';

export function ConnectionIndicator() {
  const connectionStatus = useConnectionStore((s) => s.status);
  const inferenceMode = useSettingsStore((s) => s.settings?.inference_mode || 'external');
  const sidecarStatus = useSidecarStore((s) => s.status);

  // In local mode, show sidecar status
  if (inferenceMode === 'local') {
    const dotColor = {
      running: 'bg-green-400',
      starting: 'bg-amber-400 animate-pulse',
      stopped: 'bg-text-muted',
      stopping: 'bg-amber-400',
      error: 'bg-red-400',
    }[sidecarStatus.status] || 'bg-text-muted';

    const label = {
      running: 'Running locally',
      starting: 'Starting model...',
      stopped: 'Model stopped',
      stopping: 'Stopping...',
      error: 'Error',
    }[sidecarStatus.status] || '';

    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-muted">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  // External mode — show connection status
  const dotColor = {
    connected: 'bg-green-400',
    checking: 'bg-amber-400 animate-pulse',
    disconnected: 'bg-red-400',
    unknown: 'bg-text-muted',
  }[connectionStatus];

  const label = {
    connected: 'Connected',
    checking: 'Checking...',
    disconnected: 'Disconnected',
    unknown: '',
  }[connectionStatus];

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-muted">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <span className="truncate">{label}</span>
    </div>
  );
}
