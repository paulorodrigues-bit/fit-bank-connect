begin;

-- ============================================================
-- FIT BANK CONNECT - MULTI-CLIENTE V1
-- Isolamento por cliente para recebíveis, movimentos e pagamentos
-- ============================================================

create table if not exists bank_connect.clientes_integracao
(
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    identificador text not null unique,
    api_key_hash text null,
    ativo boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

-- Cliente que absorve os registros históricos do protótipo.
insert into bank_connect.clientes_integracao
(
    id,
    nome,
    identificador,
    ativo,
    metadata
)
values
(
    '11111111-1111-4111-8111-111111111111'::uuid,
    'FIT Desenvolvimento',
    'fit-dev',
    true,
    '{"origem":"migration_multicliente_v1","uso":"sandbox_dev"}'::jsonb
)
on conflict (identificador)
do update set
    ativo = true,
    atualizado_em = now();

-- Garante que as tabelas principais tenham o tenant UUID.
alter table bank_connect.transacoes
    add column if not exists cliente_integracao_id uuid;

alter table bank_connect.movimentos_bancarios
    add column if not exists cliente_integracao_id uuid;

alter table bank_connect.pagamentos_saida
    add column if not exists cliente_integracao_id uuid;

-- Migra todo o histórico atual do protótipo para o tenant de desenvolvimento.
update bank_connect.transacoes
set cliente_integracao_id = '11111111-1111-4111-8111-111111111111'::uuid
where cliente_integracao_id is null;

update bank_connect.movimentos_bancarios
set cliente_integracao_id = '11111111-1111-4111-8111-111111111111'::uuid
where cliente_integracao_id is null;

update bank_connect.pagamentos_saida
set cliente_integracao_id = '11111111-1111-4111-8111-111111111111'::uuid
where cliente_integracao_id is null;

-- A partir daqui nenhum registro financeiro principal pode existir sem cliente.
alter table bank_connect.transacoes
    alter column cliente_integracao_id set not null;

alter table bank_connect.movimentos_bancarios
    alter column cliente_integracao_id set not null;

alter table bank_connect.pagamentos_saida
    alter column cliente_integracao_id set not null;

-- FKs, caso ainda não existam.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'transacoes_cliente_integracao_id_fkey'
          and connamespace = 'bank_connect'::regnamespace
    ) then
        alter table bank_connect.transacoes
            add constraint transacoes_cliente_integracao_id_fkey
            foreign key (cliente_integracao_id)
            references bank_connect.clientes_integracao(id)
            on delete restrict;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'movimentos_bancarios_cliente_integracao_id_fkey'
          and connamespace = 'bank_connect'::regnamespace
    ) then
        alter table bank_connect.movimentos_bancarios
            add constraint movimentos_bancarios_cliente_integracao_id_fkey
            foreign key (cliente_integracao_id)
            references bank_connect.clientes_integracao(id)
            on delete restrict;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'pagamentos_saida_cliente_integracao_id_fkey'
          and connamespace = 'bank_connect'::regnamespace
    ) then
        alter table bank_connect.pagamentos_saida
            add constraint pagamentos_saida_cliente_integracao_id_fkey
            foreign key (cliente_integracao_id)
            references bank_connect.clientes_integracao(id)
            on delete restrict;
    end if;
end $$;

-- Idempotência de movimentos precisa ser por cliente.
alter table bank_connect.movimentos_bancarios
    drop constraint if exists movimentos_bancarios_banco_assinatura_key;

drop index if exists bank_connect.ux_movimentos_banco_externo;

create unique index if not exists ux_movimentos_cliente_banco_assinatura
    on bank_connect.movimentos_bancarios
    (cliente_integracao_id, banco, assinatura);

create unique index if not exists ux_movimentos_cliente_banco_externo_64
    on bank_connect.movimentos_bancarios
    (cliente_integracao_id, banco, movimento_externo_id)
    where movimento_externo_id is not null
      and length(movimento_externo_id) = 64;

-- Índices de isolamento e performance.
create index if not exists idx_transacoes_cliente_criado
    on bank_connect.transacoes
    (cliente_integracao_id, criado_em desc);

create index if not exists idx_movimentos_cliente_data
    on bank_connect.movimentos_bancarios
    (cliente_integracao_id, data_movimento desc);

create index if not exists idx_pagamentos_saida_cliente_criado
    on bank_connect.pagamentos_saida
    (cliente_integracao_id, criado_em desc);

-- Configuração bancária por cliente. Nenhum segredo é salvo em texto puro.
create table if not exists bank_connect.cliente_bancos
(
    id uuid primary key default gen_random_uuid(),
    cliente_integracao_id uuid not null
        references bank_connect.clientes_integracao(id)
        on delete restrict,
    banco text not null,
    produto text not null,
    ambiente text not null,
    auth_mode text not null,
    client_id text null,
    configuracao jsonb not null default '{}'::jsonb,
    credenciais_criptografadas text null,
    credenciais_iv text null,
    credenciais_tag text null,
    criptografia_versao integer not null default 1,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint cliente_bancos_produto_check
        check (produto in ('cash_management','sispag')),
    constraint cliente_bancos_ambiente_check
        check (ambiente in ('sandbox','homologacao','production')),
    constraint cliente_bancos_auth_mode_check
        check (auth_mode in ('manual','oauth')),
    constraint cliente_bancos_unico
        unique (cliente_integracao_id, banco, produto, ambiente)
);

create index if not exists idx_cliente_bancos_ativo
    on bank_connect.cliente_bancos
    (cliente_integracao_id, banco, produto, ambiente)
    where ativo = true;

commit;
