import ReactDOM from 'react-dom/client';
import App from './components/App/App';
import { ThemeProvider } from './components/hooks/useTheme';
import './theme.scss';

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
