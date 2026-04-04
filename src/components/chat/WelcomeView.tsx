import { useConnectionStore } from '../../stores/connectionStore';
import { useUIStore } from '../../stores/uiStore';

const SUGGESTIONS = [
  'What can you do?',
  'Help me write code',
  'Search the web for recent news',
  'Explain a concept to me',
];

interface WelcomeViewProps {
  onSuggestion: (text: string) => void;
}

export function WelcomeView({ onSuggestion }: WelcomeViewProps) {
  const status = useConnectionStore((s) => s.status);
  const { setSettingsOpen } = useUIStore();

  const isConnected = status === 'connected';

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-lg px-4">
        {/* App icon */}
        <div className="mx-auto w-16 h-16 glass-heavy rounded-2xl border border-[var(--glass-border-light)] flex items-center justify-center shadow-lg">
          <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-text-primary">Welcome to Forge</h2>
          <p className="text-text-muted text-sm mt-1">Your local-first AI assistant</p>
        </div>

        {isConnected ? (
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSuggestion(suggestion)}
                className="glass border border-[var(--glass-border)] rounded-full px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:border-[var(--glass-border-light)] transition-all"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          <div className="glass border border-[var(--glass-border)] rounded-xl px-5 py-4 text-sm space-y-2">
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
              <span>Not connected to a model server</span>
            </div>
            <p className="text-text-muted text-xs">
              Start LM Studio or another OpenAI-compatible server, then configure the connection.
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
            >
              Open Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
