import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useModelStore, initModelEvents, cleanupModelEvents } from '../../stores/modelStore';
import { useSidecarStore } from '../../stores/sidecarStore';
import { api, events } from '../../lib/tauri';
import { ModelBrowser } from '../models/ModelBrowser';
import type { ModelInfo, UpdateCheckResult } from '../../lib/types';

export function ModelConfig() {
  const { settings, updateSettings } = useSettingsStore();
  const { installed, loadInstalled } = useModelStore();
  const sidecarStatus = useSidecarStore((s) => s.status);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showModelBrowser, setShowModelBrowser] = useState(false);
  const prevUrlRef = useRef(settings?.inference_url);

  const inferenceMode = settings?.inference_mode || 'external';

  // Load installed models on mount
  useEffect(() => {
    loadInstalled();
    initModelEvents();
    return () => cleanupModelEvents();
  }, [loadInstalled]);

  // Auto-detect models when in external mode and URL changes
  useEffect(() => {
    if (!settings || inferenceMode !== 'external') return;
    if (settings.inference_url === prevUrlRef.current) return;
    prevUrlRef.current = settings.inference_url;
    const timer = setTimeout(() => checkConnection(), 1000);
    return () => clearTimeout(timer);
  }, [settings?.inference_url, inferenceMode]);

  // Fetch models on mount for external mode
  useEffect(() => {
    if (!settings || inferenceMode !== 'external') return;
    checkConnection();
  }, [inferenceMode]);

  if (!settings) return null;

  const checkConnection = async () => {
    setConnected(null);
    setLoadingModels(true);
    try {
      const healthy = await api.healthCheck();
      setConnected(healthy);
      if (healthy) {
        const modelList = await api.listModels();
        setModels(modelList);
        if (modelList.length === 1 && !settings.default_model) {
          updateSettings({ default_model: modelList[0].id });
        }
        useConnectionStore.getState().checkConnection();
      }
    } catch {
      setConnected(false);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleModeChange = (newMode: string) => {
    updateSettings({ inference_mode: newMode });
    // Trigger a connection check to update the indicator
    setTimeout(() => useConnectionStore.getState().checkConnection(), 500);
  };

  const selectedLocalModel = installed.find((m) => m.id === settings.local_model_id);

  return (
    <div className="space-y-6">
      {/* Inference Mode Toggle */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Inference Mode
        </label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => handleModeChange('local')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              inferenceMode === 'local'
                ? 'bg-accent text-white'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            Local
          </button>
          <button
            onClick={() => handleModeChange('external')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              inferenceMode === 'external'
                ? 'bg-accent text-white'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            External Server
          </button>
        </div>
      </div>

      {/* Local Mode */}
      {inferenceMode === 'local' && (
        <>
          {/* Selected local model */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Active Model
            </label>
            {selectedLocalModel ? (
              <div className="flex items-center justify-between glass border border-[var(--glass-border)] rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{selectedLocalModel.filename}</p>
                  <p className="text-xs text-text-muted">{selectedLocalModel.quant} — {(selectedLocalModel.size_bytes / 1_073_741_824).toFixed(1)} GB</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    sidecarStatus.status === 'running' ? 'bg-green-400' :
                    sidecarStatus.status === 'starting' ? 'bg-amber-400 animate-pulse' :
                    'bg-red-400'
                  }`} />
                  <span className="text-xs text-text-muted capitalize">{sidecarStatus.status}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No model selected. Download one below.</p>
            )}

            {/* Model selector for installed models */}
            {installed.length > 1 && (
              <select
                value={settings.local_model_id || ''}
                onChange={(e) => updateSettings({ local_model_id: e.target.value || undefined })}
                className="w-full mt-2 bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
              >
                {installed.map((m) => (
                  <option key={m.id} value={m.id}>{m.filename} ({m.quant})</option>
                ))}
              </select>
            )}
          </div>

          {/* Download more models */}
          <div>
            <button
              onClick={() => setShowModelBrowser(!showModelBrowser)}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              {showModelBrowser ? 'Hide model browser' : 'Download or manage models'}
            </button>
            {showModelBrowser && (
              <div className="mt-3">
                <ModelBrowser onModelReady={(modelId) => {
                  updateSettings({ local_model_id: modelId });
                }} />
              </div>
            )}
          </div>

          {/* llama.cpp Engine */}
          <LlamaCppEngineSection />
        </>
      )}

      {/* External Server Mode */}
      {inferenceMode === 'external' && (
        <>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Inference Server URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.inference_url}
                onChange={(e) => updateSettings({ inference_url: e.target.value })}
                className="flex-1 bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
                placeholder="http://localhost:1234"
              />
              <button
                onClick={checkConnection}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors"
              >
                Test
              </button>
            </div>
            {connected !== null && (
              <p className={`mt-1 text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
                {connected ? 'Connected' : 'Connection failed'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Default Model
            </label>
            {loadingModels ? (
              <div className="w-full bg-surface-secondary text-text-muted rounded-lg px-3 py-2 text-sm border border-border animate-pulse">
                Detecting models...
              </div>
            ) : models.length > 0 ? (
              <select
                value={settings.default_model || ''}
                onChange={(e) => updateSettings({ default_model: e.target.value || undefined })}
                className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
              >
                <option value="">Auto-detect</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={settings.default_model || ''}
                onChange={(e) => updateSettings({ default_model: e.target.value || undefined })}
                className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
                placeholder="Enter model name or test connection to list models"
              />
            )}
          </div>
        </>
      )}

    </div>
  );
}

type EngineState = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'updating' | 'error';

function LlamaCppEngineSection() {
  const [version, setVersion] = useState<string>('');
  const [state, setState] = useState<EngineState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null);
  const [error, setError] = useState<string>('');

  // Fetch current version on mount
  useEffect(() => {
    api.sidecarBinaryStatus().then((info) => {
      setVersion(info.version || '');
    }).catch(() => {});
  }, []);

  // Subscribe to download progress during updates
  useEffect(() => {
    if (state !== 'updating') return;
    let unlisten: (() => void) | undefined;
    events.onSidecarDownloadProgress((progress) => {
      setDownloadProgress({ downloaded: progress.downloaded_bytes, total: progress.total_bytes });
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [state]);

  const handleCheckUpdate = async () => {
    setState('checking');
    setError('');
    try {
      const result = await api.sidecarCheckUpdate();
      setUpdateInfo(result);
      setState(result.update_available ? 'update-available' : 'up-to-date');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setState('updating');
    setDownloadProgress(null);
    setError('');
    try {
      const info = await api.sidecarUpdateBinary(updateInfo.latest_version);
      setVersion(info.version);
      setUpdateInfo(null);
      setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  const progressPercent = downloadProgress && downloadProgress.total > 0
    ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
    : 0;

  return (
    <div className="pt-4 border-t border-border">
      <label className="block text-sm font-medium text-text-secondary mb-2">
        llama.cpp Engine
      </label>
      <div className="glass border border-[var(--glass-border)] rounded-lg px-4 py-3 space-y-2">
        {/* Version + action row */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-text-primary">
            {version ? (
              <span>Version <span className="font-mono text-accent">{version}</span></span>
            ) : (
              <span className="text-text-muted">Not installed</span>
            )}
          </div>

          {state === 'idle' && (
            <button
              onClick={handleCheckUpdate}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Check for updates
            </button>
          )}
          {state === 'checking' && (
            <span className="text-xs text-text-muted animate-pulse">Checking...</span>
          )}
          {state === 'up-to-date' && (
            <span className="text-xs text-green-400">Up to date</span>
          )}
        </div>

        {/* Update available */}
        {state === 'update-available' && updateInfo && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-text-secondary">
              <span className="font-mono">{updateInfo.current_version}</span>
              <span className="text-text-muted mx-1.5">&rarr;</span>
              <span className="font-mono text-accent">{updateInfo.latest_version}</span>
            </span>
            <button
              onClick={handleUpdate}
              className="px-3 py-1 bg-accent hover:bg-accent-hover text-white rounded-md text-xs transition-colors"
            >
              Update
            </button>
          </div>
        )}

        {/* Download progress */}
        {state === 'updating' && (
          <div className="pt-1 space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Downloading...</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-red-400 truncate mr-2">{error}</span>
            <button
              onClick={handleCheckUpdate}
              className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
