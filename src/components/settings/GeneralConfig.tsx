import { useSettingsStore } from '../../stores/settingsStore';

export function GeneralConfig() {
  const { settings, updateSettings } = useSettingsStore();

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Theme
        </label>
        <select
          value={settings.theme}
          onChange={(e) => updateSettings({ theme: e.target.value as 'system' | 'light' | 'dark' })}
          className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      {/* Send shortcut */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Send Message Shortcut
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sendShortcut"
              checked={settings.send_shortcut === 'Enter'}
              onChange={() => updateSettings({ send_shortcut: 'Enter' })}
              className="accent-accent"
            />
            <span className="text-sm text-text-primary">Enter</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sendShortcut"
              checked={settings.send_shortcut === 'Ctrl+Enter'}
              onChange={() => updateSettings({ send_shortcut: 'Ctrl+Enter' })}
              className="accent-accent"
            />
            <span className="text-sm text-text-primary">Ctrl+Enter</span>
          </label>
        </div>
      </div>

      {/* Title Generation Model */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Title Generation Model
        </label>
        <input
          type="text"
          value={settings.title_model || ''}
          onChange={(e) => updateSettings({ title_model: e.target.value || undefined })}
          className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
          placeholder="unsloth/Qwen3-0.6B-GGUF"
        />
        <p className="text-xs text-text-muted mt-1">
          A small, fast model for generating conversation titles. Must be loaded in LM Studio.
        </p>
      </div>

      {/* SearXNG URL */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          SearXNG URL (Web Search)
        </label>
        <input
          type="text"
          value={settings.searxng_url}
          onChange={(e) => updateSettings({ searxng_url: e.target.value })}
          className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
          placeholder="http://localhost:8080"
        />
      </div>

      {/* Search enabled */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.search_enabled}
            onChange={(e) => updateSettings({ search_enabled: e.target.checked })}
            className="accent-accent w-4 h-4"
          />
          <span className="text-sm text-text-primary">Enable web search</span>
        </label>
      </div>

      {/* System prompt */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={settings.system_prompt_enabled}
            onChange={(e) => updateSettings({ system_prompt_enabled: e.target.checked })}
            className="accent-accent w-4 h-4"
          />
          <span className="text-sm text-text-primary">Enable system prompt</span>
        </label>

        {settings.system_prompt_enabled && (
          <textarea
            value={settings.custom_system_prompt || ''}
            onChange={(e) =>
              updateSettings({
                custom_system_prompt: e.target.value || undefined,
              })
            }
            placeholder="Leave empty to use the default Forge system prompt..."
            className="w-full h-32 bg-surface-secondary text-text-primary placeholder-text-muted rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent resize-none"
          />
        )}
      </div>
    </div>
  );
}
