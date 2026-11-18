import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || '發生未預期的錯誤',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendlyMsg = `資料同步權限或連線異常：${parsed.error}`;
        }
      } catch {
        // 保持原始文字
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
          <div className="glass-card-strong max-w-md w-full rounded-3xl p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold">畫面暫時遇到狀況</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] break-words">
              {friendlyMsg}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-sm transition active:scale-[0.98]"
              style={{ backgroundColor: 'var(--accent-500)' }}
            >
              <RefreshCw className="h-4 w-4" />
              重新載入空間
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
