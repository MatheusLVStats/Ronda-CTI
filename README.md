# Ronda CTI

Round beira-leito para plantão de CTI: checklist da ronda, dispositivos com dias contados, infusões com dose calculada, antibióticos, balanço, exames, plano e pendências. Gera a **evolução padrão** e a **passagem de plantão** prontas para colar no prontuário (TI MED), no mesmo modelo do CriticalEye.

App: https://matheuslvstats.github.io/Ronda-CTI/ (no celular, abra no Safari ou Chrome e use "Adicionar à Tela de Início").

## Como funciona

- **Round diário.** Ao iniciar o round do dia, cada leito copia o anterior: dispositivos e antibióticos seguem contando pela data de início (D0), laboratório e gasometria viram "anterior", e 24 h, sinais vitais, checklist e plano recomeçam. Infusões, ventilação e neurológico vêm marcados para conferir.
- **Evolução e passagem.** Texto com um item por linha e só letras, números, acentos e `/ - : > < + % , . ( )`, porque o TI MED troca símbolos como o ponto médio por "?". Sem nome do paciente: o texto vai colado no prontuário dele.
- **Sincronização (opcional).** O celular e o PC do plantão ficam iguais em segundos. Os dados são cifrados no aparelho (AES-256-GCM) antes de sair dele; o servidor (Supabase, São Paulo) guarda só texto cifrado. A chave e a senha de login saem da sua senha por PBKDF2 (600 mil iterações) e o servidor nunca recebe a chave. Se a senha for esquecida, os dados da nuvem não podem ser recuperados.
- **No computador do hospital** não marque "lembrar neste aparelho": o app bloqueia sozinho após 15 minutos sem uso e não guarda nada legível no disco.
- **Importar PDF** (PDF com texto, gerado pelo sistema; PDF escaneado ainda não é lido): o arquivo é lido no próprio navegador e não sai do aparelho nem fica guardado. Nada entra no leito sem o médico conferir; o nome do paciente aparece só para conferir o leito e não é salvo. A biblioteca de leitura (pdf.js) só é baixada ao importar.
  - *Evolução ou sumário*: identificação, data de internação, diagnósticos, comorbidades, medicações, alergias, dispositivos, antimicrobianos, culturas, exames e ventilação.
  - *Laboratório*: data e hora da coleta, Hb, leucócitos, plaquetas, PCR, INR, Na, K, Mg, ureia, creatinina, gasometria e outros (Ht, glicose, Ca, TGO, TGP, bilirrubinas, TTPA, troponina, procalcitonina...). O exame mais novo vira o atual e o de antes passa a anterior. Ignora o EAS (pH, glicose e leucócitos da urina), não pega HCM nem valor de referência, converte "15,2 mil" em 15.200 e marca para conferir o valor fora da faixa esperada.
  - *Laudo de imagem*: exame, data e conclusão (TC, RX, USG, RM, ecocardiograma, DTC...). Se o exame já estava no leito aguardando laudo, a conclusão completa o registro.
  - Botões de importar também nas seções Laboratório, Gasometria e Imagem (um toque abre o arquivo).
- **Balanço com débito de cada dreno.** Hemovac, drenos de cavidade, tubular/laminar, torácico, DVE e SNG em sifonagem entram sozinhos em Últimas 24 h, cada um com seu campo de débito (o mesmo do cartão do dispositivo); outros dispositivos podem ser marcados como dreno. Ostomia, SVD e cateteres não entram. Há ainda "Outros drenos" para o que não estiver listado. Na evolução: "Drenos 420 ml (DVE 120 / Hemovac 300)".
- **Round impresso** (modelo CriticalEye): um leito ou o round todo, A4 preto e branco, 1 leito por folha (paisagem) ou 2 por folha (retrato, economia). Só o que foi preenchido, na ordem da tela; checklist e pendências com quadradinho, plano digitado na própria janela de impressão (fica salvo no leito), linhas para anotações, alergia em tarja preta. A letra diminui sozinha para cada leito caber na folha. Como o app não guarda o nome, a folha traz uma linha para escrever à mão.
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
