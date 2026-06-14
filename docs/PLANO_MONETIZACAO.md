# Plano — Anúncios, Moedas e Armazenamento (Obliviny)

> Direção de produto/arquitetura. App atual é vanilla JS + localStorage (sem backend).
> Este plano introduz backend, moedas e anúncios — migração faseada.

## 1. Objetivo
- Moeda interna ganha assistindo anúncios ou usando o app.
- Moedas compram cosméticos: molduras, temas, bolhas de chat, destaques de perfil/postagem.
- Monetizar com anúncios, sem obrigar pagamento.

## 2. Monetização (tipos de anúncio)
- **Banner**: renda constante baixa; topo/rodapé/entre conteúdos.
- **Recompensado**: usuário assiste por moedas. Só paga se assistir até o fim. Melhor para o sistema de moedas.

## 3. Modelo escolhido
Banner discreto + recompensado por moedas.
- **Banner em**: loja, perfil, feed, comunidade/reino, configurações.
- **Sem banner em**: chat, conversa, digitação, chamada, momentos críticos de navegação.

## 4. Sistema de moedas (valores iniciais)
- 1 anúncio = 50 moedas · limite 5/dia · máx. 250/dia grátis.
- Preços: moldura simples 500 · rara 1.500 · tema 1.000 · bolha 700 · destaque post 300 · destaque perfil 800 · especial 3.000+.

## 5. Regras das moedas
Só credita após anúncio **completo**. Nunca no início.
Fluxo: clicar → carregar → assistir → rede confirma → servidor credita → banco salva saldo.

## 6. Ganhos estimados (300 usuários/dia)
- 3 anúncios/dia → 27.000/mês → ~R$60–450/mês.
- 5 anúncios/dia → 45.000/mês → ~R$150–900/mês.
- Banner sozinho: ~R$10–60/mês. Recompensado compensa mais.

## 7. Receber em dólar
Redes: AppLovin, Unity Ads, ironSource/LevelPlay, Mintegral, AdMob.
Pagamento: Payoneer, conta internacional, Wise/PayPal (se aceito). Algumas convertem p/ real no país da conta.

## 8. Escolha de anúncios
- Início: **AdMob** (mais simples).
- Melhorar: AppLovin, ironSource/LevelPlay, Unity Ads.
- Ideal: AdMob/AppLovin recompensado + banner discreto; moedas como incentivo.

## 9. Hospedagem (até 300 usuários)
- **Vercel**: app/interface.
- **Supabase**: login, banco, moedas, posts, usuários, loja.
- **Cloudflare R2**: imagens, capas, molduras, ícones, arquivos.

## 10. Armazenamento
- Supabase grátis p/ banco (não p/ muitos arquivos).
- Arquivos → R2 (barato; ~30GB+). Alternativa: DigitalOcean Spaces (250GB preço fixo).
- Melhor equilíbrio: Vercel + Supabase + R2.

## 11. Redução de imagens
Aceita PNG/JPG/GIF; salva WebP (transparente p/ transparência; WebP animado/vídeo p/ GIF).
Redução: PNG→WebP 40–80% · JPG→WebP 20–60% · GIF→WebP anim 30–80% · GIF→vídeo 70–95%.

## 12. Qualidade
- Avatar: WebP 80–90%, até 300KB.
- Capa: WebP 80–90%, até 1MB.
- Post: WebP 75–85%, até 1–1,5MB.
- Moldura transparente: WebP transp./PNG otimizado, até 500KB–1MB.
- GIF: WebP animado ou vídeo curto.

## 13. Download pelo usuário
Oferecer WebP/PNG/GIF. Original convertido não volta 100% (base na versão otimizada).
Recomendação inicial: guardar só WebP otimizado.

## 14. Custos
Início quase zero: Vercel grátis, Supabase grátis, R2 barato, domínio opcional. Com 300 ativos os anúncios podem cobrir armazenamento+banco+hospedagem e sobrar lucro.

## 15. Banco de dados (tabelas)
`users` · `profiles` (global + reino/comunidade) · `wallets` · `coin_transactions` · `ads_rewards` · `store_items` · `user_items` · `posts` · `comments` · `media_files`.

## 16. Fluxo anúncio→moedas
loja → assistir → checar limite diário → carregar → assistir até fim → rede confirma → servidor credita → banco salva → "Você ganhou 50 moedas".

## 17. Segurança anti-fraude
Limite diário · sem recompensa sem conclusão · histórico por recompensa · validação no servidor · bloquear spam de cliques · tempo mínimo entre anúncios (ex.: 1 min). Moedas só pelo servidor.

## 18. Ordem de desenvolvimento
1. App base, login, perfil
2. Banco + sistema de usuários
3. Sistema de moedas
4. Loja de itens
5. Upload com conversão WebP
6. Cloudflare R2
7. Anúncios recompensados
8. Banner discreto
9. Painel admin (usuários, moedas, anúncios, itens)
10. Otimizar custo, segurança, desempenho

## 19. Estratégia final
Vercel (app) · Supabase (banco/login/moedas) · R2 (arquivos) · WebP · recompensado p/ moedas · banner discreto · AppLovin/LevelPlay/AdMob · Payoneer/conta internacional p/ dólar.

## 20. Resumo
Usuário usa o app → vê banners discretos → assiste anúncio voluntário → ganha moedas → compra cosméticos. Imagens em WebP no R2, banco/login no Supabase, app na Vercel. Anúncios pagam custos e podem dar lucro.
