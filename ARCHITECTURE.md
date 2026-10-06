# Arquitetura Cloudflare

## Componentes

- Cloudflare Pages hospeda `index.html`, `style.css`, `script.js` e o logotipo.
- Pages Functions atende as rotas existentes em `/api/*.php`, mantendo compatibilidade com o frontend.
- Cloudflare D1 armazena estado administrativo, agendamentos e bloqueios.
- A sessão administrativa usa cookie `HttpOnly`, `Secure` e `SameSite=Strict`, assinado por HMAC.
- O webhook de agendamento é opcional e configurado por segredo de ambiente.

## Bindings e segredos

- Binding D1: `DB`
- Segredo: `ADMIN_PASSWORD`
- Segredo: `SESSION_SECRET` (valor aleatório longo)
- Variável opcional: `ADMIN_USERNAME` (padrão: `admin`)
- Segredo opcional: `MAKE_WEBHOOK_URL`

## Banco

Execute `migrations/0001_init.sql` no banco D1 antes de ativar as Functions.

## Contrato preservado

O frontend continua chamando:

- `/api/bootstrap.php`
- `/api/auth.php?action=...`
- `/api/state.php?action=...`
- `/api/bookings.php?action=...`

O sufixo `.php` é apenas parte da rota compatível; nenhum PHP é executado.
