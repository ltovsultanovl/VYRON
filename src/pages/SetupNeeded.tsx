import Splash from "../components/Splash";

export default function SetupNeeded() {
  return (
    <Splash>
      <div className="card auth-card">
        <h1 className="auth-card__title">Подключите Supabase</h1>
        <ol className="setup-steps">
          <li>Создайте проект на supabase.com.</li>
          <li>
            В SQL Editor выполните файл <code>supabase/schema.sql</code> из
            проекта.
          </li>
          <li>
            Скопируйте <code>.env.example</code> в <code>.env.local</code> и
            вставьте Project URL и anon key из Project Settings → API.
          </li>
          <li>
            Перезапустите <code>npm run dev</code>.
          </li>
        </ol>
      </div>
    </Splash>
  );
}
