-- Telefone do barbeiro: é o que dá acesso ao painel dele no WhatsApp.
--
-- Guardado NORMALIZADO (só dígitos, com DDI), igual a `tenants.owner_phone`. No
-- `barbearia.config.json` ele fica cru, do jeito que o dono digitou — quem
-- normaliza é o `tenant:sync`, que é onde existe o DEFAULT_COUNTRY_CODE.
ALTER TABLE barbers ADD COLUMN phone TEXT NOT NULL DEFAULT '';

-- A busca que roda a cada mensagem recebida.
CREATE INDEX barbers_tenant_phone_idx ON barbers (tenant_id, phone) WHERE phone <> '';

-- "Cortes de hoje / ontem / no mês" do painel do barbeiro.
CREATE INDEX appointments_barber_done_idx
  ON appointments (tenant_id, barber_id, ends_at)
  WHERE status IN ('scheduled', 'confirmed', 'completed');

-- Sem UNIQUE parcial em (tenant_id, phone) de propósito: ele faria o tenant:sync
-- morrer com um 23505 cru quando o dono repetisse um número no estúdio. Quem
-- avisa sobre isso é o normalizador, com uma frase que se entende.
