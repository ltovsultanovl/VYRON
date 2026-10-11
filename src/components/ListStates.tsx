import { CloseIcon, SearchIcon } from "./Icons";

export function Loading() {
  return (
    <div className="list-state" role="status">
      <div className="chat-status__spinner" />
    </div>
  );
}

export function Failed({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="list-state" role="alert">
      {error}
      <button className="btn" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="friends-search">
      <label className="search">
        <SearchIcon size={16} />
        <input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onChange("")}
          autoFocus={autoFocus}
        />
        {value && (
          <button
            type="button"
            className="search__clear"
            title="Очистить"
            onClick={() => onChange("")}
          >
            <CloseIcon size={16} />
          </button>
        )}
      </label>
    </div>
  );
}
