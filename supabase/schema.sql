-- Социальная сеть: профили, друзья, посты, фото, сообщения.
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Скрипт можно запускать повторно: существующие данные он не удаляет.

-- Старая схема онлайн-чата (анонимные профили с колонкой name) несовместима
-- с настоящими пользователями — убираем её, там только тестовые данные
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'name'
  ) then
    drop table if exists public.messages;
    drop table if exists public.profiles;
  end if;
end $$;

-- =====================================================================
-- Профили
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 32),
  last_name text not null check (char_length(last_name) between 1 and 32),
  color text not null default '#5181b8',
  status text not null default '' check (char_length(status) <= 140),
  avatar_url text,
  cover_url text,
  -- Остальное из «Редактировать профиль»: пол, дата рождения, контакты, интересы…
  info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Профили видны всем" on public.profiles;
create policy "Профили видны всем" on public.profiles
  for select to authenticated using (true);

drop policy if exists "Создать можно только свой профиль" on public.profiles;
create policy "Создать можно только свой профиль" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "Менять можно только свой профиль" on public.profiles;
create policy "Менять можно только свой профиль" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- =====================================================================
-- Друзья: заявка (pending) → принята (accepted). Одна запись на пару людей
-- =====================================================================
create table if not exists public.friendships (
  requester_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_idx on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

alter table public.friendships enable row level security;

drop policy if exists "Видны свои заявки и все дружбы" on public.friendships;
create policy "Видны свои заявки и все дружбы" on public.friendships
  for select to authenticated
  using (status = 'accepted' or (select auth.uid()) in (requester_id, addressee_id));

drop policy if exists "Заявку отправляет сам пользователь" on public.friendships;
create policy "Заявку отправляет сам пользователь" on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');

drop policy if exists "Принимает заявку получатель" on public.friendships;
create policy "Принимает заявку получатель" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

drop policy if exists "Отменить или удалить может любая сторона" on public.friendships;
create policy "Отменить или удалить может любая сторона" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- =====================================================================
-- Посты на стене, лайки, комментарии
-- =====================================================================
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade, -- чья стена
  text text not null default '' check (char_length(text) <= 10000),
  image_url text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  check (char_length(text) > 0 or image_url is not null)
);

create index if not exists posts_owner_idx on public.posts (owner_id, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

-- Правила доступа к постам — в разделе «Сообщества» в конце файла:
-- пост может лежать на стене человека или сообщества

revoke update on public.posts from authenticated;
grant update (pinned) on public.posts to authenticated;

create table if not exists public.post_likes (
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

drop policy if exists "Лайки видны всем" on public.post_likes;
create policy "Лайки видны всем" on public.post_likes
  for select to authenticated using (true);

drop policy if exists "Лайк ставит сам пользователь" on public.post_likes;
create policy "Лайк ставит сам пользователь" on public.post_likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Лайк снимает сам пользователь" on public.post_likes;
create policy "Лайк снимает сам пользователь" on public.post_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.post_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

drop policy if exists "Комментарии видны всем" on public.post_comments;
create policy "Комментарии видны всем" on public.post_comments
  for select to authenticated using (true);

drop policy if exists "Комментирует сам пользователь" on public.post_comments;
create policy "Комментирует сам пользователь" on public.post_comments
  for insert to authenticated with check (author_id = (select auth.uid()));

-- Удаление комментариев — в разделе «Сообщества» (там учитываются админы сообществ)

-- =====================================================================
-- Фотографии, их лайки и комментарии
-- =====================================================================
create table if not exists public.photos (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path text not null,  -- путь в Storage, нужен для удаления файла
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists photos_owner_idx on public.photos (owner_id, created_at desc);

alter table public.photos enable row level security;

-- Правила доступа к фото — в разделе «Сообщества» (у сообществ есть свои фотографии)

create table if not exists public.photo_likes (
  photo_id bigint not null references public.photos (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

alter table public.photo_likes enable row level security;

drop policy if exists "Лайки фото видны всем" on public.photo_likes;
create policy "Лайки фото видны всем" on public.photo_likes
  for select to authenticated using (true);

drop policy if exists "Лайк фото ставит сам пользователь" on public.photo_likes;
create policy "Лайк фото ставит сам пользователь" on public.photo_likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Лайк фото снимает сам пользователь" on public.photo_likes;
create policy "Лайк фото снимает сам пользователь" on public.photo_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.photo_comments (
  id bigint generated always as identity primary key,
  photo_id bigint not null references public.photos (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists photo_comments_photo_idx on public.photo_comments (photo_id, created_at);

alter table public.photo_comments enable row level security;

drop policy if exists "Комментарии к фото видны всем" on public.photo_comments;
create policy "Комментарии к фото видны всем" on public.photo_comments
  for select to authenticated using (true);

drop policy if exists "Комментирует фото сам пользователь" on public.photo_comments;
create policy "Комментирует фото сам пользователь" on public.photo_comments
  for insert to authenticated with check (author_id = (select auth.uid()));

drop policy if exists "Удаляет автор или владелец фото" on public.photo_comments;
create policy "Удаляет автор или владелец фото" on public.photo_comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.photos ph
      where ph.id = photo_id and ph.owner_id = (select auth.uid())
    )
  );

-- =====================================================================
-- Личные сообщения
-- =====================================================================
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_dialog_idx on public.messages (sender_id, recipient_id, created_at);
create index if not exists messages_unread_idx on public.messages (recipient_id, read_at);

alter table public.messages enable row level security;

drop policy if exists "Видны только свои переписки" on public.messages;
create policy "Видны только свои переписки" on public.messages
  for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

drop policy if exists "Писать можно только от своего имени" on public.messages;
create policy "Писать можно только от своего имени" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and recipient_id <> (select auth.uid()));

drop policy if exists "Получатель отмечает прочитанным" on public.messages;
create policy "Получатель отмечает прочитанным" on public.messages
  for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- =====================================================================
-- Хранилище картинок: аватары, обложки, фото, картинки к постам.
-- Каждый пишет только в свою папку <id пользователя>/…, читать может кто угодно
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Загрузка картинок в свою папку" on storage.objects;
create policy "Загрузка картинок в свою папку" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Удаление картинок из своей папки" on storage.objects;
create policy "Удаление картинок из своей папки" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- Realtime: сообщения и заявки в друзья приходят сразу
-- =====================================================================
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- Поиск человека по точному адресу почты. Сами адреса никому не видны:
-- функция возвращает профиль только при полном совпадении и только вошедшим
-- =====================================================================
create or replace function public.find_profile_by_email(p_email text)
returns setof public.profiles
language sql stable security definer set search_path = public, auth
as $$
  select p.*
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and lower(u.email) = lower(trim(p_email));
$$;

revoke execute on function public.find_profile_by_email(text) from public, anon;
grant execute on function public.find_profile_by_email(text) to authenticated;

-- =====================================================================
-- Вложения в сообщениях: фото, видео, музыка и голосовые.
-- Файлы лежат в закрытом хранилище chat по пути <отправитель>/<получатель>/…,
-- открыть их могут только участники переписки (по временной ссылке)
-- =====================================================================
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_name text; -- имя файла: название трека
-- Для голосовых: длительность в секундах и форма волны { "duration": 4.2, "waveform": [0..100, …] }
alter table public.messages add column if not exists attachment_meta jsonb;
-- «Поделиться»: в сообщении — ссылка на запись, фото или страницу человека
alter table public.messages add column if not exists shared_type text;
alter table public.messages add column if not exists shared_id text;
alter table public.messages alter column text set default '';

alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(text) <= 4000
  and (char_length(text) > 0 or attachment_path is not null or shared_id is not null)
  and (attachment_path is null) = (attachment_type is null)
  and (attachment_type is null or attachment_type in ('image', 'video', 'audio', 'voice'))
  and (attachment_name is null or char_length(attachment_name) <= 200)
  and (attachment_meta is null or pg_column_size(attachment_meta) <= 4096)
  and (shared_type is null) = (shared_id is null)
  -- все типы «Поделиться» здесь: при повторном запуске файла старые сообщения должны проходить проверку
  and (shared_type is null or shared_type in ('post', 'photo', 'profile', 'community', 'audio', 'playlist', 'video'))
  and (shared_id is null or char_length(shared_id) <= 64)
);

-- Вложение можно прикрепить только из своей папки для этого получателя
drop policy if exists "Писать можно только от своего имени" on public.messages;
create policy "Писать можно только от своего имени" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and (
      attachment_path is null
      or attachment_path like (select auth.uid())::text || '/' || recipient_id::text || '/%'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat', 'chat', false, 52428800,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Вложения: загрузка в свою папку" on storage.objects;
create policy "Вложения: загрузка в свою папку" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Вложения видят только участники переписки" on storage.objects;
create policy "Вложения видят только участники переписки" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat'
    and (select auth.uid())::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

drop policy if exists "Вложения: удаление своих" on storage.objects;
create policy "Вложения: удаление своих" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- Удаление сообщений, как в VK:
--   «у себя» — сообщение скрывается только у того, кто удалил;
--   «у всех» — удаляется совсем (только своё и только в течение суток).
-- Менять сообщения напрямую по-прежнему нельзя — только через эти функции
-- =====================================================================
alter table public.messages add column if not exists hidden_by_sender boolean not null default false;
alter table public.messages add column if not exists hidden_by_recipient boolean not null default false;

create or replace function public.delete_message_for_me(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found or auth.uid() is null or auth.uid() not in (m.sender_id, m.recipient_id) then
    raise exception 'Сообщение не найдено';
  end if;

  if auth.uid() = m.sender_id then
    update public.messages set hidden_by_sender = true where id = p_id;
  else
    update public.messages set hidden_by_recipient = true where id = p_id;
  end if;

  -- Если сообщение скрыли оба — хранить его незачем
  delete from public.messages where id = p_id and hidden_by_sender and hidden_by_recipient;
end;
$$;

-- Возвращает путь вложения, чтобы сайт удалил и сам файл из хранилища
create or replace function public.delete_message_for_all(p_id bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found or auth.uid() is null or m.sender_id <> auth.uid() then
    raise exception 'Удалить у всех можно только своё сообщение';
  end if;
  if m.created_at < now() - interval '24 hours' then
    raise exception 'Удалить у всех можно только в течение суток после отправки';
  end if;

  delete from public.messages where id = p_id;
  return m.attachment_path;
end;
$$;

revoke execute on function public.delete_message_for_me(bigint) from public, anon;
revoke execute on function public.delete_message_for_all(bigint) from public, anon;
grant execute on function public.delete_message_for_me(bigint) to authenticated;
grant execute on function public.delete_message_for_all(bigint) to authenticated;

-- =====================================================================
-- Сообщества, как в VK.
--   kind:   group — группа (участники), page — публичная страница (подписчики)
--   access: open — вступает кто угодно; closed — по заявке; private — только по приглашению.
--           Публичная страница всегда открытая
--   wall:   open — участники группы пишут на стене от себя; limited — пишут только админы,
--           участники могут «предложить новость»
-- Состав и роли меняются только через функции ниже — так правила VK не обойти
-- =====================================================================
create table if not exists public.communities (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 2 and 64),
  kind text not null default 'group' check (kind in ('group', 'page')),
  access text not null default 'open' check (access in ('open', 'closed', 'private')),
  wall text not null default 'limited' check (wall in ('open', 'limited')),
  category text not null default '' check (char_length(category) <= 64),
  status text not null default '' check (char_length(status) <= 140),
  description text not null default '' check (char_length(description) <= 4000),
  website text not null default '' check (char_length(website) <= 200),
  city text not null default '' check (char_length(city) <= 64),
  color text not null default '#5181b8',
  avatar_url text,
  cover_url text,
  messages_enabled boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (kind = 'group' or access = 'open'),
  check (kind = 'group' or wall = 'limited')
);

create index if not exists communities_name_idx on public.communities (lower(name));

create table if not exists public.community_members (
  community_id bigint not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'editor', 'member')),
  -- member — в сообществе; requested — заявка в закрытую группу; invited — приглашение
  status text not null default 'member' check (status in ('member', 'requested', 'invited')),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id),
  check (status = 'member' or role = 'member')
);

create index if not exists community_members_user_idx on public.community_members (user_id, status);

-- ---------- Проверки прав (security definer — чтобы правила не зацикливались) ----------
create or replace function public.community_role(c bigint, u uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.community_members where community_id = c and user_id = u and status = 'member';
$$;

-- Видеть записи, фото и участников: открытое сообщество — все, иначе только участники
create or replace function public.can_view_community(c bigint, u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.communities where id = c and access = 'open')
      or public.community_role(c, u) is not null;
$$;

-- Публиковать от имени сообщества и отвечать на сообщения: владелец, админы, редакторы
create or replace function public.can_publish_in_community(c bigint, u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.community_role(c, u) in ('owner', 'admin', 'editor'), false);
$$;

-- Управлять настройками и участниками: владелец и админы
create or replace function public.can_manage_community(c bigint, u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.community_role(c, u) in ('owner', 'admin'), false);
$$;

-- Создатель сразу становится владельцем
create or replace function public.community_add_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.community_members (community_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'member');
  return new;
end;
$$;

drop trigger if exists community_add_owner on public.communities;
create trigger community_add_owner after insert on public.communities
  for each row execute function public.community_add_owner();

-- ---------- Правила доступа ----------
alter table public.communities enable row level security;
alter table public.community_members enable row level security;

drop policy if exists "Сообщества видны всем, частные — только своим" on public.communities;
create policy "Сообщества видны всем, частные — только своим" on public.communities
  for select to authenticated
  using (
    access <> 'private'
    or created_by = (select auth.uid()) -- создатель видит своё сообщество сразу, ещё до записи «владелец»
    or exists (
      select 1 from public.community_members m
      where m.community_id = id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "Создаёт сообщество сам пользователь" on public.communities;
create policy "Создаёт сообщество сам пользователь" on public.communities
  for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "Настройки меняют владелец и админы" on public.communities;
create policy "Настройки меняют владелец и админы" on public.communities
  for update to authenticated
  using (public.can_manage_community(id, (select auth.uid())))
  with check (public.can_manage_community(id, (select auth.uid())));

drop policy if exists "Удаляет сообщество только владелец" on public.communities;
create policy "Удаляет сообщество только владелец" on public.communities
  for delete to authenticated
  using (public.community_role(id, (select auth.uid())) = 'owner');

revoke update on public.communities from authenticated;
grant update (name, access, wall, category, status, description, website, city, color, avatar_url, cover_url, messages_enabled)
  on public.communities to authenticated;

drop policy if exists "Участников видно, если видно сообщество" on public.community_members;
create policy "Участников видно, если видно сообщество" on public.community_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view_community(community_id, (select auth.uid())));

-- Менять состав напрямую нельзя — только функциями ниже
revoke insert, update, delete on public.community_members from authenticated;

-- ---------- Функции: вступить, выйти, пригласить, заявки, роли ----------

-- Вступить / подписаться. Возвращает новый статус: member или requested.
-- Приглашённый в любую группу (в том числе частную) этим же вызовом принимает приглашение
create or replace function public.join_community(c bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a text;
  cur public.community_members;
begin
  if me is null then raise exception 'Нужно войти'; end if;
  select access into a from public.communities where id = c;
  if a is null then raise exception 'Сообщество не найдено'; end if;

  select * into cur from public.community_members where community_id = c and user_id = me;
  if found then
    if cur.status = 'invited' then
      update public.community_members set status = 'member', created_at = now()
      where community_id = c and user_id = me;
      return 'member';
    end if;
    return cur.status;
  end if;

  if a = 'private' then
    raise exception 'Это частная группа — вступить можно только по приглашению';
  end if;
  insert into public.community_members (community_id, user_id, status)
  values (c, me, case when a = 'open' then 'member' else 'requested' end);
  return case when a = 'open' then 'member' else 'requested' end;
end;
$$;

-- Выйти / отписаться / отменить заявку / отклонить приглашение
create or replace function public.leave_community(c bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.community_role(c, auth.uid()) = 'owner' then
    raise exception 'Владелец не может выйти из своего сообщества — его можно только удалить';
  end if;
  delete from public.community_members where community_id = c and user_id = auth.uid();
end;
$$;

-- Пригласить друга: может любой участник
create or replace function public.invite_to_community(c bigint, u uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.community_role(c, auth.uid()) is null then
    raise exception 'Приглашать могут только участники сообщества';
  end if;
  if not public.are_friends(auth.uid(), u) then
    raise exception 'Пригласить можно только друга';
  end if;
  insert into public.community_members (community_id, user_id, status)
  values (c, u, 'invited')
  on conflict (community_id, user_id) do nothing;
end;
$$;

-- Принять или отклонить заявку в закрытую группу: владелец и админы
create or replace function public.answer_community_request(c bigint, u uuid, accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.can_manage_community(c, auth.uid()) then
    raise exception 'Заявки принимают только владелец и администраторы';
  end if;
  if accept then
    update public.community_members set status = 'member', created_at = now()
    where community_id = c and user_id = u and status = 'requested';
  else
    delete from public.community_members where community_id = c and user_id = u and status = 'requested';
  end if;
end;
$$;

-- Назначить роль. Владелец назначает админов и редакторов,
-- админ — только редакторов и только среди обычных участников и редакторов
create or replace function public.set_community_role(c bigint, u uuid, r text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  my_role text := public.community_role(c, auth.uid());
  their_role text := public.community_role(c, u);
begin
  if r not in ('admin', 'editor', 'member') then raise exception 'Неизвестная роль'; end if;
  if their_role is null then raise exception 'Человек не состоит в сообществе'; end if;
  if their_role = 'owner' then raise exception 'Роль владельца изменить нельзя'; end if;
  if my_role = 'owner' then
    null;
  elsif my_role = 'admin' and r <> 'admin' and their_role in ('editor', 'member') then
    null;
  else
    raise exception 'Недостаточно прав, чтобы назначить эту роль';
  end if;
  update public.community_members set role = r where community_id = c and user_id = u;
end;
$$;

-- Удалить участника (или отозвать приглашение). Админа может удалить только владелец
create or replace function public.remove_from_community(c bigint, u uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  my_role text := public.community_role(c, auth.uid());
  their_role text := (select role from public.community_members where community_id = c and user_id = u);
begin
  if my_role not in ('owner', 'admin') or my_role is null then
    raise exception 'Удалять участников могут только владелец и администраторы';
  end if;
  if their_role = 'owner' then raise exception 'Владельца удалить нельзя'; end if;
  if their_role = 'admin' and my_role <> 'owner' then
    raise exception 'Администратора может удалить только владелец';
  end if;
  delete from public.community_members where community_id = c and user_id = u;
end;
$$;

-- ---------- Посты: стена человека или сообщества ----------
alter table public.posts alter column owner_id drop not null;
alter table public.posts add column if not exists community_id bigint references public.communities (id) on delete cascade;
-- as_community — опубликовано от имени сообщества; suggested — «предложенная новость», ждёт админа
alter table public.posts add column if not exists as_community boolean not null default false;
alter table public.posts add column if not exists suggested boolean not null default false;

alter table public.posts drop constraint if exists posts_wall_check;
alter table public.posts add constraint posts_wall_check check (
  (owner_id is null) <> (community_id is null)
  and (community_id is not null or (not as_community and not suggested))
  and not (as_community and suggested)
);

create index if not exists posts_community_idx on public.posts (community_id, created_at desc);

drop policy if exists "Посты видны всем" on public.posts;
drop policy if exists "Посты видны, если видно сообщество" on public.posts;
create policy "Посты видны, если видно сообщество" on public.posts
  for select to authenticated
  using (
    community_id is null
    or (
      public.can_view_community(community_id, (select auth.uid()))
      and (
        not suggested
        or author_id = (select auth.uid())
        or public.can_publish_in_community(community_id, (select auth.uid()))
      )
    )
  );

drop policy if exists "Писать можно на своей стене и у друзей" on public.posts;
drop policy if exists "Кто где может публиковать" on public.posts;
create policy "Кто где может публиковать" on public.posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      -- стена человека: своя или друга
      (
        community_id is null
        and (owner_id = (select auth.uid()) or public.are_friends((select auth.uid()), owner_id))
      )
      -- от имени сообщества: владелец, админы, редакторы
      or (as_community and public.can_publish_in_community(community_id, (select auth.uid())))
      -- «предложить новость»: любой участник
      or (suggested and public.community_role(community_id, (select auth.uid())) is not null)
      -- от себя на открытой стене группы: участники
      or (
        community_id is not null and not as_community and not suggested
        and public.community_role(community_id, (select auth.uid())) is not null
        and exists (
          select 1 from public.communities c
          where c.id = community_id and c.kind = 'group' and c.wall = 'open'
        )
      )
    )
  );

drop policy if exists "Закрепляет владелец стены" on public.posts;
create policy "Закрепляет владелец стены" on public.posts
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or public.can_manage_community(community_id, (select auth.uid()))
  )
  with check (
    owner_id = (select auth.uid())
    or public.can_manage_community(community_id, (select auth.uid()))
  );

drop policy if exists "Удаляет автор или владелец стены" on public.posts;
create policy "Удаляет автор или владелец стены" on public.posts
  for delete to authenticated
  using (
    (select auth.uid()) in (author_id, owner_id)
    or public.can_publish_in_community(community_id, (select auth.uid()))
  );

-- Опубликовать предложенную новость от имени сообщества
create or replace function public.approve_suggested_post(p bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c bigint := (select community_id from public.posts where id = p and suggested);
begin
  if c is null then raise exception 'Предложенная запись не найдена'; end if;
  if not public.can_publish_in_community(c, auth.uid()) then
    raise exception 'Публиковать предложенные записи могут только руководители сообщества';
  end if;
  update public.posts set suggested = false, as_community = true, created_at = now() where id = p;
end;
$$;

drop policy if exists "Удаляет автор комментария или владелец стены" on public.post_comments;
create policy "Удаляет автор комментария или владелец стены" on public.post_comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.posts p
      where p.id = post_id
        and (p.owner_id = (select auth.uid()) or public.can_publish_in_community(p.community_id, (select auth.uid())))
    )
  );

-- ---------- Фотографии сообщества ----------
alter table public.photos add column if not exists community_id bigint references public.communities (id) on delete cascade;
create index if not exists photos_community_idx on public.photos (community_id, created_at desc);

drop policy if exists "Фото видны всем" on public.photos;
drop policy if exists "Фото видны, если видно сообщество" on public.photos;
create policy "Фото видны, если видно сообщество" on public.photos
  for select to authenticated
  using (community_id is null or public.can_view_community(community_id, (select auth.uid())));

drop policy if exists "Добавляет фото владелец" on public.photos;
create policy "Добавляет фото владелец" on public.photos
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (community_id is null or public.can_publish_in_community(community_id, (select auth.uid())))
  );

drop policy if exists "Удаляет фото владелец" on public.photos;
create policy "Удаляет фото владелец" on public.photos
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or public.can_manage_community(community_id, (select auth.uid()))
  );

-- ---------- Сообщения сообществу ----------
-- Переписка человека с сообществом. От имени сообщества отвечают владелец, админы и редакторы
create table if not exists public.community_messages (
  id bigint generated always as identity primary key,
  community_id bigint not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, -- собеседник сообщества
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  from_community boolean not null default false,
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz -- прочитано другой стороной
);

create index if not exists community_messages_dialog_idx on public.community_messages (community_id, user_id, created_at);
create index if not exists community_messages_user_idx on public.community_messages (user_id, created_at);

alter table public.community_messages enable row level security;

drop policy if exists "Переписку видят собеседник и руководители" on public.community_messages;
create policy "Переписку видят собеседник и руководители" on public.community_messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_publish_in_community(community_id, (select auth.uid()))
  );

drop policy if exists "Писать сообществу и отвечать от его имени" on public.community_messages;
create policy "Писать сообществу и отвечать от его имени" on public.community_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (
        not from_community and user_id = (select auth.uid())
        and exists (select 1 from public.communities c where c.id = community_id and c.messages_enabled)
      )
      or (from_community and public.can_publish_in_community(community_id, (select auth.uid())))
    )
  );

drop policy if exists "Прочитанным отмечает другая сторона" on public.community_messages;
create policy "Прочитанным отмечает другая сторона" on public.community_messages
  for update to authenticated
  using (
    (from_community and user_id = (select auth.uid()))
    or (not from_community and public.can_publish_in_community(community_id, (select auth.uid())))
  )
  with check (
    (from_community and user_id = (select auth.uid()))
    or (not from_community and public.can_publish_in_community(community_id, (select auth.uid())))
  );

revoke update on public.community_messages from authenticated;
grant update (read_at) on public.community_messages to authenticated;


-- Доступ к функциям — только вошедшим
do $$
declare
  f text;
begin
  foreach f in array array[
    'join_community(bigint)', 'leave_community(bigint)', 'invite_to_community(bigint, uuid)',
    'answer_community_request(bigint, uuid, boolean)', 'set_community_role(bigint, uuid, text)',
    'remove_from_community(bigint, uuid)', 'approve_suggested_post(bigint)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Realtime: новые сообщения сообществу и изменения состава приходят сразу
do $$
begin
  alter publication supabase_realtime add table public.community_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.community_members;
exception when duplicate_object then null;
end $$;

-- =========================================================
-- Фотоальбомы, как в VK.
-- Фото без альбома — системный альбом «Фотографии с моей страницы».
-- Приватность альбома: all — все, friends — только друзья, me — только я
-- =========================================================
create table if not exists public.photo_albums (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 64),
  description text not null default '' check (char_length(description) <= 1000),
  privacy text not null default 'all' check (privacy in ('all', 'friends', 'me')),
  cover_photo_id bigint, -- ссылка на фото — ниже, когда у photos появится album_id
  created_at timestamptz not null default now()
);

create index if not exists photo_albums_owner_idx on public.photo_albums (owner_id, created_at desc);

alter table public.photos add column if not exists album_id bigint references public.photo_albums (id) on delete cascade;
create index if not exists photos_album_idx on public.photos (album_id, created_at desc);

do $$
begin
  alter table public.photo_albums
    add constraint photo_albums_cover_photo_id_fkey foreign key (cover_photo_id) references public.photos (id) on delete set null;
exception when duplicate_object then null;
end $$;

-- Видно ли альбом этому человеку
create or replace function public.can_view_album(a bigint, uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.photo_albums al
    where al.id = a
      and (
        al.owner_id = uid
        or al.privacy = 'all'
        or (al.privacy = 'friends' and public.are_friends(al.owner_id, uid))
      )
  );
$$;

-- Альбом принадлежит этому человеку (фото кладут только в свои альбомы)
create or replace function public.owns_album(a bigint, uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.photo_albums where id = a and owner_id = uid);
$$;

alter table public.photo_albums enable row level security;

drop policy if exists "Альбом виден по приватности" on public.photo_albums;
create policy "Альбом виден по приватности" on public.photo_albums
  for select to authenticated
  -- проверка прямо по строке: функция не увидела бы только что созданный альбом (insert … returning)
  using (
    owner_id = (select auth.uid())
    or privacy = 'all'
    or (privacy = 'friends' and public.are_friends(owner_id, (select auth.uid())))
  );

drop policy if exists "Создаёт альбом владелец" on public.photo_albums;
create policy "Создаёт альбом владелец" on public.photo_albums
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Меняет альбом владелец" on public.photo_albums;
create policy "Меняет альбом владелец" on public.photo_albums
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    -- обложка — только фото из этого же альбома
    and (cover_photo_id is null or exists (select 1 from public.photos p where p.id = cover_photo_id and p.album_id = photo_albums.id))
  );

drop policy if exists "Удаляет альбом владелец" on public.photo_albums;
create policy "Удаляет альбом владелец" on public.photo_albums
  for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke update on public.photo_albums from authenticated;
grant update (title, description, privacy, cover_photo_id) on public.photo_albums to authenticated;

-- Фото: видимость учитывает и сообщество, и приватность альбома
drop policy if exists "Фото видны, если видно сообщество" on public.photos;
drop policy if exists "Фото видны, если видны сообщество и альбом" on public.photos;
create policy "Фото видны, если видны сообщество и альбом" on public.photos
  for select to authenticated
  using (
    (community_id is null or public.can_view_community(community_id, (select auth.uid())))
    and (album_id is null or public.can_view_album(album_id, (select auth.uid())))
  );

drop policy if exists "Добавляет фото владелец" on public.photos;
create policy "Добавляет фото владелец" on public.photos
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (community_id is null or public.can_publish_in_community(community_id, (select auth.uid())))
    and (album_id is null or (community_id is null and public.owns_album(album_id, (select auth.uid()))))
  );

-- Перенос фото между своими альбомами
drop policy if exists "Переносит фото владелец" on public.photos;
create policy "Переносит фото владелец" on public.photos
  for update to authenticated
  using (owner_id = (select auth.uid()) and community_id is null)
  with check (
    owner_id = (select auth.uid())
    and community_id is null
    and (album_id is null or public.owns_album(album_id, (select auth.uid())))
  );

revoke update on public.photos from authenticated;
grant update (album_id) on public.photos to authenticated;

revoke execute on function public.can_view_album(bigint, uuid) from public, anon;
revoke execute on function public.owns_album(bigint, uuid) from public, anon;
grant execute on function public.can_view_album(bigint, uuid) to authenticated;
grant execute on function public.owns_album(bigint, uuid) to authenticated;

-- =========================================================
-- Музыка, как в VK.
-- audios — загруженные треки (общие для всех), user_audios — «Моя музыка»
-- (свои и добавленные к себе чужие), playlists + playlist_tracks — плейлисты
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music', 'music', true, 52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac', 'audio/x-flac']
)
on conflict (id) do nothing;

drop policy if exists "Музыка: загрузка в свою папку" on storage.objects;
create policy "Музыка: загрузка в свою папку" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'music' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Музыка: удаление своих файлов" on storage.objects;
create policy "Музыка: удаление своих файлов" on storage.objects
  for delete to authenticated
  using (bucket_id = 'music' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.audios (
  id bigint generated always as identity primary key,
  uploader_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  artist text not null default '' check (char_length(artist) <= 100),
  title text not null check (char_length(btrim(title)) between 1 and 150),
  duration integer not null default 0 check (duration between 0 and 36000), -- секунды
  path text not null,  -- путь в бакете music
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists audios_created_idx on public.audios (created_at desc);
create index if not exists audios_uploader_idx on public.audios (uploader_id);

create table if not exists public.user_audios (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  audio_id bigint not null references public.audios (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, audio_id)
);

create index if not exists user_audios_user_idx on public.user_audios (user_id, added_at desc);

create table if not exists public.playlists (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playlists_owner_idx on public.playlists (owner_id, updated_at desc);

create table if not exists public.playlist_tracks (
  playlist_id bigint not null references public.playlists (id) on delete cascade,
  audio_id bigint not null references public.audios (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (playlist_id, audio_id)
);

create index if not exists playlist_tracks_playlist_idx on public.playlist_tracks (playlist_id, added_at);

alter table public.audios enable row level security;
alter table public.user_audios enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

-- Треки, «Моя музыка» и плейлисты видят все вошедшие (как открытая музыка в VK)
drop policy if exists "Треки видны всем" on public.audios;
create policy "Треки видны всем" on public.audios for select to authenticated using (true);

drop policy if exists "Загружает трек сам пользователь" on public.audios;
create policy "Загружает трек сам пользователь" on public.audios
  for insert to authenticated
  with check (
    uploader_id = (select auth.uid())
    and path like (select auth.uid())::text || '/%'
  );

drop policy if exists "Меняет трек загрузивший" on public.audios;
create policy "Меняет трек загрузивший" on public.audios
  for update to authenticated
  using (uploader_id = (select auth.uid()))
  with check (uploader_id = (select auth.uid()));

drop policy if exists "Удаляет трек загрузивший" on public.audios;
create policy "Удаляет трек загрузивший" on public.audios
  for delete to authenticated
  using (uploader_id = (select auth.uid()));

revoke update on public.audios from authenticated;
grant update (artist, title) on public.audios to authenticated;

drop policy if exists "Моя музыка видна всем" on public.user_audios;
create policy "Моя музыка видна всем" on public.user_audios for select to authenticated using (true);

drop policy if exists "Добавляет к себе сам" on public.user_audios;
create policy "Добавляет к себе сам" on public.user_audios
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Убирает у себя сам" on public.user_audios;
create policy "Убирает у себя сам" on public.user_audios
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.user_audios from authenticated;

drop policy if exists "Плейлисты видны всем" on public.playlists;
create policy "Плейлисты видны всем" on public.playlists for select to authenticated using (true);

drop policy if exists "Создаёт плейлист владелец" on public.playlists;
create policy "Создаёт плейлист владелец" on public.playlists
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Меняет плейлист владелец" on public.playlists;
create policy "Меняет плейлист владелец" on public.playlists
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Удаляет плейлист владелец" on public.playlists;
create policy "Удаляет плейлист владелец" on public.playlists
  for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke update on public.playlists from authenticated;
grant update (title, description, updated_at) on public.playlists to authenticated;

drop policy if exists "Треки плейлиста видны всем" on public.playlist_tracks;
create policy "Треки плейлиста видны всем" on public.playlist_tracks for select to authenticated using (true);

drop policy if exists "Добавляет в плейлист владелец" on public.playlist_tracks;
create policy "Добавляет в плейлист владелец" on public.playlist_tracks
  for insert to authenticated
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())));

drop policy if exists "Убирает из плейлиста владелец" on public.playlist_tracks;
create policy "Убирает из плейлиста владелец" on public.playlist_tracks
  for delete to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())));

revoke update on public.playlist_tracks from authenticated;


-- =========================================================
-- Видео, как в VK.
-- videos — загруженные ролики (файл и превью в бакете videos), user_videos — «Мои видео»
-- (свои и добавленные к себе), лайки, комментарии и просмотры (уникальные зрители)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos', 'videos', true, 52428800,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg', 'image/jpeg']
)
on conflict (id) do nothing;

drop policy if exists "Видео: загрузка в свою папку" on storage.objects;
create policy "Видео: загрузка в свою папку" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Видео: удаление своих файлов" on storage.objects;
create policy "Видео: удаление своих файлов" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.videos (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  description text not null default '' check (char_length(description) <= 5000),
  duration integer not null default 0 check (duration between 0 and 86400), -- секунды
  width integer,
  height integer,
  path text not null,
  url text not null,
  poster_path text,
  poster_url text,
  views integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists videos_created_idx on public.videos (created_at desc);
create index if not exists videos_owner_idx on public.videos (owner_id, created_at desc);

create table if not exists public.user_videos (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  video_id bigint not null references public.videos (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists user_videos_user_idx on public.user_videos (user_id, added_at desc);

create table if not exists public.video_likes (
  video_id bigint not null references public.videos (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table if not exists public.video_comments (
  id bigint generated always as identity primary key,
  video_id bigint not null references public.videos (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists video_comments_video_idx on public.video_comments (video_id, created_at);

create table if not exists public.video_views (
  video_id bigint not null references public.videos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (video_id, user_id)
);

alter table public.videos enable row level security;
alter table public.user_videos enable row level security;
alter table public.video_likes enable row level security;
alter table public.video_comments enable row level security;
alter table public.video_views enable row level security; -- напрямую недоступна, только через view_video

drop policy if exists "Видео видны всем" on public.videos;
create policy "Видео видны всем" on public.videos for select to authenticated using (true);

drop policy if exists "Загружает видео владелец" on public.videos;
create policy "Загружает видео владелец" on public.videos
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and path like (select auth.uid())::text || '/%'
    and (poster_path is null or poster_path like (select auth.uid())::text || '/%')
    and views = 0
  );

drop policy if exists "Меняет видео владелец" on public.videos;
create policy "Меняет видео владелец" on public.videos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Удаляет видео владелец" on public.videos;
create policy "Удаляет видео владелец" on public.videos
  for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke update on public.videos from authenticated;
grant update (title, description) on public.videos to authenticated;

drop policy if exists "Мои видео видны всем" on public.user_videos;
create policy "Мои видео видны всем" on public.user_videos for select to authenticated using (true);

drop policy if exists "Добавляет видео к себе сам" on public.user_videos;
create policy "Добавляет видео к себе сам" on public.user_videos
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Убирает видео у себя сам" on public.user_videos;
create policy "Убирает видео у себя сам" on public.user_videos
  for delete to authenticated using (user_id = (select auth.uid()));

revoke update on public.user_videos from authenticated;

drop policy if exists "Лайки видео видны всем" on public.video_likes;
create policy "Лайки видео видны всем" on public.video_likes for select to authenticated using (true);

drop policy if exists "Лайк видео ставит сам" on public.video_likes;
create policy "Лайк видео ставит сам" on public.video_likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Лайк видео снимает сам" on public.video_likes;
create policy "Лайк видео снимает сам" on public.video_likes
  for delete to authenticated using (user_id = (select auth.uid()));

revoke update on public.video_likes from authenticated;

drop policy if exists "Комментарии к видео видны всем" on public.video_comments;
create policy "Комментарии к видео видны всем" on public.video_comments for select to authenticated using (true);

drop policy if exists "Комментирует видео сам" on public.video_comments;
create policy "Комментирует видео сам" on public.video_comments
  for insert to authenticated with check (author_id = (select auth.uid()));

drop policy if exists "Удаляет автор или владелец видео" on public.video_comments;
create policy "Удаляет автор или владелец видео" on public.video_comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.videos v where v.id = video_id and v.owner_id = (select auth.uid()))
  );

revoke update on public.video_comments from authenticated;

-- Просмотр: каждый зритель считается один раз. Возвращает число просмотров
create or replace function public.view_video(v bigint)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  total integer;
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  insert into public.video_views (video_id, user_id) values (v, uid) on conflict do nothing;
  if found then
    update public.videos set views = views + 1 where id = v returning views into total;
  else
    select views into total from public.videos where id = v;
  end if;
  return coalesce(total, 0);
end;
$$;

revoke execute on function public.view_video(bigint) from public, anon;
grant execute on function public.view_video(bigint) to authenticated;

-- =========================================================
-- Уведомления, как в VK.
-- Создаются триггерами (сайт не может их подделать): лайки и комментарии к записям,
-- фото и видео, записи на стене, друзья, приглашения и заявки в сообщества.
-- Убрали лайк / отменили заявку — уведомление тоже пропадает
-- =========================================================
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,   -- кому
  actor_id uuid references public.profiles (id) on delete cascade,           -- кто сделал
  type text not null check (type in (
    'post_like', 'post_comment', 'wall_post', 'post_approved',
    'photo_like', 'photo_comment', 'video_like', 'video_comment',
    'friend_request', 'friend_accepted', 'community_invite', 'community_accepted'
  )),
  post_id bigint references public.posts (id) on delete cascade,
  photo_id bigint references public.photos (id) on delete cascade,
  video_id bigint references public.videos (id) on delete cascade,
  community_id bigint references public.communities (id) on delete cascade,
  comment_id bigint, -- id комментария (в своей таблице): чтобы убрать уведомление вместе с ним
  text text not null default '' check (char_length(text) <= 200), -- начало комментария или записи
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Свои уведомления видит получатель" on public.notifications;
create policy "Свои уведомления видит получатель" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Отмечает прочитанным получатель" on public.notifications;
create policy "Отмечает прочитанным получатель" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Скрывает уведомление получатель" on public.notifications;
create policy "Скрывает уведомление получатель" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Создавать уведомления напрямую нельзя — только триггерами ниже
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Уведомить получателя (себя о своих действиях не уведомляем)
create or replace function public.notify(
  p_user uuid, p_actor uuid, p_type text,
  p_post bigint default null, p_photo bigint default null, p_video bigint default null,
  p_community bigint default null, p_comment bigint default null, p_text text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  insert into public.notifications (user_id, actor_id, type, post_id, photo_id, video_id, community_id, comment_id, text)
  values (p_user, p_actor, p_type, p_post, p_photo, p_video, p_community, p_comment, left(coalesce(p_text, ''), 200));
end;
$$;

revoke execute on function public.notify(uuid, uuid, text, bigint, bigint, bigint, bigint, bigint, text) from public, anon, authenticated;

-- ---------- Записи ----------
create or replace function public.notify_post_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select author_id from public.posts where id = new.post_id), new.user_id, 'post_like', p_post => new.post_id);
    return new;
  end if;
  delete from public.notifications where type = 'post_like' and post_id = old.post_id and actor_id = old.user_id;
  return old;
end $$;

drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify after insert or delete on public.post_likes
  for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.posts;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where type = 'post_comment' and comment_id = old.id;
    return old;
  end if;
  select * into p from public.posts where id = new.post_id;
  perform public.notify(p.author_id, new.author_id, 'post_comment', p_post => p.id, p_comment => new.id, p_text => new.text);
  -- Хозяин стены тоже узнаёт о комментарии к чужой записи у себя
  if p.owner_id is not null and p.owner_id <> p.author_id then
    perform public.notify(p.owner_id, new.author_id, 'post_comment', p_post => p.id, p_comment => new.id, p_text => new.text);
  end if;
  return new;
end $$;

drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify after insert or delete on public.post_comments
  for each row execute function public.notify_post_comment();

create or replace function public.notify_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Запись на чужой стене
    if new.owner_id is not null and new.owner_id <> new.author_id then
      perform public.notify(new.owner_id, new.author_id, 'wall_post', p_post => new.id, p_text => new.text);
    end if;
  elsif old.suggested and not new.suggested then
    -- Предложенную новость опубликовали
    perform public.notify(new.author_id, auth.uid(), 'post_approved', p_post => new.id, p_community => new.community_id, p_text => new.text);
  end if;
  return new;
end $$;

drop trigger if exists posts_notify on public.posts;
create trigger posts_notify after insert or update of suggested on public.posts
  for each row execute function public.notify_post();

-- ---------- Фото ----------
create or replace function public.notify_photo_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select owner_id from public.photos where id = new.photo_id), new.user_id, 'photo_like', p_photo => new.photo_id);
    return new;
  end if;
  delete from public.notifications where type = 'photo_like' and photo_id = old.photo_id and actor_id = old.user_id;
  return old;
end $$;

drop trigger if exists photo_likes_notify on public.photo_likes;
create trigger photo_likes_notify after insert or delete on public.photo_likes
  for each row execute function public.notify_photo_like();

create or replace function public.notify_photo_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select owner_id from public.photos where id = new.photo_id), new.author_id, 'photo_comment',
      p_photo => new.photo_id, p_comment => new.id, p_text => new.text);
    return new;
  end if;
  delete from public.notifications where type = 'photo_comment' and comment_id = old.id;
  return old;
end $$;

drop trigger if exists photo_comments_notify on public.photo_comments;
create trigger photo_comments_notify after insert or delete on public.photo_comments
  for each row execute function public.notify_photo_comment();

-- ---------- Видео ----------
create or replace function public.notify_video_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select owner_id from public.videos where id = new.video_id), new.user_id, 'video_like', p_video => new.video_id);
    return new;
  end if;
  delete from public.notifications where type = 'video_like' and video_id = old.video_id and actor_id = old.user_id;
  return old;
end $$;

drop trigger if exists video_likes_notify on public.video_likes;
create trigger video_likes_notify after insert or delete on public.video_likes
  for each row execute function public.notify_video_like();

create or replace function public.notify_video_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select owner_id from public.videos where id = new.video_id), new.author_id, 'video_comment',
      p_video => new.video_id, p_comment => new.id, p_text => new.text);
    return new;
  end if;
  delete from public.notifications where type = 'video_comment' and comment_id = old.id;
  return old;
end $$;

drop trigger if exists video_comments_notify on public.video_comments;
create trigger video_comments_notify after insert or delete on public.video_comments
  for each row execute function public.notify_video_comment();

-- ---------- Друзья ----------
create or replace function public.notify_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.addressee_id, new.requester_id, 'friend_request');
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then
      delete from public.notifications
        where type = 'friend_request' and user_id = new.addressee_id and actor_id = new.requester_id;
      perform public.notify(new.requester_id, new.addressee_id, 'friend_accepted');
    end if;
    return new;
  end if;
  -- Заявку отменили или отклонили — уведомление о ней больше не нужно
  delete from public.notifications
    where type = 'friend_request' and user_id = old.addressee_id and actor_id = old.requester_id;
  return old;
end $$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify after insert or update or delete on public.friendships
  for each row execute function public.notify_friendship();

-- ---------- Сообщества ----------
create or replace function public.notify_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'invited' then
      perform public.notify(new.user_id, auth.uid(), 'community_invite', p_community => new.community_id);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status = 'requested' and new.status = 'member' then
      perform public.notify(new.user_id, auth.uid(), 'community_accepted', p_community => new.community_id);
    end if;
    if old.status = 'invited' and new.status <> 'invited' then
      delete from public.notifications
        where type = 'community_invite' and user_id = new.user_id and community_id = new.community_id;
    end if;
    return new;
  end if;
  delete from public.notifications
    where type = 'community_invite' and user_id = old.user_id and community_id = old.community_id;
  return old;
end $$;

drop trigger if exists community_members_notify on public.community_members;
create trigger community_members_notify after insert or update or delete on public.community_members
  for each row execute function public.notify_membership();

-- Realtime: новое уведомление приходит сразу
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- =========================================================
-- Защита: закрытые служебные функции, проверка адресов и цветов,
-- ограничения размеров и защита от спама (лимиты частоты)
-- =========================================================

-- ---------- Служебные функции — только вошедшим, триггерные — никому ----------
-- Без этого через API без входа можно было узнать, кто с кем дружит и какие роли в сообществах
do $$
declare
  f text;
begin
  foreach f in array array[
    'are_friends(uuid, uuid)', 'community_role(bigint, uuid)', 'can_view_community(bigint, uuid)',
    'can_publish_in_community(bigint, uuid)', 'can_manage_community(bigint, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Триггерные функции вызывает сама база; права на вызов при срабатывании триггера не нужны
  foreach f in array array[
    'community_add_owner()', 'notify_post_like()', 'notify_post_comment()', 'notify_post()',
    'notify_photo_like()', 'notify_photo_comment()', 'notify_video_like()', 'notify_video_comment()',
    'notify_friendship()', 'notify_membership()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------- Адреса картинок и файлов: только http(s), без кавычек, скобок и пробелов ----------
-- Иначе можно подставить в аватар чужой адрес или строку, ломающую стили у всех, кто его видит
create or replace function public.is_safe_url(u text)
returns boolean
language sql immutable
as $$
  select char_length(u) <= 1000 and u ~ '^https?://[^\s"''<>()\\]+$';
$$;

-- Цвет аватара — только #rrggbb (попадает в стиль страницы)
create or replace function public.is_hex_color(c text)
returns boolean
language sql immutable
as $$
  select c ~ '^#[0-9a-fA-F]{6}$';
$$;

-- Старые данные приводим в порядок, чтобы новые проверки не мешали людям сохранять профиль
update public.profiles set color = '#5181b8' where not public.is_hex_color(color);
update public.profiles set avatar_url = null where avatar_url is not null and not public.is_safe_url(avatar_url);
update public.profiles set cover_url = null where cover_url is not null and not public.is_safe_url(cover_url);
update public.communities set color = '#5181b8' where not public.is_hex_color(color);
update public.communities set avatar_url = null where avatar_url is not null and not public.is_safe_url(avatar_url);
update public.communities set cover_url = null where cover_url is not null and not public.is_safe_url(cover_url);
update public.posts set image_url = null where image_url is not null and not public.is_safe_url(image_url);

-- Ограничения добавляем NOT VALID: новые и изменённые строки проверяются, старые не мешают запуску
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('profiles', 'profiles_avatar_url_safe', 'avatar_url is null or public.is_safe_url(avatar_url)'),
      ('profiles', 'profiles_cover_url_safe', 'cover_url is null or public.is_safe_url(cover_url)'),
      ('profiles', 'profiles_color_hex', 'public.is_hex_color(color)'),
      ('profiles', 'profiles_info_size', 'pg_column_size(info) <= 16384'),
      ('communities', 'communities_avatar_url_safe', 'avatar_url is null or public.is_safe_url(avatar_url)'),
      ('communities', 'communities_cover_url_safe', 'cover_url is null or public.is_safe_url(cover_url)'),
      ('communities', 'communities_color_hex', 'public.is_hex_color(color)'),
      ('communities', 'communities_website_plain', $c$website !~ '[\s"''<>]'$c$),
      ('posts', 'posts_image_url_safe', 'image_url is null or public.is_safe_url(image_url)'),
      ('photos', 'photos_url_safe', 'public.is_safe_url(url)'),
      ('audios', 'audios_url_safe', 'public.is_safe_url(url)'),
      ('videos', 'videos_url_safe', 'public.is_safe_url(url)'),
      ('videos', 'videos_poster_url_safe', 'poster_url is null or public.is_safe_url(poster_url)')
    ) as t(tbl, name, expr)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.name, r.expr);
  end loop;
end $$;

-- ---------- Защита от спама: не больше N действий за отрезок времени ----------
-- Аргументы триггера: колонка автора, предел, окно ('1 minute', '1 hour', …)
create or replace function public.rate_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  author_col text := tg_argv[0];
  max_count int := tg_argv[1]::int;
  win interval := tg_argv[2]::interval;
  uid uuid := auth.uid();
  recent int;
begin
  if uid is null then return new; end if; -- служебные запросы (без пользователя) не ограничиваем
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - $2', tg_table_schema, tg_table_name, author_col)
    into recent using uid, win;
  if recent >= max_count then
    raise exception 'Слишком часто. Подождите немного и попробуйте снова' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.rate_limit() from public, anon, authenticated;

-- Индексы для быстрого подсчёта «моих действий за последнее время»
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists post_comments_author_idx on public.post_comments (author_id, created_at desc);
create index if not exists photo_comments_author_idx on public.photo_comments (author_id, created_at desc);
create index if not exists video_comments_author_idx on public.video_comments (author_id, created_at desc);
create index if not exists friendships_requester_idx on public.friendships (requester_id, created_at desc);
create index if not exists community_messages_author_idx on public.community_messages (author_id, created_at desc);
create index if not exists communities_creator_idx on public.communities (created_by, created_at desc);
create index if not exists messages_sender_time_idx on public.messages (sender_id, created_at desc);
create index if not exists audios_uploader_time_idx on public.audios (uploader_id, created_at desc);

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('messages', 'sender_id', 40, '1 minute'),
      ('community_messages', 'author_id', 20, '1 minute'),
      ('posts', 'author_id', 15, '1 minute'),
      ('post_comments', 'author_id', 30, '1 minute'),
      ('photo_comments', 'author_id', 30, '1 minute'),
      ('video_comments', 'author_id', 30, '1 minute'),
      ('friendships', 'requester_id', 50, '1 hour'),
      ('communities', 'created_by', 10, '1 day'),
      ('photos', 'owner_id', 100, '1 hour'),
      ('audios', 'uploader_id', 60, '1 hour'),
      ('videos', 'owner_id', 30, '1 hour')
    ) as t(tbl, col, lim, win)
  loop
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_rate_limit', r.tbl);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.rate_limit(%L, %L, %L)',
      r.tbl || '_rate_limit', r.tbl, r.col, r.lim::text, r.win
    );
  end loop;
end $$;

-- =========================================================
-- Настройки чатов у каждого человека: закреплён, в архиве, отмечен непрочитанным.
-- peer — собеседник: id человека или "club:<id>" для переписки с сообществом
-- =========================================================
create table if not exists public.chat_settings (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  peer text not null check (char_length(peer) between 1 and 64),
  pinned_at timestamptz,     -- закреплён (порядок закреплённых — по времени)
  archived_at timestamptz,   -- в архиве; новое сообщение после этой даты возвращает чат в список
  marked_unread boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, peer)
);

alter table public.chat_settings enable row level security;

drop policy if exists "Свои настройки чатов" on public.chat_settings;
create policy "Свои настройки чатов" on public.chat_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Закреплённых чатов — не больше 5, как в VK
create or replace function public.chat_pins_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.pinned_at is not null and (tg_op = 'INSERT' or old.pinned_at is null) and (
    select count(*) from public.chat_settings
    where user_id = new.user_id and pinned_at is not null and peer <> new.peer
  ) >= 5 then
    raise exception 'Можно закрепить не больше 5 чатов' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.chat_pins_limit() from public, anon, authenticated;

drop trigger if exists chat_settings_pins_limit on public.chat_settings;
create trigger chat_settings_pins_limit before insert or update on public.chat_settings
  for each row execute function public.chat_pins_limit();

-- Синхронизация между устройствами
do $$
begin
  alter publication supabase_realtime add table public.chat_settings;
exception when duplicate_object then null;
end $$;

-- =========================================================
-- Чёрный список, как в VK.
-- Заблокированный не может: писать сообщения, отправлять заявку в друзья,
-- писать на стене, комментировать и лайкать записи, фото и видео того, кто его заблокировал,
-- и не видит его записи и фото. Сообщения между ними запрещены в обе стороны.
-- Запреты — отдельными RESTRICTIVE-правилами: они действуют поверх всех остальных
-- =========================================================
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- Свой чёрный список видит только его владелец; менять — только через функции ниже
drop policy if exists "Свой чёрный список" on public.blocks;
create policy "Свой чёрный список" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

revoke insert, update, delete on public.blocks from authenticated;

-- a заблокировал b?
create or replace function public.has_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.blocks where blocker_id = a and blocked_id = b);
$$;

-- Между a и b есть блокировка в любую сторону
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Для интерфейса: я заблокировал человека / он заблокировал меня
create or replace function public.block_state(u uuid)
returns table (i_blocked boolean, blocked_me boolean)
language sql stable security definer set search_path = public
as $$
  select public.has_blocked(auth.uid(), u), public.has_blocked(u, auth.uid());
$$;

-- Заблокировать: заодно удаляем дружбу и заявки в обе стороны
create or replace function public.block_user(u uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Нужно войти'; end if;
  if u = me then raise exception 'Нельзя заблокировать самого себя'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, u) on conflict do nothing;
  delete from public.friendships
    where (requester_id = me and addressee_id = u) or (requester_id = u and addressee_id = me);
end;
$$;

create or replace function public.unblock_user(u uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = u;
end;
$$;

-- Владелец записи / фото / видео заблокировал u? Функция видит строку, даже если u её не видит:
-- иначе запрет не сработал бы (запись скрыта от заблокированного → «ничего не найдено» → можно)
create or replace function public.content_blocked(kind text, obj bigint, u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case kind
    when 'post' then exists (
      select 1 from public.posts p
      where p.id = obj and (public.has_blocked(p.author_id, u) or (p.owner_id is not null and public.has_blocked(p.owner_id, u)))
    )
    when 'photo' then exists (select 1 from public.photos ph where ph.id = obj and public.has_blocked(ph.owner_id, u))
    when 'video' then exists (select 1 from public.videos v where v.id = obj and public.has_blocked(v.owner_id, u))
    else false
  end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['has_blocked(uuid, uuid)', 'is_blocked_between(uuid, uuid)', 'block_state(uuid)', 'block_user(uuid)', 'unblock_user(uuid)', 'content_blocked(text, bigint, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Запреты ----------
-- Сообщения: ни в одну сторону
drop policy if exists "Блокировка: сообщения" on public.messages;
create policy "Блокировка: сообщения" on public.messages
  as restrictive for insert to authenticated
  with check (not public.is_blocked_between(sender_id, recipient_id));

-- Заявки в друзья: ни в одну сторону
drop policy if exists "Блокировка: заявки в друзья" on public.friendships;
create policy "Блокировка: заявки в друзья" on public.friendships
  as restrictive for insert to authenticated
  with check (not public.is_blocked_between(requester_id, addressee_id));

-- Записи: заблокированный не пишет на стене и не видит записи на стене того, кто его заблокировал
drop policy if exists "Блокировка: запись на стене" on public.posts;
create policy "Блокировка: запись на стене" on public.posts
  as restrictive for insert to authenticated
  with check (owner_id is null or not public.has_blocked(owner_id, author_id));

drop policy if exists "Блокировка: чужая стена скрыта" on public.posts;
create policy "Блокировка: чужая стена скрыта" on public.posts
  as restrictive for select to authenticated
  using (owner_id is null or not public.has_blocked(owner_id, (select auth.uid())));

-- Фото: заблокированный не видит фото того, кто его заблокировал
drop policy if exists "Блокировка: фото скрыты" on public.photos;
create policy "Блокировка: фото скрыты" on public.photos
  as restrictive for select to authenticated
  using (community_id is not null or not public.has_blocked(owner_id, (select auth.uid())));

-- Комментарии и лайки к записям, фото и видео того, кто заблокировал
drop policy if exists "Блокировка: комментарии к записям" on public.post_comments;
create policy "Блокировка: комментарии к записям" on public.post_comments
  as restrictive for insert to authenticated
  with check (not public.content_blocked('post', post_id, author_id));

drop policy if exists "Блокировка: лайки записей" on public.post_likes;
create policy "Блокировка: лайки записей" on public.post_likes
  as restrictive for insert to authenticated
  with check (not public.content_blocked('post', post_id, user_id));

drop policy if exists "Блокировка: комментарии к фото" on public.photo_comments;
create policy "Блокировка: комментарии к фото" on public.photo_comments
  as restrictive for insert to authenticated
  with check (not public.content_blocked('photo', photo_id, author_id));

drop policy if exists "Блокировка: лайки фото" on public.photo_likes;
create policy "Блокировка: лайки фото" on public.photo_likes
  as restrictive for insert to authenticated
  with check (not public.content_blocked('photo', photo_id, user_id));

drop policy if exists "Блокировка: комментарии к видео" on public.video_comments;
create policy "Блокировка: комментарии к видео" on public.video_comments
  as restrictive for insert to authenticated
  with check (not public.content_blocked('video', video_id, author_id));

drop policy if exists "Блокировка: лайки видео" on public.video_likes;
create policy "Блокировка: лайки видео" on public.video_likes
  as restrictive for insert to authenticated
  with check (not public.content_blocked('video', video_id, user_id));

-- Кто заблокировал меня (для мессенджера: вместо поля ввода — «пользователь ограничил круг лиц…»)
create or replace function public.blocked_me_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select blocker_id from public.blocks where blocked_id = auth.uid();
$$;

revoke execute on function public.blocked_me_ids() from public, anon;
grant execute on function public.blocked_me_ids() to authenticated;

-- =========================================================
-- Закладки, как в VK: записи, фото, видео, люди и сообщества.
-- Видны и меняются только владельцем. Удалили запись, фото, видео,
-- страницу или сообщество — закладка исчезает сама (on delete cascade)
-- =========================================================
create table if not exists public.bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id bigint references public.posts (id) on delete cascade,
  photo_id bigint references public.photos (id) on delete cascade,
  video_id bigint references public.videos (id) on delete cascade,
  person_id uuid references public.profiles (id) on delete cascade,
  community_id bigint references public.communities (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- ровно одна цель у закладки
  check (num_nonnulls(post_id, photo_id, video_id, person_id, community_id) = 1),
  check (person_id is null or person_id <> user_id)
);

create unique index if not exists bookmarks_post_uniq on public.bookmarks (user_id, post_id) where post_id is not null;
create unique index if not exists bookmarks_photo_uniq on public.bookmarks (user_id, photo_id) where photo_id is not null;
create unique index if not exists bookmarks_video_uniq on public.bookmarks (user_id, video_id) where video_id is not null;
create unique index if not exists bookmarks_person_uniq on public.bookmarks (user_id, person_id) where person_id is not null;
create unique index if not exists bookmarks_community_uniq on public.bookmarks (user_id, community_id) where community_id is not null;
create index if not exists bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

alter table public.bookmarks enable row level security;

drop policy if exists "Свои закладки" on public.bookmarks;
create policy "Свои закладки" on public.bookmarks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.bookmarks from authenticated;

drop trigger if exists bookmarks_rate_limit on public.bookmarks;
create trigger bookmarks_rate_limit before insert on public.bookmarks
  for each row execute function public.rate_limit('user_id', '200', '1 hour');
