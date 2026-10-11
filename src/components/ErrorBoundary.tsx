import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (reset: () => void) => ReactNode;
}

export default class ErrorBoundary extends Component<
  Props,
  { error: unknown }
> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Ошибка отрисовки:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div className="card error-screen" role="alert">
        <div className="error-screen__title">Что-то пошло не так</div>
        <p className="error-screen__text">
          Страница не смогла загрузиться. Попробуйте обновить её — ваши данные
          сохранены.
        </p>
        <button className="btn" onClick={() => location.reload()}>
          Обновить страницу
        </button>
      </div>
    );
  }
}
