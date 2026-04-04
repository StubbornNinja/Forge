import type { ModelDownloadProgress } from '../../lib/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatSpeed(bps: number): string {
  if (bps < 1_048_576) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1_048_576).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

interface DownloadProgressProps {
  progress: ModelDownloadProgress;
  onCancel: () => void;
}

export function DownloadProgress({ progress, onCancel }: DownloadProgressProps) {
  const pct = progress.total_bytes > 0
    ? Math.round((progress.downloaded_bytes / progress.total_bytes) * 100)
    : 0;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="w-full h-2 bg-surface-tertiary rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          {formatBytes(progress.downloaded_bytes)} / {formatBytes(progress.total_bytes)}
          {progress.speed_bps > 0 && ` — ${formatSpeed(progress.speed_bps)}`}
        </span>
        <div className="flex items-center gap-3">
          {progress.eta_seconds > 0 && (
            <span>~{formatEta(progress.eta_seconds)} remaining</span>
          )}
          <button
            onClick={onCancel}
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
