import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-6 bg-mizan-bg px-8 text-center">
          <p className="text-mizan-text text-2xl font-bold">Something went wrong</p>
          <p className="text-mizan-text/50 max-w-sm text-sm leading-relaxed">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-mizan-success text-mizan-textOnDark rounded-2xl px-8 py-3 text-sm font-semibold active:scale-95"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
