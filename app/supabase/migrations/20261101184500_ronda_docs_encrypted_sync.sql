-- Ronda CTI: sincronização cifrada (aplicada no projeto Supabase "ronda-cti", sa-east-1).

-- Padrão mais seguro: nada criado depois em public fica exposto sem grant explícito.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Documentos do Ronda CTI (um por leito, mais os ajustes), cifrados no aparelho com AES-GCM.
-- O servidor guarda só texto cifrado; a chave nunca sai do aparelho.
create table public.ronda_docs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  doc_key text not null check (doc_key ~ '^[a-z0-9:_-]{1,64}$'),
  ciphertext text check (ciphertext is null or char_length(ciphertext) <= 1000000),
  client_updated_at bigint not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_key)
);
comment on table public.ronda_docs is 'Ronda CTI: dados cifrados no aparelho (AES-GCM). O servidor nunca recebe a chave.';

create index ronda_docs_user_updated_idx on public.ronda_docs (user_id, updated_at);

alter table public.ronda_docs enable row level security;

revoke all on table public.ronda_docs from anon, authenticated, public;
grant select, insert, update on table public.ronda_docs to authenticated;
grant select, insert, update, delete on table public.ronda_docs to service_role;

create policy "ronda_docs: ler os proprios" on public.ronda_docs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "ronda_docs: criar os proprios" on public.ronda_docs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "ronda_docs: alterar os proprios" on public.ronda_docs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A gravação mais nova (relógio do aparelho) vence; o servidor carimba updated_at.
create function public.ronda_docs_before_write() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- relógio adiantado não pode travar os outros aparelhos
  new.client_updated_at := least(new.client_updated_at, (extract(epoch from now()) * 1000)::bigint + 300000);
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null; -- gravação atrasada de outro aparelho: mantém a mais nova
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.ronda_docs_before_write() from public, anon, authenticated;

create trigger ronda_docs_before_write
  before insert or update on public.ronda_docs
  for each row execute function public.ronda_docs_before_write();

-- Mudanças chegam aos outros aparelhos em segundos.
alter publication supabase_realtime add table public.ronda_docs;
