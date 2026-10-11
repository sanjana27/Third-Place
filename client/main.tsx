import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './app.css';

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep profile data and assistant tokens out of browser logs.
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="page-error">
          <img src="/mark.svg" alt="" width="48" height="48" />
          <p className="eyebrow">THIRD PLACE</p>
          <h1>Let’s find our place again.</h1>
          <p>Something interrupted this page. Reload to recover your saved demo activity.</p>
          <button className="button button--primary" onClick={() => window.location.reload()}>
            Reload Third Place
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PageBoundary><App /></PageBoundary>
    </StrictMode>,
  );
}
