export const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export const formatCount = (n: number): string =>
  n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n);

// plural(5, ['комментарий', 'комментария', 'комментариев']) → «комментариев»
export const plural = (n: number, [one, few, many]: readonly [string, string, string]): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// Читает картинку из файла и ужимает её через canvas,
// чтобы dataURL поместился в localStorage.
// square: true — центрированная квадратная обрезка (для аватара)
// data:-ссылка → файл. Без fetch(): политика безопасности сайта (CSP) запрещает запросы к data:,
// и на опубликованном сайте загрузка фото из-за этого падала с «Нет связи с сервером»
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [head, body = ''] = dataUrl.split(',');
  const type = head.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  if (!head.includes(';base64')) return new Blob([decodeURIComponent(body)], { type });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i;

export const readImage = (
  file: File | null | undefined,
  { max = 800, square = false, quality = 0.85 }: { max?: number; square?: boolean; quality?: number } = {},
) =>
  new Promise<string>((resolve, reject) => {
    // У некоторых файлов (особенно с телефона) тип пустой — тогда смотрим на расширение
    if (!file || !(file.type.startsWith('image/') || (!file.type && IMAGE_EXT.test(file.name)))) {
      reject(new Error('Выберите изображение в формате JPG, PNG или GIF'));
      return;
    }
    const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (square) {
        const side = Math.min(sw, sh);
        sx = (sw - side) / 2;
        sy = (sh - side) / 2;
        sw = sh = side;
      }
      const scale = Math.min(1, max / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          heic
            ? 'Этот браузер не открывает фото в формате HEIC. Сохраните фото как JPG или загрузите его с телефона'
            : 'Не удалось прочитать изображение',
        ),
      );
    };
    img.src = url;
  });

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Дата как в VK: «сегодня в 14:32», «вчера в 9:05», «6 фев в 5:01», «6 фев 2024 в 5:01»
type DateInput = string | number | Date;

export const formatDate = (value: DateInput | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  const dayDiff = Math.round(
    (new Date(now).setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (dayDiff === 0) return `сегодня в ${time}`;
  if (dayDiff === 1) return `вчера в ${time}`;
  const year = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : '';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}${year} в ${time}`;
};

const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const daysAgo = (date: DateInput) =>
  Math.round((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);

// Время сообщения: «14:05»
export const formatTime = (value: DateInput) =>
  new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// Разделитель в чате: «Сегодня», «Вчера», «3 октября», «3 октября 2025»
export const formatDay = (value: DateInput): string => {
  const date = new Date(value);
  const diff = daysAgo(date);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const year = date.getFullYear() !== new Date().getFullYear() ? ` ${date.getFullYear()}` : '';
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}${year}`;
};

// Время в списке чатов: сегодня — «14:05», вчера — «вчера», раньше — «3 окт»
export const formatDialogTime = (value: DateInput | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  const diff = daysAgo(date);
  if (diff === 0) return formatTime(date);
  if (diff === 1) return 'вчера';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
};

// Текст пойманной ошибки (в catch у неё тип unknown)
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// «был недавно» / «была недавно» — как в VK, когда человек не в сети
export const lastSeen = (gender?: "male" | "female") =>
  gender === "female" ? "была недавно" : gender === "male" ? "был недавно" : "был(а) недавно";
