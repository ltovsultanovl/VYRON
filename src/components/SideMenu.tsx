interface SideMenuItem {
  label: string;
  active?: boolean;
  counter?: number;
  accent?: boolean;
  onClick?: () => void;
}

export default function SideMenu({
  items,
}: {
  items: (SideMenuItem | "separator")[];
}) {
  return (
    <div className="card side-menu">
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={`separator-${i}`} className="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            className={`side-menu__item ${item.active ? "active" : ""}`}
            onClick={item.onClick}
          >
            {item.label}
            {!!item.counter && item.counter > 0 && (
              <span
                className={`counter ${item.accent ? "counter--accent" : ""}`}
              >
                {item.counter}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
