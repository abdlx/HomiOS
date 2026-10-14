import { Component, type ReactNode } from "react";
import { Button, EmptyState } from "./surfaces";
/** A failed feature must leave the desktop and the rest of the server usable. */
export default class FeatureBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean; revision: number }
> {
  state = { failed: false, revision: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error);
  }
  render() {
    if (this.state.failed)
      return (
        <EmptyState
          error
          title={`${this.props.name} could not be displayed`}
          description="Your server is still running. Try opening this view again."
          action={
            <Button
              onClick={() =>
                this.setState((state) => ({
                  failed: false,
                  revision: state.revision + 1,
                }))
              }
            >
              Try again
            </Button>
          }
        />
      );
    return (
      <div key={this.state.revision} className="contents">
        {this.props.children}
      </div>
    );
  }
}
