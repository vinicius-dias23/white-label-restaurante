-- Estrutura inicial da integração com o WhatsApp.
--
-- Duas coisas neste arquivo carregam a corretude do sistema inteiro:
--
--   1. A constraint EXCLUDE em `appointments`: o banco RECUSA fisicamente dois
--      agendamentos sobrepostos para o mesmo barbeiro. Dois clientes tocando no
--      mesmo horário no mesmo segundo — um confirma, o outro volta para a lista.
--      Não depende de a aplicação acertar a ordem das checagens.
--
--   2. Os UNIQUE em `wa_message_id` e `outbox.dedupe_key`: a Meta reenvia o
--      webhook quando não recebe 200 rápido. Sem eles o cliente é atendido duas
--      vezes e recebe dois lembretes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- necessário para "barber_id WITH =" no EXCLUDE


-- ---------------------------------------------------------------------------
-- Barbearias
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL DEFAULT '',
  -- É por aqui que o webhook descobre de qual barbearia é a mensagem.
  phone_number_id   TEXT NOT NULL UNIQUE,
  waba_id           TEXT NOT NULL DEFAULT '',
  -- Token da Meta criptografado com AES-256-GCM (APP_ENCRYPTION_KEY).
  access_token_enc  BYTEA,
  owner_phone       TEXT NOT NULL DEFAULT '',
  timezone          TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  -- barbearia.config.json já normalizado, do jeito que o site também lê.
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_hash       TEXT NOT NULL DEFAULT '',
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  -- O dono pode calar o bot para a barbearia inteira ("Pausar bot" no menu dele).
  bot_paused_until  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE barbers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, slug)
);

CREATE TABLE services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  price_label   TEXT NOT NULL DEFAULT '',
  duration_min  INTEGER NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, slug)
);


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
  -- O que o cliente já escolheu no fluxo (serviço, barbeiro, dia...).
  context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enquanto estiver no futuro, o bot fica calado: tem humano atendendo.
  handoff_until     TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------------

CREATE TABLE appointments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  barber_id     UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id    UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
  source        TEXT NOT NULL DEFAULT 'whatsapp',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancel_reason TEXT NOT NULL DEFAULT '',
  CHECK (ends_at > starts_at),

  -- A trava contra dupla marcação. Só vale para agendamentos vivos: cancelado
  -- libera o horário na hora.
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('scheduled', 'confirmed'))
);

CREATE INDEX appointments_agenda_idx ON appointments (tenant_id, starts_at)
  WHERE status IN ('scheduled', 'confirmed');
CREATE INDEX appointments_contact_idx ON appointments (contact_id, starts_at DESC);

-- Folgas, feriados e bloqueios manuais. barber_id NULL = fecha para todo mundo.
CREATE TABLE time_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id   UUID REFERENCES barbers(id) ON DELETE CASCADE,
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
  appointment_id  UUID REFERENCES appointments(id) ON DELETE CASCADE,
  -- lembrete24h | lembrete2h | posAtendimento | reativacao | aniversario | aviso_dono
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT NOT NULL DEFAULT '',
  wa_message_id   TEXT,
  -- "<appointment_id>:<kind>". O UNIQUE é o que impede lembrete duplicado.
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
