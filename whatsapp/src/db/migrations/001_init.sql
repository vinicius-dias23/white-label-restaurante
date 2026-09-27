-- Estrutura inicial da integração com o WhatsApp.
--
-- Duas coisas carregam a corretude do sistema inteiro:
--
--   1. A lotação de cada ambiente. Quem garante que o Salão não recebe 44
--      pessoas com lugar para 40 é o `createReservation`: ele trava a linha do
--      ambiente (SELECT ... FOR UPDATE) antes de somar quem já está reservado.
--      Dois clientes confirmando o último lugar no mesmo segundo — um entra, o
--      outro volta para a lista. Não depende da ordem das checagens.
--
--   2. Os UNIQUE em `wa_message_id` e `outbox.dedupe_key`: a Meta reenvia o
--      webhook quando não recebe 200 rápido. Sem eles o cliente é atendido duas
--      vezes e recebe dois lembretes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ---------------------------------------------------------------------------
-- Restaurantes
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL DEFAULT '',
  -- É por aqui que o webhook descobre de qual restaurante é a mensagem.
  phone_number_id   TEXT NOT NULL UNIQUE,
  waba_id           TEXT NOT NULL DEFAULT '',
  -- Token da Meta criptografado com AES-256-GCM (APP_ENCRYPTION_KEY).
  access_token_enc  BYTEA,
  owner_phone       TEXT NOT NULL DEFAULT '',
  timezone          TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  -- restaurante.config.json já normalizado, do jeito que o site também lê.
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_hash       TEXT NOT NULL DEFAULT '',
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  -- O dono pode calar o bot para o restaurante inteiro ("Pausar bot" no menu dele).
  bot_paused_until  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Os ambientes (Salão, Varanda...). É aqui que mora a lotação.
CREATE TABLE areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  -- Quantas PESSOAS cabem ao mesmo tempo. Não é número de mesas.
  capacity    INTEGER NOT NULL CHECK (capacity >= 0),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, slug)
);

-- A equipe do `team[]` do config. Quem tem telefone ganha o painel da recepção.
CREATE TABLE staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  -- Guardado NORMALIZADO (só dígitos, com DDI), igual a `tenants.owner_phone`.
  -- No config ele fica cru, do jeito que o dono digitou — quem normaliza é o
  -- `tenant:sync`, que é onde existe o DEFAULT_COUNTRY_CODE.
  --
  -- Sem UNIQUE parcial em (tenant_id, phone) de propósito: ele faria o
  -- tenant:sync morrer com um 23505 cru quando o dono repetisse um número no
  -- estúdio. Quem avisa sobre isso é o normalizador, com uma frase que se entende.
  phone       TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, slug)
);

-- A busca que roda a cada mensagem recebida.
CREATE INDEX staff_tenant_phone_idx ON staff (tenant_id, phone) WHERE phone <> '';


-- ---------------------------------------------------------------------------
-- Clientes e conversas
-- ---------------------------------------------------------------------------

CREATE TABLE contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Número no formato da Cloud API: só dígitos, com DDI. Ex.: 5511912345678
  wa_id                 TEXT NOT NULL,
  name                  TEXT NOT NULL DEFAULT '',
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Última mensagem RECEBIDA. É daqui que sai a janela de 24h: fora dela,
  -- só template aprovado.
  last_inbound_at       TIMESTAMPTZ,
  -- Opt-in para marketing (reativação, aniversário). LGPD: sem isto, não vai.
  marketing_opt_in      BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_opt_in_at   TIMESTAMPTZ,
  -- "SAIR" do cliente. Corta TODA mensagem programada, sem exceção.
  opted_out             BOOLEAN NOT NULL DEFAULT FALSE,
  opted_out_at          TIMESTAMPTZ,
  birthday              DATE,
  UNIQUE (tenant_id, wa_id)
);

CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  -- Nó atual da máquina de estados do menu.
  state             TEXT NOT NULL DEFAULT 'MENU',
  -- O que o cliente já escolheu no fluxo (pessoas, ambiente, dia...).
  context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enquanto estiver no futuro, o bot fica calado: tem humano atendendo.
  handoff_until     TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------------

CREATE TABLE reservations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  area_id       UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  party_size    INTEGER NOT NULL CHECK (party_size > 0),
  starts_at     TIMESTAMPTZ NOT NULL,
  -- Até quando a mesa fica com o grupo (`booking.durationMin`). É o que devolve
  -- os lugares para a lotação do ambiente.
  ends_at       TIMESTAMPTZ NOT NULL,
  -- pending   grupo grande esperando o dono aprovar — já SEGURA os lugares
  -- scheduled confirmada pelo sistema
  -- confirmed o cliente respondeu "Confirmo" no lembrete
  -- arrived   a recepção marcou que o grupo chegou
  -- completed já passou (o job diário carimba)
  -- no_show   a recepção marcou que o grupo não veio
  -- cancelled o cliente (ou o dono) cancelou
  -- declined  o dono recusou o pedido de um grupo grande
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('pending', 'scheduled', 'confirmed', 'arrived',
                                  'completed', 'no_show', 'cancelled', 'declined')),
  source        TEXT NOT NULL DEFAULT 'whatsapp',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  arrived_at    TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  cancel_reason TEXT NOT NULL DEFAULT '',
  CHECK (ends_at > starts_at)
);

-- As reservas que ocupam lugar: é por aqui que a lotação é somada.
CREATE INDEX reservations_area_live_idx ON reservations (area_id, starts_at, ends_at)
  WHERE status IN ('pending', 'scheduled', 'confirmed', 'arrived');
CREATE INDEX reservations_agenda_idx ON reservations (tenant_id, starts_at);
CREATE INDEX reservations_contact_idx ON reservations (contact_id, starts_at DESC);

-- Feriados, eventos fechados e bloqueios manuais. area_id NULL = fecha o
-- restaurante inteiro.
CREATE TABLE time_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  area_id     UUID REFERENCES areas(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX time_blocks_range_idx ON time_blocks (tenant_id, starts_at, ends_at);


-- ---------------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------------

-- Fila de saída. TUDO que o servidor envia por iniciativa própria passa por
-- aqui: assim nada é enviado duas vezes e nada se perde num restart.
CREATE TABLE outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reservation_id  UUID REFERENCES reservations(id) ON DELETE CASCADE,
  -- lembrete24h | lembrete2h | posAtendimento | reativacao | aniversario | avisoDono
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT NOT NULL DEFAULT '',
  wa_message_id   TEXT,
  -- "<reservation_id>:<kind>". O UNIQUE é o que impede lembrete duplicado.
  dedupe_key      TEXT NOT NULL UNIQUE,
  locked_at       TIMESTAMPTZ,
  locked_by       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX outbox_due_idx ON outbox (scheduled_for) WHERE status = 'pending';

CREATE TABLE message_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  -- ID da própria Meta. UNIQUE = webhook reenviado não vira atendimento duplicado.
  wa_message_id  TEXT UNIQUE,
  type           TEXT NOT NULL DEFAULT '',
  body           JSONB,
  status         TEXT NOT NULL DEFAULT '',
  error_code     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX message_log_contact_idx ON message_log (contact_id, created_at DESC);
CREATE INDEX message_log_created_idx ON message_log (created_at);
