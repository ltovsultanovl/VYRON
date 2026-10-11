import { useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import Avatar from "./Avatar";
import { useFriends } from "../context/FriendsContext";
import type { Person } from "../types";

// Отметки в комментариях, как в VK. В поле человек видит «@Анна Смирнова»,
// а в базу уходит «[id<uuid>|Анна Смирнова]» — по нему база шлёт уведомление нужному человеку
const MENTION_RE = /\[id([0-9a-f-]{36})\|([^\]]{1,100})\]/g;
const QUERY_RE = /(?:^|\s)@([^\s@]{0,30})$/; // «@анн» прямо перед курсором

// Имя в разметке не должно ломать её
const safeName = (name: string) => name.replace(/[[\]|]/g, "").trim();

// Текст комментария: отметки — ссылками на страницу человека
export function MentionText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    parts.push(text.slice(from, m.index));
    parts.push(
      <a key={m.index} href={`#user/${m[1]}`} className="mention">
        {m[2]}
      </a>,
    );
    from = m.index + m[0].length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

// Для превью и уведомлений: только имена
export const plainMentions = (text: string) => text.replace(MENTION_RE, "$2");

// Поле с отметками: подсказки друзей после «@», выбор стрелками и Enter, превращение в разметку при отправке
export function useMentions(value: string, setValue: (value: string) => void, inputRef: RefObject<HTMLInputElement | null>) {
  const { friends } = useFriends();
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const items =
    query === null ? [] : friends.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const remember = (person: Pick<Person, "id" | "name">) =>
    setPicked((list) => [...list.filter((x) => x.id !== person.id), { id: person.id, name: safeName(person.name) }]);

  // Есть ли «@что-то» прямо перед курсором — тогда показываем подсказки
  const detect = () => {
    const el = inputRef.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = before.match(QUERY_RE);
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const pick = (person: Person) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${safeName(person.name)} `);
    const next = before + value.slice(caret);
    setValue(next);
    remember(person);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  // «Ответить»: «@Анна Смирнова, » в начало — и она узнает об ответе
  const replyTo = (person: Person) => {
    const text = `@${safeName(person.name)}, `;
    setValue(text);
    remember(person);
    setQuery(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(text.length, text.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation(); // закрываем подсказки, а не просмотр фото
      setQuery(null);
    }
  };

  // Перед отправкой: «@Анна Смирнова» → «[id…|Анна Смирнова]» (длинные имена первыми)
  const encode = (text: string) =>
    [...picked]
      .sort((a, b) => b.name.length - a.name.length)
      .reduce((out, p) => out.split(`@${p.name}`).join(`[id${p.id}|${p.name}]`), text);

  const reset = () => {
    setPicked([]);
    setQuery(null);
  };

  const list = items.length ? <MentionList items={items} active={active} onPick={pick} /> : null;
  return { list, detect, onKeyDown, encode, reset, replyTo };
}

function MentionList({ items, active, onPick }: { items: Person[]; active: number; onPick: (p: Person) => void }) {
  return (
    <div className="mention-list" role="listbox" aria-label="Отметить друга">
      {items.map((p, i) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={i === active}
          className={`mention-list__item ${i === active ? "active" : ""}`}
          // mousedown: поле не теряет фокус, пока выбираем
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(p);
          }}
        >
          <Avatar name={p.name} color={p.color} src={p.avatar} size={28} />
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}
