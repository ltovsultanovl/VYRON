import { useState } from "react";
import Splash from "../components/Splash";
import { useSnackbar } from "../components/Snackbar";
import { PasswordInput } from "./AuthPage";
import { explainError, setNewPassword } from "../api";

const MIN_PASSWORD = 8;

export default function NewPassword({ onDone }: { onDone: () => void }) {
  const showSnackbar = useSnackbar();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD)
      return setError(`Пароль должен быть не короче ${MIN_PASSWORD} символов`);
    if (password !== repeat) return setError("Пароли не совпадают");
    setLoading(true);
    setError("");
    try {
      await setNewPassword(password);
      showSnackbar("Пароль изменён");
      onDone();
    } catch (err) {
      setError(explainError(err));
      setLoading(false);
    }
  };

  return (
    <Splash>
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1 className="auth-card__title">Новый пароль</h1>
        <p className="auth-card__text">Придумайте новый пароль для входа.</p>
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder={`Новый пароль (минимум ${MIN_PASSWORD} символов)`}
          autoComplete="new-password"
          autoFocus
        />
        <PasswordInput
          value={repeat}
          onChange={setRepeat}
          placeholder="Повторите пароль"
          autoComplete="new-password"
        />
        {error && <div className="form-row__error">{error}</div>}
        <button className="btn auth-card__submit" disabled={loading}>
          {loading ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </Splash>
  );
}
