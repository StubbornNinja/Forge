import { useEffect, useState } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { DownloadProgress } from './DownloadProgress';
import type { CatalogModel } from '../../lib/types';

function formatSize(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

interface ModelBrowserProps {
  /** Called when a model finishes downloading */
  onModelReady?: (modelId: string, filePath: string) => void;
}

export function ModelBrowser({ onModelReady }: ModelBrowserProps) {
  const { catalog, installed, downloading, loadCatalog, loadInstalled, downloadModel, cancelDownload, deleteModel } = useModelStore();
  const [selectedQuants, setSelectedQuants] = useState<Record<string, string>>({});

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

  // Filter out title-gen model from user-facing browser
  const visibleCatalog = catalog.filter((m) => m.id !== 'qwen3-0.6b');

  return (
    <div className="space-y-4">
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
                    {v.quant} — {formatSize(v.size_bytes)}{v.recommended ? ' (Recommended)' : ''}
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
    </div>
  );
}
