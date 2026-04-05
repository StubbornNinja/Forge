import { useState, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useModelStore, initModelEvents, cleanupModelEvents } from '../../stores/modelStore';
import { useSidecarStore, initSidecarEvents, cleanupSidecarEvents } from '../../stores/sidecarStore';
import { api } from '../../lib/tauri';
import { DownloadProgress } from '../models/DownloadProgress';
import type { ModelInfo, CatalogModel } from '../../lib/types';

type Step = 'welcome' | 'choose-mode' | 'download-model' | 'connect' | 'model' | 'ready';

function formatSize(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

/** Simplified model cards for the setup wizard — one-click download, no quant picker. */
function SimpleModelCards({ onModelReady }: { onModelReady: (modelId: string, filePath: string) => void }) {
  const { catalog, installed, downloading, downloadModel, cancelDownload } = useModelStore();

  useEffect(() => {
    useModelStore.getState().loadCatalog();
    useModelStore.getState().loadInstalled();
  }, []);

  // Filter out title-gen model
  const visible = catalog.filter((m: CatalogModel) => m.id !== 'qwen3-0.6b');

  const handleDownload = async (model: CatalogModel) => {
    const variant = model.variants.find((v) => v.recommended) || model.variants[0];
    if (!variant) return;
    try {
      const result = await downloadModel(model.id, variant.quant);
      onModelReady(result.id, result.file_path);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <>
      {visible.map((model) => {
        const variant = model.variants.find((v) => v.recommended) || model.variants[0];
        const isInstalled = installed.some((m) => m.catalog_id === model.id);
        const isDownloading = downloading?.model_id === model.id;

        return (
          <div
            key={model.id}
            className={`glass border rounded-xl px-4 py-3 ${
              isInstalled ? 'border-green-500/20' : 'border-[var(--glass-border)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-text-primary">{model.display_name}</h4>
                  {isInstalled && (
                    <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full">
                      Installed
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">{model.description}</p>
                <div className="flex gap-2 mt-1.5 text-[10px] text-text-muted">
                  <span className="bg-[var(--input-bg)] px-1.5 py-0.5 rounded">
                    {variant ? formatSize(variant.size_bytes) : '?'}
                  </span>
                  <span className="bg-[var(--input-bg)] px-1.5 py-0.5 rounded">
                    {model.recommended_ram_gb} GB+ RAM
                  </span>
                </div>
              </div>
              {!isInstalled && !isDownloading && (
                <button
                  onClick={() => handleDownload(model)}
                  className="flex-shrink-0 px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  Download
                </button>
              )}
            </div>
            {isDownloading && downloading && (
              <div className="mt-2">
                <DownloadProgress progress={downloading} onCancel={cancelDownload} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function SetupWizard() {
  const { showSetupWizard, setShowSetupWizard } = useUIStore();
  const { settings, updateSettings } = useSettingsStore();
  useSidecarStore();
  useModelStore();
  const [step, setStep] = useState<Step>('welcome');
  const [inferenceUrl, setInferenceUrl] = useState(settings?.inference_url || 'http://localhost:1234');
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [localModelReady, setLocalModelReady] = useState(false);

  // Init event listeners
  useEffect(() => {
    initModelEvents();
    initSidecarEvents();
    return () => {
      cleanupModelEvents();
      cleanupSidecarEvents();
    };
  }, []);

  if (!showSetupWizard) return null;

  const handleSkip = () => {
    updateSettings({ has_completed_setup: true });
    setShowSetupWizard(false);
  };

  const handleFinish = () => {
    updateSettings({ has_completed_setup: true });
    setShowSetupWizard(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnected(null);
    try {
      await updateSettings({ inference_url: inferenceUrl, inference_mode: 'external' });
      const healthy = await api.healthCheck();
      setConnected(healthy);
      if (healthy) {
        const modelList = await api.listModels();
        setModels(modelList);
        if (modelList.length === 1) setSelectedModel(modelList[0].id);
        useConnectionStore.getState().checkConnection();
      }
    } catch {
      setConnected(false);
    } finally {
      setTesting(false);
    }
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    updateSettings({ default_model: modelId });
  };

  const handleModelReady = (modelId: string, _filePath: string) => {
    updateSettings({ inference_mode: 'local', local_model_id: modelId });
    setLocalModelReady(true);
  };

  // Determine steps based on chosen mode
  const getSteps = (): Step[] => {
    if (step === 'welcome' || step === 'choose-mode') {
      return ['welcome', 'choose-mode'];
    }
    if (step === 'download-model' || (step === 'ready' && localModelReady)) {
      return ['welcome', 'choose-mode', 'download-model', 'ready'];
    }
    return ['welcome', 'choose-mode', 'connect', 'model', 'ready'];
  };

  const steps = getSteps();
  const currentIdx = steps.indexOf(step);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />

      <div className="relative glass-heavy border border-[var(--glass-border-light)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Step dots */}
        <div className="flex justify-center gap-2 pt-6 pb-2">
          {steps.map((s, i) => (
            <div
              key={`${s}-${i}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIdx ? 'bg-accent' : i < currentIdx ? 'bg-accent/40' : 'bg-[var(--hover-bg)]'
              }`}
            />
          ))}
        </div>

        <div className="px-8 pb-8 pt-4 min-h-[380px] flex flex-col">
          {/* Welcome */}
          {step === 'welcome' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 glass rounded-2xl border border-[var(--glass-border)] flex items-center justify-center">
                <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-text-primary">Welcome to Forge</h2>
              <p className="text-sm text-text-muted max-w-sm">
                Your local-first AI assistant. Let's get you set up in a few quick steps.
              </p>
            </div>
          )}

          {/* Choose Mode */}
          {step === 'choose-mode' && (
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">How would you like to run AI models?</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setStep('download-model')}
                  className="w-full text-left glass border border-[var(--glass-border)] hover:border-accent/40 rounded-xl px-5 py-4 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">Download a model</p>
                      <p className="text-xs text-text-muted">Recommended — runs everything locally, no setup needed</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setStep('connect')}
                  className="w-full text-left glass border border-[var(--glass-border)] hover:border-[var(--glass-border-light)] rounded-xl px-5 py-4 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--hover-bg)] flex items-center justify-center">
                      <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.25 8.25" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">Connect to existing server</p>
                      <p className="text-xs text-text-muted">Use LM Studio, llama.cpp, or another OpenAI-compatible server</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Download Model — simplified cards, no quant picker */}
          {step === 'download-model' && (
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Choose a model</h3>
              <p className="text-xs text-text-muted">
                Pick a model to download. You can get more options later in Settings.
              </p>
              <div className="max-h-[280px] overflow-y-auto -mx-2 px-2 space-y-3">
                <SimpleModelCards onModelReady={handleModelReady} />
              </div>
            </div>
          )}

          {/* Connect (external server path) */}
          {step === 'connect' && (
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Connect to a Model Server</h3>
              <p className="text-sm text-text-muted">
                Enter the URL of your OpenAI-compatible inference server.
              </p>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Server URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inferenceUrl}
                    onChange={(e) => setInferenceUrl(e.target.value)}
                    className="flex-1 bg-[var(--input-bg)] text-text-primary rounded-lg px-3 py-2 text-sm border border-[var(--glass-border)] focus:outline-none focus:border-accent"
                    placeholder="http://localhost:1234"
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    {testing ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {connected !== null && (
                  <p className={`mt-1.5 text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
                    {connected ? `Connected — ${models.length} model${models.length !== 1 ? 's' : ''} found` : 'Connection failed'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Pick Model (external server path) */}
          {step === 'model' && (
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Pick a Model</h3>
              {models.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleSelectModel(m.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                        selectedModel === m.id
                          ? 'border-accent bg-accent/10 text-text-primary'
                          : 'border-[var(--glass-border)] hover:border-[var(--glass-border-light)] text-text-secondary'
                      }`}
                    >
                      {m.id.split('/').pop()}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">Go back and test the connection to detect models.</p>
              )}
            </div>
          )}

          {/* Ready */}
          {step === 'ready' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">You're all set!</h3>
              <p className="text-sm text-text-muted max-w-sm">
                {localModelReady
                  ? 'Your model is downloaded. Forge will start it automatically when you chat.'
                  : connected
                    ? 'Forge is connected and ready to go.'
                    : 'You can configure the connection anytime in Settings.'}
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--glass-border)]">
            <button onClick={handleSkip} className="text-sm text-text-muted hover:text-text-secondary transition-colors">
              Skip setup
            </button>
            <div className="flex gap-2">
              {currentIdx > 0 && step !== 'choose-mode' && (
                <button
                  onClick={() => setStep(steps[currentIdx - 1])}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Back
                </button>
              )}
              {step === 'welcome' && (
                <button
                  onClick={() => setStep('choose-mode')}
                  className="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Get Started
                </button>
              )}
              {step === 'download-model' && localModelReady && (
                <button
                  onClick={() => setStep('ready')}
                  className="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Next
                </button>
              )}
              {step === 'connect' && connected && (
                <button
                  onClick={() => setStep('model')}
                  className="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Next
                </button>
              )}
              {step === 'model' && selectedModel && (
                <button
                  onClick={() => setStep('ready')}
                  className="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Next
                </button>
              )}
              {step === 'ready' && (
                <button
                  onClick={handleFinish}
                  className="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Start Chatting
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
