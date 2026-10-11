import type { Education, Gender, Interests } from "./types";

export const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const RELATIONS: Record<Gender, string[]> = {
  male: ['Не выбрано', 'Не женат', 'Есть подруга', 'Помолвлен', 'Женат', 'В гражданском браке', 'Влюблён', 'Всё сложно', 'В активном поиске'],
  female: ['Не выбрано', 'Не замужем', 'Есть друг', 'Помолвлена', 'Замужем', 'В гражданском браке', 'Влюблена', 'Всё сложно', 'В активном поиске'],
};

export const relationOptions = (gender: Gender) =>
  (RELATIONS[gender] ?? RELATIONS.male).map((label, value) => ({ value: String(value), label }));

export const relationLabel = (gender: Gender, value: string) =>
  value && value !== '0' ? (RELATIONS[gender] ?? RELATIONS.male)[+value] : '';

export const INTERESTS: [keyof Interests, string][] = [
  ['activities', 'Деятельность'],
  ['interests', 'Интересы'],
  ['music', 'Любимая музыка'],
  ['movies', 'Любимые фильмы'],
  ['books', 'Любимые книги'],
  ['games', 'Любимые игры'],
  ['quotes', 'Любимые цитаты'],
  ['about', 'О себе'],
];

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

export const daysInMonth = (month: string, year: string) =>
  month ? new Date(+year || 2000, +month, 0).getDate() : 31;

export const formatBirthday = (p: {
  birthVisibility: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
}) => {
  if (p.birthVisibility === 'hide' || !p.birthDay || !p.birthMonth) return '';
  const base = `${p.birthDay} ${MONTHS[+p.birthMonth - 1]}`;
  return p.birthVisibility === 'show' && p.birthYear ? `${base} ${p.birthYear} г.` : base;
};

export const formatEducation = (e: Education) =>
  e.university ? `${e.university}${e.graduation ? ` '${e.graduation.slice(-2)}` : ''}` : '';

export const validateName = (value: string, what: string) => {
  const v = value.trim();
  if (!v) return `Укажите ${what}`;
  if (v.length < 2) return `${what[0].toUpperCase() + what.slice(1)} слишком короткая`;
  if (!/^[A-Za-zА-Яа-яЁё\- ]+$/.test(v)) return 'Можно использовать только буквы';
  return '';
};
