import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { useChatStore } from '../../stores/chatStore';
import { useConversationStore } from '../../stores/conversationStore';
import { api } from '../../lib/tauri';

export function AdvancedConfig() {
  const { settings, updateSettings } = useSettingsStore();
  const { setShowSetupWizard, setSettingsOpen } = useUIStore();

  if (!settings) return null;

  const searchBackend = settings.search_backend || 'auto';

  return (
    <div className="space-y-6">
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

            {/* Brave API key */}
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

            {/* SearXNG URL */}
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

      {/* Danger zone */}
      <DeleteAllChats />
    </div>
  );
}

function DeleteAllChats() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteAllConversations();
      // Reset frontend state
      useChatStore.getState().setMessages([]);
      useChatStore.getState().setActiveConversation(null);
      useChatStore.getState().enterDraft();
      useConversationStore.getState().loadConversations();
      setConfirming(false);
    } catch (err) {
      console.error('Failed to delete conversations:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="pt-4 border-t border-red-500/20">
      <h3 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h3>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          Delete all conversations
        </button>
      ) : (
        <div className="glass border border-red-500/20 rounded-lg px-4 py-3 space-y-3 animate-fadeIn">
          <p className="text-sm text-red-300">
            This will permanently delete all conversations and messages. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Yes, delete everything'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 hover:bg-[var(--hover-bg)] text-text-muted rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
