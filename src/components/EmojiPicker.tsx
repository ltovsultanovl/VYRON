import { useState, type RefObject } from "react";
import { SmileIcon } from "./Icons";
import { useDropdown, useStoredState } from "../hooks";

const RECENT_LIMIT = 24;

const CATEGORIES = [
  {
    id: "smiles",
    icon: "😀",
    label: "Смайлы",
    emoji:
      "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖",
  },
  {
    id: "gestures",
    icon: "👍",
    label: "Жесты",
    emoji:
      "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🫶 👀 🧠 💅 🤳",
  },
  {
    id: "hearts",
    icon: "❤️",
    label: "Сердца",
    emoji:
      "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥 💋 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟",
  },
  {
    id: "animals",
    icon: "🐶",
    label: "Животные",
    emoji:
      "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦅 🦉 🐺 🐴 🦄 🐝 🦋 🐢 🐍 🐙 🐬 🐳 🦈 🌸 🌹 🌻 🌷 🌲 🍀 🌈 ☀️ 🌙 ⛄",
  },
  {
    id: "food",
    icon: "🍔",
    label: "Еда",
    emoji:
      "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🥐 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🥪 🌮 🍝 🍜 🍣 🍰 🎂 🧁 🍩 🍪 🍫 🍬 🍿 ☕ 🍵 🧃 🥤",
  },
  {
    id: "activities",
    icon: "🎉",
    label: "Праздник",
    emoji:
      "🎉 🎊 🎁 🎈 🎄 🎃 🏆 🥇 ⚽ 🏀 🏐 🎾 🥊 🎮 🎲 🎯 🎵 🎶 🎤 🎧 🎸 🎬 📸 💻 📱 ⏰ 💡 📚 ✏️ 💰 🚗 ✈️ 🚀 🏠 🌍 ✅ ❌ ❓ ❗ 🆗",
  },
].map((c) => ({ ...c, emoji: c.emoji.split(" ") }));

type TextField = HTMLInputElement | HTMLTextAreaElement;

function insertAtCursor(
  input: TextField | null | undefined,
  value: string,
  onChange: (next: string) => void,
  text: string,
) {
  const start = input?.selectionStart ?? value.length;
  const end = input?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  if (input && input.maxLength > 0 && next.length > input.maxLength) return;
  onChange(next);
  requestAnimationFrame(() => {
    if (!input) return;
    input.focus();
    const caret = start + text.length;
    input.setSelectionRange(caret, caret);
  });
}

export default function EmojiPicker({
  inputRef,
  value,
  onChange,
  placement = "top",
  align = "right",
  size = 22,
}: {
  inputRef: RefObject<TextField | null>;
  value: string;
  onChange: (next: string) => void;
  placement?: "top" | "bottom";
  align?: "left" | "right";
  size?: number;
}) {
  const menu = useDropdown();
  const [recent, setRecent] = useStoredState<string[]>("emoji:recent", []);
  const [tab, setTab] = useState(() => (recent.length ? "recent" : "smiles"));

  const tabs = recent.length
    ? [
        { id: "recent", icon: "🕘", label: "Недавние", emoji: recent },
        ...CATEGORIES,
      ]
    : CATEGORIES;
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  const pick = (emoji: string) => {
    insertAtCursor(inputRef.current, value, onChange, emoji);
    setRecent((list) =>
      [emoji, ...list.filter((e) => e !== emoji)].slice(0, RECENT_LIMIT),
    );
  };

  return (
    <div className="emoji" ref={menu.ref}>
      <button
        type="button"
        className={`icon-btn emoji__trigger ${menu.open ? "emoji__trigger--open" : ""}`}
        title="Смайлики"
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={menu.toggle}
      >
        <SmileIcon size={size} />
      </button>

      {menu.open && (
        <div
          className={`emoji__panel emoji__panel--${placement} emoji__panel--${align}`}
          role="dialog"
          aria-label="Смайлики"
        >
          <div className="emoji__title">{current.label}</div>
          <div className="emoji__grid" onMouseDown={(e) => e.preventDefault()}>
            {current.emoji.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji__item"
                onClick={() => pick(emoji)}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="emoji__tabs" onMouseDown={(e) => e.preventDefault()}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`emoji__tab ${t.id === current.id ? "emoji__tab--active" : ""}`}
                onClick={() => setTab(t.id)}
                title={t.label}
              >
                {t.icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
