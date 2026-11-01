import { isTranslationError } from "@t3tools/client-runtime/i18n";
import { Component, type ReactNode } from "react";

export class InterfaceErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  override state: { readonly error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  private handleError = (event: ErrorEvent) => {
    if (isTranslationError(event.error)) {
      this.setState({ error: event.error });
    }
  };

  private handleRejection = (event: PromiseRejectionEvent) => {
    if (isTranslationError(event.reason)) {
      this.setState({ error: event.reason });
    }
  };

  override componentDidMount() {
    window.addEventListener("error", this.handleError);
    window.addEventListener("unhandledrejection", this.handleRejection);
  }

  override componentWillUnmount() {
    window.removeEventListener("error", this.handleError);
    window.removeEventListener("unhandledrejection", this.handleRejection);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-lg font-semibold">Oberflächenfehler / Interface error</h1>
        <p>Die Oberfläche konnte nicht geladen werden. / The interface could not be loaded.</p>
        <pre className="max-w-full overflow-auto whitespace-pre-wrap text-sm">{error.message}</pre>
        <button
          type="button"
          className="rounded border px-4 py-2"
          onClick={() => window.location.reload()}
        >
          Neu laden / Reload
        </button>
      </main>
    );
  }
}
