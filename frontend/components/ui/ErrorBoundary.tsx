'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside boundary:', error, errorInfo);
    
    // Log exception to Sentry
    Sentry.captureException(error, { extra: errorInfo as any });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 bg-[#161B22] rounded-2xl border border-[#30363D] text-center space-y-4 max-w-lg mx-auto my-8">
          <div className="w-12 h-12 bg-red-500/10 text-red-500 flex items-center justify-center rounded-full">
            <AlertCircle size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white">Component crashed</h3>
            <p className="text-sm text-[#8B949E] max-w-sm">
              An unexpected error occurred in this view. This has been reported to Sentry.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#21262D] hover:bg-[#30363D] transition border border-[#30363D] rounded-xl text-sm font-medium text-white shadow-sm"
          >
            <RefreshCw size={14} />
            Reload component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
