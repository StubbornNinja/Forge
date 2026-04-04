import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';

export function GeneralConfig() {
  const { settings, updateSettings } = useSettingsStore();
  const { setShowSetupWizard, setSettingsOpen } = useUIStore();

  if (!settings) return null;

  const searchBackend = settings.search_backend || 'auto';

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
          A small, fast model for generating conversation titles.
        </p>
      </div>

      {/* Search section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Web Search</h3>

        {/* Search enabled */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.search_enabled}
            onChange={(e) => updateSettings({ search_enabled: e.target.checked })}
            className="accent-accent w-4 h-4"
          />
          <span className="text-sm text-text-primary">Enable web search</span>
        </label>

        {settings.search_enabled && (
          <>
            {/* Search backend */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Search Backend
              </label>
              <select
                value={searchBackend}
                onChange={(e) => updateSettings({ search_backend: e.target.value === 'auto' ? undefined : e.target.value })}
                className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
              >
                <option value="auto">Auto (Recommended)</option>
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="brave">Brave Search</option>
                <option value="searxng">SearXNG (self-hosted)</option>
              </select>
              <p className="text-xs text-text-muted mt-1">
                Auto uses SearXNG if configured, then Brave if key set, then DuckDuckGo.
              </p>
            </div>

            {/* Brave API key — shown for auto or brave */}
            {(searchBackend === 'auto' || searchBackend === 'brave') && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Brave Search API Key
                </label>
                <input
                  type="password"
                  value={settings.brave_api_key || ''}
                  onChange={(e) => updateSettings({ brave_api_key: e.target.value || undefined })}
                  className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
                  placeholder="Optional — free tier: 2,000 queries/month"
                />
              </div>
            )}

            {/* SearXNG URL — shown for auto or searxng */}
            {(searchBackend === 'auto' || searchBackend === 'searxng') && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  SearXNG URL
                </label>
                <input
                  type="text"
                  value={settings.searxng_url}
                  onChange={(e) => updateSettings({ searxng_url: e.target.value })}
                  className="w-full bg-surface-secondary text-text-primary rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:border-accent"
                  placeholder="http://localhost:8080"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Show thinking override */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.show_thinking_override || false}
            onChange={(e) => updateSettings({ show_thinking_override: e.target.checked })}
            className="accent-accent w-4 h-4"
          />
          <div>
            <span className="text-sm text-text-primary">Show thinking in non-thinking chats</span>
            <p className="text-xs text-text-muted mt-0.5">
              Display chain-of-thought even when messages were sent with thinking off
            </p>
          </div>
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

      {/* Run setup wizard */}
      <div className="pt-2 border-t border-border">
        <button
          onClick={() => {
            setSettingsOpen(false);
            setShowSetupWizard(true);
          }}
          className="text-sm text-text-muted hover:text-accent transition-colors"
        >
          Run setup wizard again
        </button>
      </div>
    </div>
  );
}
