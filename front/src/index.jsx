import ReactDOM from 'react-dom/client';
import App from './components/App/App';
import { ThemeProvider } from './components/hooks/ui/useTheme';
import posthog from 'posthog-js';
import { trackPostHogPageView } from './helpers/analytics';
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
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<RootComponent />);
