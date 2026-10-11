import Avatar, { type AvatarProps } from "./Avatar";
import { useProfile } from "../context/ProfileContext";

export default function MeAvatar(
  props: Omit<AvatarProps, "name" | "color" | "src">,
) {
  const { profile, name } = useProfile();
  return (
    <Avatar name={name} color={profile.color} src={profile.avatar} {...props} />
  );
}
