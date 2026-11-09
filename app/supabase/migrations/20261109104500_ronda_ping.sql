-- Sinal de vida para o projeto gratuito não pausar por inatividade (pausa após 7 dias sem uso).
-- Não lê nem escreve dado nenhum: só responde 1.
create or replace function public.ronda_ping()
returns integer
language sql
stable
set search_path = ''
as $$ select 1 $$;

revoke all on function public.ronda_ping() from public;
grant execute on function public.ronda_ping() to anon, authenticated;
