import ReactDOM from 'react-dom/client';
import App from './components/App/App';
import { ThemeProvider } from './components/hooks/useTheme';
import ReactGA from 'react-ga4';
import posthog from 'posthog-js';
import './theme.scss';

const gaId = import.meta.env.VITE_GA_ID;
if (gaId) {
  ReactGA.initialize(gaId);
  ReactGA.send({
    hitType: 'pageview',
    page: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    title: document.title,
  });
}

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
    capture_pageview: false,
  });
  posthog.capture('$pageview');
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
