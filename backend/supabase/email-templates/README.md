# E-mails do Oblivian

Templates HTML prontos (pt-BR, marca Oblivian, seguros p/ cliente de e-mail:
layout em `<table>`, estilos inline, sem CSS externo). Acento `#7c59ec`.

## Onde colar (Supabase → Authentication → Email Templates)

| Arquivo | Slot no Supabase | Assunto sugerido | Variável-chave |
|---|---|---|---|
| `verify-account.html` | **Confirm signup** | `Seu código Oblivian: {{ .Token }}` | `{{ .Token }}` (6 díg.) |
| `login-code.html` | **Magic Link** | `Seu código de acesso: {{ .Token }}` | `{{ .Token }}` |
| `reset-password.html` | **Reset Password** | `Redefinir sua senha Oblivian` | `{{ .ConfirmationURL }}` |
| `email-changed.html` | **Change Email Address** | `Confirme seu novo e-mail` | `{{ .ConfirmationURL }}` |

Para cada um: cole o HTML no campo "Message body" e ajuste o "Subject" acima.

### Importante p/ o código de 6 dígitos funcionar
O **Confirm signup** precisa usar `{{ .Token }}` (não `{{ .ConfirmationURL }}`) —
é o que o app lê no fluxo `verifyOtp`. Os arquivos já vêm assim.
Defina também o **OTP Expiration = 600** (10 min) em Auth → Providers → Email.

## Alerta de segurança (NÃO é template do Supabase)

`security-alert.html` é enviado pelo **seu** código (ex.: Edge Function chamando a
API do Resend) quando você detectar login suspeito / novo aparelho / troca de senha.
O Supabase Auth não dispara esse e-mail sozinho.

Placeholders `%%...%%` são trocados pelo seu código de envio (não são variáveis Supabase):
`%%TITLE%%`, `%%MESSAGE%%`, `%%DATE%%`, `%%DEVICE%%`, `%%LOCATION%%`, `%%SECURE_URL%%`.

> Cobre os itens "Suspicious login warning" e "Account security alert" do plano.
> A detecção (quando disparar) + a Edge Function de envio ficam p/ a etapa de
> "login step-up" — os templates já estão prontos pra quando ligar.

## Variáveis Supabase disponíveis
`{{ .Token }}` · `{{ .ConfirmationURL }}` · `{{ .SiteURL }}` · `{{ .Email }}` · `{{ .RedirectTo }}` · `{{ .TokenHash }}`

## Pré-visualizar
Abra qualquer `.html` no navegador. As variáveis aparecem como texto cru
(`{{ .Token }}` / `%%DATE%%`) até serem preenchidas no envio real.
