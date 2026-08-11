import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (e.g. on route change). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors in the subtree and shows a fallback instead of
 * unmounting the whole app (which would leave a blank white page). The boundary
 * resets automatically when `resetKey` changes, so navigating to another route
 * recovers from a page-level error.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the error so it is visible in the console for diagnosis.
    console.error('Page error caught by ErrorBoundary:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fv-errboundary" role="alert">
        <div className="fv-errboundary__card">
          <i className="fas fa-triangle-exclamation fv-errboundary__icon" aria-hidden="true" />
          <h1>This page hit an error</h1>
          <p>The rest of the app is still available — use the menu to open another page, or reload.</p>
          <pre className="fv-errboundary__msg">{error.message}</pre>
          <div className="fv-errboundary__actions">
            <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
            <button type="button" className="fv-errboundary__primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
