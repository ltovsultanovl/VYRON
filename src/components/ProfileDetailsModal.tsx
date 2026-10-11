import Modal from "./Modal";
import {
  BriefcaseIcon,
  EducationIcon,
  GiftIcon,
  GlobeIcon,
  HeartIcon,
  HomeIcon,
  LinkIcon,
  MapPinIcon,
  PhoneIcon,
  type Icon,
} from "./Icons";
import type { ReactNode } from "react";
import { INTERESTS, formatBirthday, relationLabel } from "../profile";
import type { Profile } from "../types";

const join = (...parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(", ");

export default function ProfileDetailsModal({
  profile: p,
  onClose,
  onEdit,
}: {
  profile: Profile;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const { contacts: c, education: e, career: w } = p;

  const site = c.site.trim();
  const career = join(
    w.company,
    w.position,
    w.city,
    (w.from || w.to) && `${w.from || "…"}–${w.to || "н. в."}`,
  );

  const main = (
    [
      [GiftIcon, "День рождения", formatBirthday(p)],
      [MapPinIcon, "Город", c.city],
      [HomeIcon, "Родной город", p.hometown],
      [GlobeIcon, "Языки", p.languages],
      [HeartIcon, "Семейное положение", relationLabel(p.gender, p.relation)],
      [
        EducationIcon,
        "Образование",
        join(e.university, e.faculty, e.graduation && `${e.graduation} г.`),
      ],
      [EducationIcon, "Школа", e.school],
      [BriefcaseIcon, "Карьера", career],
      [PhoneIcon, "Телефон", join(c.phone, c.phone2)],
      [
        LinkIcon,
        "Сайт",
        site && (
          <a
            className="link"
            href={/^https?:\/\//.test(site) ? site : `https://${site}`}
            target="_blank"
            rel="noreferrer"
          >
            {site}
          </a>
        ),
      ],
    ] as [Icon, string, ReactNode][]
  ).filter(([, , value]) => value);

  const interests = INTERESTS.map(([key, label]) => [
    label,
    p.interests[key],
  ]).filter(([, value]) => value?.trim());

  return (
    <Modal
      title="Подробная информация"
      onClose={onClose}
      width={520}
      footer={
        onEdit && (
          <button className="btn btn--secondary" onClick={onEdit}>
            Редактировать
          </button>
        )
      }
    >
      {main.length === 0 && interests.length === 0 && (
        <div className="empty">Информация не заполнена</div>
      )}

      {main.length > 0 && (
        <div className="details">
          {main.map(([Icon, label, value]) => (
            <div className="details__row" key={label}>
              <Icon size={20} />
              <span className="details__label">{label}</span>
              <span className="details__value">{value}</span>
            </div>
          ))}
        </div>
      )}

      {interests.length > 0 && (
        <>
          <div className="details__group">Личная информация</div>
          <div className="details">
            {interests.map(([label, value]) => (
              <div className="details__row details__row--text" key={label}>
                <span className="details__label">{label}</span>
                <span className="details__value">{value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
