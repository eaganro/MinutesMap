import ReactDOM from 'react-dom/client';
import App from './components/App/App';
import RootErrorBoundary from './components/App/RootErrorBoundary';
import { ThemeProvider } from './components/hooks/ui/useTheme';
import { configureAnalytics, startAnalytics } from './helpers/analytics';
import { reportError } from './errors/reportError';
import './theme.scss';

// PostHog loads once the first game's data is in (see useAnalyticsSignals), or after this
// long on pages without one (a game that hasn't started, an error).
const ANALYTICS_START_FALLBACK_MS = 3000;

configureAnalytics({
  key: import.meta.env.VITE_POSTHOG_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST,
});
window.setTimeout(startAnalytics, ANALYTICS_START_FALLBACK_MS);

function RootComponent() {
  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </RootErrorBoundary>
  );
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container, {
  onRecoverableError: (error, errorInfo) => {
    reportError(error, {
      boundary: 'react-recoverable',
      component_stack: errorInfo?.componentStack,
    });
  },
});
root.render(<RootComponent />);
