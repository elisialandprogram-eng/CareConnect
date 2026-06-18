import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reported: boolean;
}

async function reportErrorToServer(error: Error, errorInfo: ErrorInfo) {
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 2000),
        componentStack: errorInfo.componentStack?.slice(0, 2000),
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Never let error reporting crash anything
  }
}

interface PanelErrorState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight panel-scoped error boundary.
 * Shows an inline card with retry — does NOT take over the full screen.
 * Use this to wrap lazy-loaded dashboard panels so one panel crash doesn't
 * force the user to reload the entire admin dashboard.
 */
export class PanelErrorBoundary extends Component<Props, PanelErrorState> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PanelErrorState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PanelErrorBoundary]", error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/70" />
          <div className="space-y-1">
            <p className="font-medium text-sm text-foreground">This panel failed to load</p>
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground font-mono break-all">{this.state.error.message}</p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={this.handleRetry} data-testid="button-panel-retry">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, reported: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[GlobalErrorBoundary] Unhandled render error:", error, errorInfo);
    if (!this.state.reported) {
      this.setState({ reported: true });
      reportErrorToServer(error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, reported: false });
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, reported: false });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Something went wrong</h1>
              <p className="text-muted-foreground text-sm">
                An unexpected error occurred. Our team has been notified. You can try again or return to the home page.
              </p>
              {this.state.error?.message && (
                <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2 font-mono break-all mt-3">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} data-testid="button-error-retry">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} data-testid="button-error-go-home">
                <Home className="h-4 w-4 mr-2" />
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
