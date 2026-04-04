import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { ModelConfig } from './ModelConfig';
import { GeneralConfig } from './GeneralConfig';
import { SettingsSkeleton } from '../shared/Skeleton';

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen } = useUIStore();
  const { settings, loading, loadSettings } = useSettingsStore();
  const [advancedMode, setAdvancedMode] = useState(false);

  useEffect(() => {
    if (settingsOpen && !settings) {
      loadSettings();
    }
  }, [settingsOpen, settings, loadSettings]);

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setSettingsOpen(false)}
      />

      {/* Panel */}
      <div className="relative glass-heavy border border-[var(--glass-border-light)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <SettingsSkeleton />
          ) : settings ? (
            <div className="space-y-8">
              {/* Connection & Model — always shown */}
              <ModelConfig mode={advancedMode ? 'advanced' : 'simple'} />

              {/* Advanced sections */}
              {advancedMode && (
                <div className="animate-fadeIn">
                  <GeneralConfig />
                </div>
              )}

              {/* Mode toggle */}
              <div className="pt-2 border-t border-[var(--glass-border)]">
                <button
                  onClick={() => setAdvancedMode(!advancedMode)}
                  className="text-sm text-text-muted hover:text-accent transition-colors"
                >
                  {advancedMode ? 'Show simple settings' : 'Show advanced settings'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-text-muted py-8">Failed to load settings</div>
          )}
        </div>
      </div>
    </div>
  );
}
