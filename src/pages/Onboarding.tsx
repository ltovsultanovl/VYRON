import { useState } from "react";
import Splash from "../components/Splash";
import { explainError, signOut } from "../api";
import { avatarColors } from "../data";
import { validateName } from "../profile";
import type { NewProfile } from "../context/ProfileContext";

export default function Onboarding({ onSubmit }: { onSubmit: (data: NewProfile) => Promise<void> }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = {
      firstName: validateName(firstName, "имя"),
      lastName: validateName(lastName, "фамилию"),
    };
    setErrors(next);
    if (next.firstName || next.lastName) return;

    setLoading(true);
    setServerError("");
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        color: avatarColors[Math.floor(Math.random() * avatarColors.length)],
      });
    } catch (e) {
      setServerError(explainError(e));
      setLoading(false);
    }
  };

  return (
    <Splash>
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1 className="auth-card__title">Как вас зовут?</h1>
        <p className="auth-card__text">
          Имя и фамилию увидят ваши друзья. Поменять их можно в настройках
          профиля.
        </p>
        <input
          className={`field ${errors.firstName ? "field--invalid" : ""}`}
          placeholder="Имя"
          autoComplete="given-name"
          maxLength={32}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoFocus
        />
        {errors.firstName && (
          <div className="form-row__error">{errors.firstName}</div>
        )}
        <input
          className={`field ${errors.lastName ? "field--invalid" : ""}`}
          placeholder="Фамилия"
          autoComplete="family-name"
          maxLength={32}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        {errors.lastName && (
          <div className="form-row__error">{errors.lastName}</div>
        )}
        {serverError && <div className="form-row__error">{serverError}</div>}
        <button className="btn auth-card__submit" disabled={loading}>
          {loading ? "Сохраняем…" : "Продолжить"}
        </button>
        <div className="auth-card__links">
          <button
            type="button"
            className="btn btn--tertiary"
            onClick={() => signOut()}
          >
            Войти в другой аккаунт
          </button>
        </div>
      </form>
    </Splash>
  );
}
