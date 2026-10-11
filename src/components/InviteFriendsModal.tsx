import { useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { SearchIcon } from "./Icons";
import { useSnackbar } from "./Snackbar";
import { useFriends } from "../context/FriendsContext";
import { explainError, inviteToCommunity } from "../api";
import type { Community, Person } from "../types";

export default function InviteFriendsModal({
  community,
  knownIds = new Set(),
  onClose,
}: {
  community: Pick<Community, "id">;
  knownIds?: Set<string>;
  onClose: () => void;
}) {
  const { friends } = useFriends();
  const showSnackbar = useSnackbar();
  const [query, setQuery] = useState("");
  const [invited, setInvited] = useState(() => new Set<string>());
  const list = friends.filter((f) =>
    f.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const invite = async (friend: Person) => {
    try {
      await inviteToCommunity(community.id, friend.id);
      setInvited((set) => new Set(set).add(friend.id));
    } catch (e) {
      showSnackbar(explainError(e), "error");
    }
  };

  return (
    <Modal title="Пригласить друзей" onClose={onClose} width={440}>
      <label className="search share__search">
        <SearchIcon size={16} />
        <input
          type="search"
          placeholder="Поиск друзей"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>
      <div className="share__list">
        {list.map((f) => {
          const done = invited.has(f.id) || knownIds.has(f.id);
          return (
            <div key={f.id} className="share__person">
              <Avatar name={f.name} color={f.color} src={f.avatar} size={40} />
              <span className="share__name">{f.name}</span>
              <button
                className={`btn ${done ? "btn--neutral" : ""}`}
                disabled={done}
                onClick={() => invite(f)}
              >
                {done
                  ? invited.has(f.id)
                    ? "Приглашение отправлено"
                    : "Уже в сообществе"
                  : "Пригласить"}
              </button>
            </div>
          );
        })}
        {!list.length && (
          <div className="empty empty--compact">
            {friends.length
              ? "Никого не нашлось"
              : "Пока нет друзей, которых можно пригласить"}
          </div>
        )}
      </div>
    </Modal>
  );
}
