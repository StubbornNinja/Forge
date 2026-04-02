import type { Attachment } from '../../lib/types';

interface FileChipProps {
  file: Attachment;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileChip({ file }: FileChipProps) {
  return (
    <div className="inline-flex items-center gap-2 bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm">
      <svg
        className="w-4 h-4 text-text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
        />
      </svg>
      <span className="text-text-primary truncate max-w-[200px]">{file.filename}</span>
      <span className="text-text-muted">{formatSize(file.size_bytes)}</span>
    </div>
  );
}
