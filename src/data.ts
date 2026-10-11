import type { ProfileInfo } from "./types";

const CSS_URL_ESCAPES: Record<string, string> = { "(": "%28", ")": "%29", "'": "%27" };
const cssUrl = (src: string) => src.replace(/["'()\\\s]/g, (ch) => CSS_URL_ESCAPES[ch] ?? encodeURIComponent(ch));
export const bg = (src: string, fallback: string) => `url("${cssUrl(src)}") center / cover no-repeat, ${fallback}`;

export const emptyProfileInfo: ProfileInfo = {
  gender: 'male',
  relation: '0',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  birthVisibility: 'show',
  hometown: '',
  languages: '',

  contacts: {
    country: '',
    city: '',
    phone: '',
    phone2: '',
    site: '',
  },

  interests: {
    activities: '',
    interests: '',
    music: '',
    movies: '',
    books: '',
    games: '',
    quotes: '',
    about: '',
  },

  education: {
    university: '',
    faculty: '',
    graduation: '',
    school: '',
  },

  career: {
    company: '',
    city: '',
    position: '',
    from: '',
    to: '',
  },
};

export const avatarColors = ['#5181b8', '#e64646', '#4bb34b', '#a06ee6', '#ffa000', '#00a6b6', '#e6457a', '#6e8fcc'];
