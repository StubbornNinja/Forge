import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { api } from '../../lib/tauri';
import type { ModelInfo } from '../../lib/types';

export function ModelConfig() {
  const { settings, updateSettings } = useSettingsStore();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [_loadingModels, setLoadingModels] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  if (!settings) return null;

  const checkConnection = async () => {
    setConnected(null);
    try {
      const healthy = await api.healthCheck();
      setConnected(healthy);
      if (healthy) {
        setLoadingModels(true);
        const modelList = await api.listModels();
        setModels(modelList);
        setLoadingModels(false);
      }
    } catch {
      setConnected(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Inference URL */}
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

      {/* Model selection */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Default Model
        </label>
        {models.length > 0 ? (
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

      {/* Temperature */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Temperature: {settings.temperature.toFixed(1)}
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={settings.temperature}
          onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>Precise (0)</span>
          <span>Creative (2)</span>
        </div>
      </div>

      {/* Max tokens */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Max Tokens
        </label>
        <input
          type="number"
          value={settings.max_tokens}
          onChange={(e) => updateSettings({ max_tokens: parseInt(e.target.value) || 4096 })}
          className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
          min={256}
          max={128000}
          step={256}
        />
      </div>

      {/* Reasoning Effort */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Reasoning Effort
        </label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['off', 'low', 'medium', 'high'] as const).map((level) => {
            const currentValue = settings.reasoning_effort || 'off';
            const isActive = currentValue === level || (!settings.reasoning_effort && level === 'off');
            return (
              <button
                key={level}
                onClick={() => updateSettings({ reasoning_effort: level === 'off' ? undefined : level })}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors capitalize ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {level === 'off' ? 'Off' : level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Qwen3/3.5: Off disables thinking, other values enable it.
          GPT-OSS: sent as reasoning_effort hint (server support varies).
        </p>
      </div>
    </div>
  );
}
