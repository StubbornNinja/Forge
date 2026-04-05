import { useSettingsStore } from '../../stores/settingsStore';

export function PreferencesConfig() {
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
          A small, fast model for generating conversation titles.
        </p>
      </div>
    </div>
  );
}
