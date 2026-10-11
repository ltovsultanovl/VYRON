import { useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { Navigate, Profile } from "../types";
import { useProfile } from "../context/ProfileContext";
import { useSnackbar } from "../components/Snackbar";
import SideMenu from "../components/SideMenu";
import {
  INTERESTS,
  MONTHS,
  daysInMonth,
  relationOptions,
  validateName,
} from "../profile";

type Section = "main" | "contacts" | "interests" | "education" | "career";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "main", label: "Основное" },
  { id: "contacts", label: "Контакты" },
  { id: "interests", label: "Интересы" },
  { id: "education", label: "Образование" },
  { id: "career", label: "Карьера" },
];

const EDITABLE = [
  "firstName",
  "lastName",
  "gender",
  "relation",
  "birthDay",
  "birthMonth",
  "birthYear",
  "birthVisibility",
  "hometown",
  "languages",
  "contacts",
  "interests",
  "education",
  "career",
] as const satisfies readonly (keyof Profile)[];

type Draft = Pick<Profile, (typeof EDITABLE)[number]>;
type Group = "contacts" | "interests" | "education" | "career";

const pick = (obj: Profile) => Object.fromEntries(EDITABLE.map((k) => [k, obj[k]])) as Draft;

const phoneOnly = (value: string) => value.replace(/[^\d+()\- ]/g, "");

const THIS_YEAR = new Date().getFullYear();
const range = (from: number, to: number) =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, i) =>
    String(from < to ? from + i : from - i),
  );

const BIRTH_YEARS = range(THIS_YEAR - 14, 1920);
const STUDY_YEARS = range(THIS_YEAR + 6, 1950);
const WORK_YEARS = range(THIS_YEAR, 1950);
const COUNTRIES = [
  "Россия",
  "Беларусь",
  "Казахстан",
  "Узбекистан",
  "Армения",
  "Грузия",
  "Другая",
];

function Row({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="form-row">
      <div className="form-row__label">{label}</div>
      <div className="form-row__field">
        {children}
        {error && <div className="form-row__error">{error}</div>}
        {!error && hint && <div className="form-row__hint">{hint}</div>}
      </div>
    </div>
  );
}

type FieldProps<E> = Omit<E, "value" | "onChange"> & { value: string; onChange: (value: string) => void };

const Input = ({
  value,
  onChange,
  invalid,
  ...rest
}: FieldProps<InputHTMLAttributes<HTMLInputElement>> & { invalid?: boolean | string }) => (
  <input
    className={`field ${invalid ? "field--invalid" : ""}`}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    {...rest}
  />
);

const TextArea = ({ value, onChange, ...rest }: FieldProps<TextareaHTMLAttributes<HTMLTextAreaElement>>) => (
  <textarea
    className="field field--textarea"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    rows={2}
    {...rest}
  />
);

const Select = <V extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: V;
  onChange: (value: V) => void;
  options: readonly (V | { value: V; label: string })[];
  placeholder?: string;
}) => (
  <select className="field field--select" value={value} onChange={(e) => onChange(e.target.value as V)}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((o) =>
      typeof o === "string" ? (
        <option key={o} value={o}>
          {o}
        </option>
      ) : (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ),
    )}
  </select>
);

export default function EditProfile({ onNavigate }: { onNavigate: Navigate }) {
  const { profile, updateProfile } = useProfile();
  const showSnackbar = useSnackbar();
  const [section, setSection] = useState<Section>("main");
  const [draft, setDraft] = useState<Draft>(() => pick(profile));
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(profile));

  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) => {
      setDraft((d) => ({ ...d, [key]: value }));
      if (key === "firstName" || key === "lastName") setErrors((e) => ({ ...e, [key]: "" }));
    };
  const setIn =
    <G extends Group>(group: G, key: keyof Draft[G]) =>
    (value: string) =>
      setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));

  const setBirth = (key: "birthDay" | "birthMonth" | "birthYear") => (value: string) =>
    setDraft((d) => {
      const next = { ...d, [key]: value };
      const max = daysInMonth(next.birthMonth, next.birthYear);
      if (+next.birthDay > max) next.birthDay = String(max);
      return next;
    });

  const save = async () => {
    const nextErrors = {
      firstName: validateName(draft.firstName, "имя"),
      lastName: validateName(draft.lastName, "фамилию"),
    };
    if (nextErrors.firstName || nextErrors.lastName) {
      setErrors(nextErrors);
      setSection("main");
      return;
    }
    const clean = {
      ...draft,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
    };
    setSaving(true);
    const ok = await updateProfile(clean);
    setSaving(false);
    if (ok) {
      setDraft(clean);
      showSnackbar("Изменения сохранены");
    }
  };

  const days = range(1, daysInMonth(draft.birthMonth, draft.birthYear));
  const months = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

  return (
    <div className="columns">
      <div className="card edit">
        <div className="edit__title">
          {SECTIONS.find((s) => s.id === section)?.label}
        </div>

        <form
          className="edit__form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {section === "main" && (
            <>
              <Row label="Имя" error={errors.firstName}>
                <Input
                  value={draft.firstName}
                  onChange={set("firstName")}
                  invalid={errors.firstName}
                  maxLength={32}
                />
              </Row>
              <Row label="Фамилия" error={errors.lastName}>
                <Input
                  value={draft.lastName}
                  onChange={set("lastName")}
                  invalid={errors.lastName}
                  maxLength={32}
                />
              </Row>
              <Row label="Пол">
                <Select
                  value={draft.gender}
                  onChange={set("gender")}
                  options={[
                    { value: "male", label: "Мужской" },
                    { value: "female", label: "Женский" },
                  ]}
                />
              </Row>
              <Row label="Семейное положение">
                <Select
                  value={draft.relation}
                  onChange={set("relation")}
                  options={relationOptions(draft.gender)}
                />
              </Row>

              <div className="edit__separator" />

              <Row label="Дата рождения">
                <div className="field-group">
                  <Select
                    value={draft.birthDay}
                    onChange={setBirth("birthDay")}
                    options={days}
                    placeholder="День"
                  />
                  <Select
                    value={draft.birthMonth}
                    onChange={setBirth("birthMonth")}
                    options={months}
                    placeholder="Месяц"
                  />
                  <Select
                    value={draft.birthYear}
                    onChange={setBirth("birthYear")}
                    options={BIRTH_YEARS}
                    placeholder="Год"
                  />
                </div>
              </Row>
              <Row label="">
                <Select
                  value={draft.birthVisibility}
                  onChange={set("birthVisibility")}
                  options={[
                    { value: "show", label: "Показывать дату рождения" },
                    { value: "month", label: "Показывать только месяц и день" },
                    { value: "hide", label: "Не показывать дату рождения" },
                  ]}
                />
              </Row>

              <div className="edit__separator" />

              <Row label="Родной город">
                <Input
                  value={draft.hometown}
                  onChange={set("hometown")}
                  maxLength={64}
                />
              </Row>
              <Row label="Языки" hint="Перечислите через запятую">
                <Input
                  value={draft.languages}
                  onChange={set("languages")}
                  maxLength={128}
                />
              </Row>
            </>
          )}

          {section === "contacts" && (
            <>
              <Row label="Страна">
                <Select
                  value={draft.contacts.country}
                  onChange={setIn("contacts", "country")}
                  options={COUNTRIES}
                  placeholder="Не выбрана"
                />
              </Row>
              <Row label="Город">
                <Input
                  value={draft.contacts.city}
                  onChange={setIn("contacts", "city")}
                  maxLength={64}
                />
              </Row>

              <div className="edit__separator" />

              <Row label="Мобильный телефон">
                <Input
                  type="tel"
                  value={draft.contacts.phone}
                  onChange={(v) => setIn("contacts", "phone")(phoneOnly(v))}
                  placeholder="+7 900 000-00-00"
                  maxLength={20}
                />
              </Row>
              <Row label="Доп. телефон">
                <Input
                  type="tel"
                  value={draft.contacts.phone2}
                  onChange={(v) => setIn("contacts", "phone2")(phoneOnly(v))}
                  maxLength={20}
                />
              </Row>
              <Row label="Личный сайт">
                <Input
                  value={draft.contacts.site}
                  onChange={setIn("contacts", "site")}
                  placeholder="example.com"
                  maxLength={100}
                />
              </Row>
            </>
          )}

          {section === "interests" &&
            INTERESTS.map(([key, label]) => (
              <Row key={key} label={label}>
                <TextArea
                  value={draft.interests[key]}
                  onChange={setIn("interests", key)}
                  maxLength={1000}
                />
              </Row>
            ))}

          {section === "education" && (
            <>
              <Row label="Вуз">
                <Input
                  value={draft.education.university}
                  onChange={setIn("education", "university")}
                  maxLength={100}
                />
              </Row>
              <Row label="Факультет">
                <Input
                  value={draft.education.faculty}
                  onChange={setIn("education", "faculty")}
                  maxLength={100}
                />
              </Row>
              <Row label="Год выпуска">
                <Select
                  value={draft.education.graduation}
                  onChange={setIn("education", "graduation")}
                  options={STUDY_YEARS}
                  placeholder="Не выбран"
                />
              </Row>

              <div className="edit__separator" />

              <Row label="Школа">
                <Input
                  value={draft.education.school}
                  onChange={setIn("education", "school")}
                  maxLength={100}
                />
              </Row>
            </>
          )}

          {section === "career" && (
            <>
              <Row label="Место работы">
                <Input
                  value={draft.career.company}
                  onChange={setIn("career", "company")}
                  maxLength={100}
                />
              </Row>
              <Row label="Город">
                <Input
                  value={draft.career.city}
                  onChange={setIn("career", "city")}
                  maxLength={64}
                />
              </Row>
              <Row label="Должность">
                <Input
                  value={draft.career.position}
                  onChange={setIn("career", "position")}
                  maxLength={100}
                />
              </Row>
              <Row label="Годы работы">
                <div className="field-group">
                  <Select
                    value={draft.career.from}
                    onChange={setIn("career", "from")}
                    options={WORK_YEARS}
                    placeholder="Начало"
                  />
                  <Select
                    value={draft.career.to}
                    onChange={setIn("career", "to")}
                    options={WORK_YEARS}
                    placeholder="По наст. время"
                  />
                </div>
              </Row>
            </>
          )}

          <div className="edit__footer">
            <button className="btn" disabled={!dirty || saving}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
            {dirty && (
              <button
                type="button"
                className="btn btn--tertiary"
                onClick={() => setDraft(pick(profile))}
              >
                Отменить
              </button>
            )}
          </div>
        </form>
      </div>

      <aside className="columns__side">
        <SideMenu
          items={[
            ...SECTIONS.map((s) => ({
              label: s.label,
              active: section === s.id,
              onClick: () => setSection(s.id),
            })),
            "separator",
            {
              label: "Перейти к профилю",
              onClick: () => onNavigate("profile"),
            },
          ]}
        />
      </aside>
    </div>
  );
}
