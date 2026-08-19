import ReactDOM from 'react-dom/client';
import App from './components/App/App';
import RootErrorBoundary from './components/App/RootErrorBoundary';
import { ThemeProvider } from './components/hooks/ui/useTheme';
import posthog from 'posthog-js';
import { trackPostHogPageView } from './helpers/analytics';
import { reportError } from './errors/reportError';
import './theme.scss';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    capture_pageview: false,
    persistence: 'localStorage',
  });
  window.posthog = posthog;
  posthog.startSessionRecording(true);
  trackPostHogPageView();
}

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
