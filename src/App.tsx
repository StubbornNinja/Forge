import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { useUIStore } from './stores/uiStore';
import { useSettingsStore } from './stores/settingsStore';
import { useChatStore } from './stores/chatStore';

function App() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const settings = useSettingsStore((s) => s.settings);
  const enterDraft = useChatStore((s) => s.enterDraft);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Apply theme to document root
  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [settings?.theme]);

  // Track fullscreen state — traffic lights disappear when fullscreen
  useEffect(() => {
    const win = getCurrentWindow();
    win.isFullscreen().then(setIsFullscreen);

    let unlisten: (() => void) | undefined;
    win.onResized(async () => {
      setIsFullscreen(await win.isFullscreen());
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  const handleNewChat = () => {
    enterDraft();
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden text-text-primary">
      {/* Unified top bar — spans full width */}
      <div
        data-tauri-drag-region
        className="flex-shrink-0 flex items-center h-[54px] px-4 glass border-b border-[var(--glass-border)] z-50"
      >
        {/* Left section: traffic light padding collapses in fullscreen */}
        <div data-tauri-drag-region className={`flex items-center gap-1 ${isFullscreen ? 'pl-0' : 'pl-[64px]'} transition-all duration-200`}>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-text-secondary hover:text-text-primary transition-colors"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5} />
              <path strokeLinecap="round" strokeWidth={1.5} d="M9 3v18" />
            </svg>
          </button>
          <button
            onClick={handleNewChat}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-text-secondary hover:text-text-primary transition-colors"
            title="New conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        {/* Draggable spacer */}
        <div data-tauri-drag-region className="flex-1 h-full" />
      </div>

      {/* Main content below top bar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? 'w-[280px]' : 'w-0'
          } transition-all duration-200 flex-shrink-0 overflow-hidden`}
        >
          <Sidebar />
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatView />
        </div>
      </div>

      {/* Settings modal */}
      <SettingsPanel />
    </div>
  );
}

export default App;
