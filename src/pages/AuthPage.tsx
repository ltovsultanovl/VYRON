import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Splash from "../components/Splash";
import {
  explainError,
  sendLoginEmail,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  verifyLoginCode,
} from "../api";

const RESEND_SECONDS = 60;
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = "login" | "register" | "reset" | "link";

interface FormProps {
  email: string;
  setEmail: (email: string) => void;
  go: (mode: Mode) => void;
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function PasswordInput({
  value,
  onChange,
  placeholder = "Пароль",
  autoComplete,
  invalid = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input
        className={`field ${invalid ? "field--invalid" : ""}`}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
      >
        {visible ? "Скрыть" : "Показать"}
      </button>
    </div>
  );
}

function useSubmit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, setError, run };
}

function Card({
  title,
  text,
  children,
  onSubmit,
}: {
  title: string;
  text?: ReactNode;
  children: ReactNode;
  onSubmit?: (e: FormEvent) => void;
}) {
  return (
    <Splash>
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <h1 className="auth-card__title">{title}</h1>
        {text && <p className="auth-card__text">{text}</p>}
        {children}
      </form>
    </Splash>
  );
}

const Links = ({ children }: { children: ReactNode }) => (
  <div className="auth-card__links">{children}</div>
);
const LinkButton = ({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    className="btn btn--tertiary"
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

function Login({ email, setEmail, go }: FormProps) {
  const [password, setPassword] = useState("");
  const { loading, error, setError, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const address = normalizeEmail(email);
    if (!EMAIL_RE.test(address))
      return setError("Введите адрес почты, например name@mail.ru");
    if (!password) return setError("Введите пароль");
    run(() => signInWithPassword(address, password));
  };

  return (
    <Card title="Вход в VYRON" onSubmit={submit}>
      <input
        className={`field ${error ? "field--invalid" : ""}`}
        type="email"
        autoComplete="email"
        placeholder="Электронная почта"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      <PasswordInput
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        invalid={!!error}
      />
      {error && <div className="form-row__error">{error}</div>}
      <button className="btn auth-card__submit" disabled={loading}>
        {loading ? "Входим…" : "Войти"}
      </button>
      <Links>
        <LinkButton onClick={() => go("reset")}>Забыли пароль?</LinkButton>
        <LinkButton onClick={() => go("link")}>
          Войти по ссылке из письма
        </LinkButton>
      </Links>
      <div className="auth-card__switch">
        Нет аккаунта?{" "}
        <button type="button" className="link" onClick={() => go("register")}>
          Зарегистрироваться
        </button>
      </div>
    </Card>
  );
}

function Register({ email, setEmail, go }: FormProps) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  const { loading, error, setError, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const address = normalizeEmail(email);
    if (!EMAIL_RE.test(address))
      return setError("Введите адрес почты, например name@mail.ru");
    if (password.length < MIN_PASSWORD)
      return setError(`Пароль должен быть не короче ${MIN_PASSWORD} символов`);
    if (password !== repeat) return setError("Пароли не совпадают");
    run(async () => {
      const { needsConfirmation } = await signUpWithPassword(address, password);
      if (needsConfirmation) setConfirmSentTo(address);
    });
  };

  if (confirmSentTo) {
    return (
      <Card
        title="Подтвердите почту"
        text={
          <>
            Мы отправили письмо на <b>{confirmSentTo}</b>. Откройте ссылку из
            него в этом браузере — и аккаунт будет готов.
          </>
        }
      >
        <Links>
          <LinkButton onClick={() => go("login")}>
            Уже подтвердил — войти
          </LinkButton>
        </Links>
      </Card>
    );
  }

  return (
    <Card
      title="Регистрация"
      text="Придумайте пароль — им вы будете входить на сайт."
      onSubmit={submit}
    >
      <input
        className="field"
        type="email"
        autoComplete="email"
        placeholder="Электронная почта"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      <PasswordInput
        value={password}
        onChange={setPassword}
        placeholder={`Пароль (минимум ${MIN_PASSWORD} символов)`}
        autoComplete="new-password"
      />
      <PasswordInput
        value={repeat}
        onChange={setRepeat}
        placeholder="Повторите пароль"
        autoComplete="new-password"
      />
      {error && <div className="form-row__error">{error}</div>}
      <button className="btn auth-card__submit" disabled={loading}>
        {loading ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </button>
      <div className="auth-card__switch">
        Уже есть аккаунт?{" "}
        <button type="button" className="link" onClick={() => go("login")}>
          Войти
        </button>
      </div>
    </Card>
  );
}

function Reset({ email, setEmail, go }: FormProps) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { loading, error, setError, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const address = normalizeEmail(email);
    if (!EMAIL_RE.test(address))
      return setError("Введите адрес почты, например name@mail.ru");
    run(async () => {
      await sendPasswordReset(address);
      setSentTo(address);
    });
  };

  if (sentTo) {
    return (
      <Card
        title="Проверьте почту"
        text={
          <>
            Если аккаунт с адресом <b>{sentTo}</b> есть, мы отправили на него
            ссылку для смены пароля. Откройте её в этом браузере.
          </>
        }
      >
        <Links>
          <LinkButton onClick={() => go("login")}>
            Вернуться ко входу
          </LinkButton>
        </Links>
      </Card>
    );
  }

  return (
    <Card
      title="Восстановление пароля"
      text="Пришлём ссылку, по которой можно задать новый пароль."
      onSubmit={submit}
    >
      <input
        className={`field ${error ? "field--invalid" : ""}`}
        type="email"
        autoComplete="email"
        placeholder="Электронная почта"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      {error && <div className="form-row__error">{error}</div>}
      <button className="btn auth-card__submit" disabled={loading}>
        {loading ? "Отправляем…" : "Отправить ссылку"}
      </button>
      <Links>
        <LinkButton onClick={() => go("login")}>Вернуться ко входу</LinkButton>
      </Links>
    </Card>
  );
}

function MagicLink({ email, setEmail, go }: FormProps) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const { loading, error, setError, run } = useSubmit();

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = (address: string) =>
    run(async () => {
      await sendLoginEmail(address);
      setSentTo(address);
      setCooldown(RESEND_SECONDS);
    });

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    const address = normalizeEmail(email);
    if (!EMAIL_RE.test(address))
      return setError("Введите адрес почты, например name@mail.ru");
    send(address);
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (sentTo) run(() => verifyLoginCode(sentTo, code.trim()));
  };

  if (sentTo) {
    return (
      <Card
        title="Проверьте почту"
        text={
          <>
            Мы отправили письмо на <b>{sentTo}</b>. Откройте ссылку из письма в
            этом браузере — или введите код, если он есть в письме.
          </>
        }
        onSubmit={submitCode}
      >
        <input
          className={`field auth-card__code ${error ? "field--invalid" : ""}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="Код из письма"
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
        {error && <div className="form-row__error">{error}</div>}
        <button
          className="btn auth-card__submit"
          disabled={loading || code.length < 6}
        >
          {loading ? "Проверяем…" : "Войти"}
        </button>
        <Links>
          <LinkButton
            disabled={loading || cooldown > 0}
            onClick={() => send(sentTo)}
          >
            {cooldown > 0
              ? `Отправить ещё раз через ${cooldown} с`
              : "Отправить письмо ещё раз"}
          </LinkButton>
          <LinkButton onClick={() => go("login")}>Войти по паролю</LinkButton>
        </Links>
      </Card>
    );
  }

  return (
    <Card
      title="Вход по ссылке"
      text="Пришлём на почту ссылку для входа — без пароля."
      onSubmit={submitEmail}
    >
      <input
        className={`field ${error ? "field--invalid" : ""}`}
        type="email"
        autoComplete="email"
        placeholder="Электронная почта"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError("");
        }}
        autoFocus
      />
      {error && <div className="form-row__error">{error}</div>}
      <button
        className="btn auth-card__submit"
        disabled={loading || !email.trim()}
      >
        {loading ? "Отправляем…" : "Получить ссылку для входа"}
      </button>
      <Links>
        <LinkButton onClick={() => go("login")}>Войти по паролю</LinkButton>
      </Links>
    </Card>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const props = { email, setEmail, go: setMode };

  if (mode === "register") return <Register key="register" {...props} />;
  if (mode === "reset") return <Reset key="reset" {...props} />;
  if (mode === "link") return <MagicLink key="link" {...props} />;
  return <Login key="login" {...props} />;
}
