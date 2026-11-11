import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  err?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  render() {
    if (this.state.err) {
      return (
        <div className="panel" style={{ margin: 20 }}>
          <div className="err" style={{ marginBottom: 12 }}>
            UI Error: {this.state.err.message}
          </div>
          <button
            className="btn"
            onClick={() => {
              this.setState({ err: undefined });
              this.props.onReset?.();
            }}
          >
            Back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
