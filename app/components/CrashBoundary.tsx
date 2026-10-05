// Around the whole app: a render that throws shows one plain sentence instead of an empty page.
// The crash is reported to the dev server by createRoot's onCaughtError (errors.ts), not here.
import { Component, type ReactNode } from "react";
import { crashText } from "../errors.ts";

type Props = { children: ReactNode; onCrash?: (text: string) => void };

export class CrashBoundary extends Component<Props, { text: string | null }> {
  state = { text: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { text: crashText(error instanceof Error ? error.message : String(error)) };
  }

  componentDidCatch(): void {
    if (this.state.text) this.props.onCrash?.(this.state.text);
  }

  render() {
    if (this.state.text) return <div className="crash" role="alert" data-testid="crash">{this.state.text}</div>;
    return this.props.children;
  }
}
