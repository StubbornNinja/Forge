import { useEffect, useState, useCallback } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { DownloadProgress } from './DownloadProgress';
import type { CatalogModel, HfModelResult, HfGgufFile } from '../../lib/types';
import { formatQuant } from '../../lib/format';

function formatSize(bytes: number): string {
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface ModelBrowserProps {
  /** Called when a model finishes downloading */
  onModelReady?: (modelId: string, filePath: string) => void;
}

export function ModelBrowser({ onModelReady }: ModelBrowserProps) {
  const { catalog, installed, downloading, loadCatalog, loadInstalled, downloadModel, downloadHfModel, searchHf, listHfFiles, cancelDownload, deleteModel } = useModelStore();
  const [selectedQuants, setSelectedQuants] = useState<Record<string, string>>({});

  // HuggingFace search state
  const [hfQuery, setHfQuery] = useState('');
  const [hfResults, setHfResults] = useState<HfModelResult[]>([]);
  const [hfSearching, setHfSearching] = useState(false);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [repoFiles, setRepoFiles] = useState<HfGgufFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    loadCatalog();
    loadInstalled();
  }, [loadCatalog, loadInstalled]);

  // Set default quant selections
  useEffect(() => {
    const defaults: Record<string, string> = {};
    for (const model of catalog) {
      const recommended = model.variants.find((v) => v.recommended);
      if (recommended) {
        defaults[model.id] = recommended.quant;
      } else if (model.variants.length > 0) {
        defaults[model.id] = model.variants[0].quant;
      }
    }
    setSelectedQuants((prev) => ({ ...defaults, ...prev }));
  }, [catalog]);

  const isInstalled = (catalogId: string, quant: string) =>
    installed.some((m) => m.catalog_id === catalogId && m.quant === quant);

  const getInstalledModel = (catalogId: string, quant: string) =>
    installed.find((m) => m.catalog_id === catalogId && m.quant === quant);

  const handleDownload = async (model: CatalogModel) => {
    const quant = selectedQuants[model.id];
    if (!quant) return;
    try {
      const result = await downloadModel(model.id, quant);
      onModelReady?.(result.id, result.file_path);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleDelete = async (catalogId: string, quant: string) => {
    const model = getInstalledModel(catalogId, quant);
    if (model) {
      await deleteModel(model.id);
    }
  };

  // HuggingFace search
  const handleHfSearch = useCallback(async () => {
    const query = hfQuery.trim();
    if (!query) return;

    // Detect if it looks like a repo ID (owner/repo)
    const isRepoId = /^[\w.-]+\/[\w.-]+$/.test(query) ||
      query.includes('huggingface.co/');

    if (isRepoId) {
      // Extract repo ID from URL or use as-is
      const repoId = query.includes('huggingface.co/')
        ? query.split('huggingface.co/')[1]?.split('/tree')[0]?.split('/blob')[0] || query
        : query;

      setExpandedRepo(repoId);
      setLoadingFiles(true);
      setHfResults([]);
      try {
        const files = await listHfFiles(repoId);
        setRepoFiles(files);
      } catch {
        setRepoFiles([]);
      } finally {
        setLoadingFiles(false);
      }
      return;
    }

    setHfSearching(true);
    setExpandedRepo(null);
    setRepoFiles([]);
    try {
      const results = await searchHf(query);
      setHfResults(results);
    } catch {
      setHfResults([]);
    } finally {
      setHfSearching(false);
    }
  }, [hfQuery, searchHf, listHfFiles]);

  const handleExpandRepo = async (repoId: string) => {
    if (expandedRepo === repoId) {
      setExpandedRepo(null);
      setRepoFiles([]);
      return;
    }
    setExpandedRepo(repoId);
    setLoadingFiles(true);
    try {
      const files = await listHfFiles(repoId);
      setRepoFiles(files);
    } catch {
      setRepoFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleHfDownload = async (repoId: string, filename: string) => {
    try {
      const result = await downloadHfModel(repoId, filename);
      onModelReady?.(result.id, result.file_path);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const isFileInstalled = (filename: string) =>
    installed.some((m) => m.filename === filename);

  // Filter out title-gen model from user-facing browser
  const visibleCatalog = catalog.filter((m) => m.id !== 'qwen3-0.6b');

  return (
    <div className="space-y-4">
      {/* Curated catalog models */}
      {visibleCatalog.map((model) => {
        const selectedQuant = selectedQuants[model.id] || '';
        const installed_ = isInstalled(model.id, selectedQuant);
        const isDownloading = downloading?.model_id === model.id;

        return (
          <div
            key={model.id}
            className={`glass border border-[var(--glass-border)] rounded-xl p-4 space-y-3 ${
              installed_ ? 'border-green-500/20' : ''
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{model.display_name}</h3>
                <p className="text-xs text-text-muted mt-0.5">{model.description}</p>
              </div>
              {installed_ && (
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                  Installed
                </span>
              )}
            </div>

            {/* Info chips */}
            <div className="flex flex-wrap gap-2 text-xs text-text-muted">
              <span className="bg-[var(--input-bg)] px-2 py-0.5 rounded">{model.recommended_ram_gb} GB+ RAM</span>
              {model.supports_tool_use && (
                <span className="bg-[var(--input-bg)] px-2 py-0.5 rounded">Tool use</span>
              )}
              <span className="bg-[var(--input-bg)] px-2 py-0.5 rounded">{Math.round(model.context_length / 1024)}K context</span>
            </div>

            {/* Quant selector + action */}
            <div className="flex items-center gap-2">
              <select
                value={selectedQuant}
                onChange={(e) => setSelectedQuants((prev) => ({ ...prev, [model.id]: e.target.value }))}
                className="flex-1 bg-[var(--input-bg)] text-text-primary rounded-lg px-3 py-1.5 text-xs border border-[var(--glass-border)] focus:outline-none focus:border-accent"
              >
                {model.variants.map((v) => (
                  <option key={v.quant} value={v.quant}>
                    {formatQuant(v.quant)} — {formatSize(v.size_bytes)}{v.recommended ? ' (Recommended)' : ''}
                  </option>
                ))}
              </select>

              {installed_ ? (
                <button
                  onClick={() => handleDelete(model.id, selectedQuant)}
                  className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Delete
                </button>
              ) : isDownloading ? null : (
                <button
                  onClick={() => handleDownload(model)}
                  className="px-4 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  Download
                </button>
              )}
            </div>

            {/* Download progress */}
            {isDownloading && downloading && (
              <DownloadProgress progress={downloading} onCancel={cancelDownload} />
            )}
          </div>
        );
      })}

      {visibleCatalog.length === 0 && (
        <p className="text-sm text-text-muted text-center py-4">Loading models...</p>
      )}

      {/* HuggingFace search section */}
      <div className="pt-4 border-t border-[var(--glass-border)]">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Browse HuggingFace</h3>
        <p className="text-xs text-text-muted mb-3">
          Search for any GGUF model, or paste a repo URL.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={hfQuery}
            onChange={(e) => setHfQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleHfSearch()}
            placeholder="Search models or paste owner/repo..."
            className="flex-1 bg-[var(--input-bg)] text-text-primary rounded-lg px-3 py-1.5 text-xs border border-[var(--glass-border)] focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleHfSearch}
            disabled={hfSearching || !hfQuery.trim()}
            className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {hfSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search results */}
        {hfResults.length > 0 && (
          <div className="space-y-2">
            {hfResults.map((result) => (
              <div key={result.id}>
                <button
                  onClick={() => handleExpandRepo(result.id)}
                  className={`w-full text-left glass border rounded-lg px-3 py-2 transition-all ${
                    expandedRepo === result.id
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-[var(--glass-border)] hover:border-[var(--glass-border-light)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-primary truncate">{result.id}</span>
                    <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">
                      {formatDownloads(result.downloads)} downloads
                    </span>
                  </div>
                </button>

                {/* Expanded file list */}
                {expandedRepo === result.id && (
                  <HfFileList
                    files={repoFiles}
                    loading={loadingFiles}
                    repoId={result.id}
                    downloading={downloading}
                    isFileInstalled={isFileInstalled}
                    onDownload={handleHfDownload}
                    onCancel={cancelDownload}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Direct repo file list (when URL pasted) */}
        {expandedRepo && hfResults.length === 0 && (
          <div>
            <div className="text-xs font-medium text-text-primary mb-2 truncate">{expandedRepo}</div>
            <HfFileList
              files={repoFiles}
              loading={loadingFiles}
              repoId={expandedRepo}
              downloading={downloading}
              isFileInstalled={isFileInstalled}
              onDownload={handleHfDownload}
              onCancel={cancelDownload}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** File list for an expanded HuggingFace repo. */
function HfFileList({
  files,
  loading,
  repoId,
  downloading,
  isFileInstalled,
  onDownload,
  onCancel,
}: {
  files: HfGgufFile[];
  loading: boolean;
  repoId: string;
  downloading: ReturnType<typeof useModelStore.getState>['downloading'];
  isFileInstalled: (filename: string) => boolean;
  onDownload: (repoId: string, filename: string) => void;
  onCancel: () => void;
}) {
  if (loading) {
    return <p className="text-xs text-text-muted py-2 pl-3">Loading files...</p>;
  }

  if (files.length === 0) {
    return <p className="text-xs text-text-muted py-2 pl-3">No GGUF files found in this repo.</p>;
  }

  return (
    <div className="ml-3 mt-1 space-y-1">
      {files.map((file) => {
        const installed = isFileInstalled(file.filename);

        return (
          <div
            key={file.filename}
            className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--input-bg)]"
          >
            <div className="min-w-0">
              <span className="text-xs text-text-primary truncate block">{file.filename}</span>
              <span className="text-[10px] text-text-muted">{formatSize(file.size_bytes)}</span>
            </div>
            {installed ? (
              <span className="text-[10px] text-green-400 flex-shrink-0">Installed</span>
            ) : (
              <button
                onClick={() => onDownload(repoId, file.filename)}
                className="flex-shrink-0 px-2 py-1 text-[10px] bg-accent hover:bg-accent-hover text-white rounded transition-colors"
              >
                Download
              </button>
            )}
          </div>
        );
      })}
      {downloading && (
        <div className="px-3 pt-1">
          <DownloadProgress progress={downloading} onCancel={onCancel} />
        </div>
      )}
    </div>
  );
}
