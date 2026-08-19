import { Component } from 'react';
import { reportError } from '../../errors/reportError';

import './RootErrorBoundary.scss';

export default class RootErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    reportError(error, {
      boundary: 'root-render',
      component_stack: errorInfo.componentStack,
    });
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="rootError" role="alert">
        <div className="rootErrorCard">
          <h1>MinutesMap hit an unexpected error</h1>
          <p>Your browser can try rendering the application again.</p>
          <button type="button" onClick={this.retry}>
            Try again
          </button>
        </div>
      </main>
    );
  }
}
