# Ronda CTI

Round beira-leito para plantão de CTI: checklist da ronda, dispositivos com dias contados, infusões com dose calculada, antibióticos, balanço, exames, plano e pendências. Gera a **evolução padrão** e a **passagem de plantão** prontas para colar no prontuário (TI MED), no mesmo modelo do CriticalEye.

App: https://matheuslvstats.github.io/Ronda-CTI/ (no celular, abra no Safari ou Chrome e use "Adicionar à Tela de Início").

## Como funciona

- **Round diário.** Ao iniciar o round do dia, cada leito copia o anterior: dispositivos e antibióticos seguem contando pela data de início (D0), laboratório e gasometria viram "anterior", e 24 h, sinais vitais, checklist e plano recomeçam. Infusões, ventilação e neurológico vêm marcados para conferir.
- **Evolução e passagem.** Texto com um item por linha e só letras, números, acentos e `/ - : > < + % , . ( )`, porque o TI MED troca símbolos como o ponto médio por "?". Sem nome do paciente: o texto vai colado no prontuário dele.
- **Sincronização (opcional).** O celular e o PC do plantão ficam iguais em segundos. Os dados são cifrados no aparelho (AES-256-GCM) antes de sair dele; o servidor (Supabase, São Paulo) guarda só texto cifrado. A chave e a senha de login saem da sua senha por PBKDF2 (600 mil iterações) e o servidor nunca recebe a chave. Se a senha for esquecida, os dados da nuvem não podem ser recuperados.
- **No computador do hospital** não marque "lembrar neste aparelho": o app bloqueia sozinho após 15 minutos sem uso e não guarda nada legível no disco.
- **Saída do CTI** apaga o leito do aparelho e o conteúdo da nuvem.
- Sem sugestão de conduta nem de dose: o app só calcula a partir do que foi informado (dias, dose da infusão pela vazão, TFG pela CKD-EPI 2021, balanço).

## Estrutura

- Raiz do repositório: o app compilado, que o GitHub Pages publica.
- `app/`: código-fonte (React + Vite), testes e a migração do banco em `app/supabase/migrations/`.

```bash
cd app
npm install
npm test        # cálculos, textos, round diário, migração do app anterior e sincronização cifrada
npm run build   # gera o app na raiz do repositório
```

Dados do app anterior (v1) que estiverem no mesmo endereço são migrados automaticamente na primeira abertura.

---

App desenvolvido por Dr. Matheus Barros - CRM/RJ 1361210
