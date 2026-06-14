# Obliviny — App Android (Capacitor + AdMob)

Envelopa o site (`www/`) num app Android nativo com **AdMob rewarded real**.
O mesmo código web roda no WebView; o botão "Assistir anúncio" usa AdMob nativo
(via `js/components/ads.js` → `window.Capacitor.Plugins.AdMob`).

## Estrutura
- `package.json` — deps Capacitor + `@capacitor-community/admob`.
- `capacitor.config.json` — appId `com.Obliviny.app`, webDir `www`.
- `www/` — cópia do site (sincronizar a cada mudança do app web).
- `android/` — projeto nativo gerado.

## Pré-requisitos (já presentes nesta máquina)
- Node + npm · JDK 17 · Android SDK (`ANDROID_HOME`).

## Atualizar o conteúdo web no app
Quando mudar o site, recopie e sincronize:
```powershell
# na raiz do projeto: recopiar site -> mobile/www (ver script de build do site)
Set-Location mobile
npx cap sync android
```

## Gerar APK de teste (debug)
```powershell
Set-Location mobile/android
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
./gradlew.bat assembleDebug
# saída: android/app/build/outputs/apk/debug/app-debug.apk
```
Instale no celular (USB, depuração ativada):
```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r app/build/outputs/apk/debug/app-debug.apk
```
Ou copie o `.apk` pro celular e instale (permitir "fontes desconhecidas").

## Anúncios — IDs de TESTE vs REAIS
Hoje usa IDs de **teste** do Google (mostram anúncio de teste, sem conta):
- App ID (AndroidManifest.xml): `ca-app-pub-3940256099942544~3347511713`
- Rewarded (js/components/ads.js → AD_UNITS.rewarded): `ca-app-pub-3940256099942544/5224354917`

Para anúncios REAIS (receita):
1. Cria conta em https://admob.google.com → registra o app (`com.Obliviny.app`).
2. Cria unidade **Recompensado** → pega o `ca-app-pub-SEU~APP` e `ca-app-pub-SEU/UNIT`.
3. Troca:
   - `AndroidManifest.xml` → `com.google.android.gms.ads.APPLICATION_ID`.
   - `config.js` (ou `ads.js`) → `ads.admob.rewardedId`.
4. `npx cap sync` → rebuild.
> NUNCA clique nos próprios anúncios reais (banimento).

## Publicar na Play Store
1. Conta de desenvolvedor Google Play (US$25, única vez).
2. Gera **AAB assinado**: `./gradlew.bat bundleRelease` (configure keystore em `android/app`).
3. Play Console → cria app → sobe o `.aab` → preenche ficha, política de privacidade
   (https://Obliviny.pages.dev/privacidade), classificação etária → envia para revisão.

## Crédito de moeda (anti-fraude)
O reward só credita no callback `onRewardedVideoAdReward` (rede confirma).
Em produção, valide server-to-server (SSV do AdMob) antes de creditar no Supabase.
