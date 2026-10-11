import Logo from "./Logo";
import type { ReactNode } from "react";

export default function Splash({
  error,
  onRetry,
  children,
}: {
  error?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="splash">
      <div className="splash__logo">
        <Logo height={34} />
      </div>
      {children ??
        (error ? (
          <div className="splash__error" role="alert">
            <p>{error}</p>
            {onRetry && (
              <button className="btn" onClick={onRetry}>
                Повторить
              </button>
            )}
          </div>
        ) : (
          <div
            className="chat-status__spinner"
            role="status"
            aria-label="Загрузка"
          />
        ))}
    </div>
  );
}
