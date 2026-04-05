import { useEffect, useState } from 'react';
import { getName, getVersion, getTauriVersion } from '@tauri-apps/api/app';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { ModelConfig } from './ModelConfig';
import { PreferencesConfig } from './PreferencesConfig';
import { AdvancedConfig } from './AdvancedConfig';
import { SettingsSkeleton } from '../shared/Skeleton';

type SettingsTab = 'model' | 'preferences' | 'advanced';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'model', label: 'Model' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'advanced', label: 'Advanced' },
];

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen } = useUIStore();
  const { settings, loading, loadSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('model');
  const [appInfo, setAppInfo] = useState<{ name: string; version: string; tauri: string } | null>(null);

  useEffect(() => {
    if (settingsOpen && !settings) {
      loadSettings();
    }
  }, [settingsOpen, settings, loadSettings]);

  // Fetch app version info when panel opens
  useEffect(() => {
    if (settingsOpen && !appInfo) {
      Promise.all([getName(), getVersion(), getTauriVersion()]).then(
        ([name, version, tauri]) => setAppInfo({ name, version, tauri })
      );
    }
  }, [settingsOpen, appInfo]);

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
        <div className="flex-shrink-0 px-6 pt-4 pb-0">
          <div className="flex items-center justify-between mb-4">
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

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-[var(--glass-border)]">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-accent'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <SettingsSkeleton />
          ) : settings ? (
            <>
              {activeTab === 'model' && <ModelConfig />}
              {activeTab === 'preferences' && <PreferencesConfig />}
              {activeTab === 'advanced' && <AdvancedConfig />}
            </>
          ) : (
            <div className="text-center text-text-muted py-8">Failed to load settings</div>
          )}
        </div>

        {/* Version footer */}
        {appInfo && (
          <div className="flex-shrink-0 px-6 py-3 border-t border-[var(--glass-border)] text-xs text-text-muted">
            {appInfo.name} v{appInfo.version} &middot; Tauri {appInfo.tauri}
          </div>
        )}
      </div>
    </div>
  );
}
