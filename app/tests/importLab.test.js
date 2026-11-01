import { describe, it, expect } from 'vitest';
import { parseLab, applyLab, placePanel, parseLaudos, applyLaudos } from '../src/lib/importLab.js';
import { itemsToLines } from '../src/lib/pdftext.js';
import { newPatient, emptyLabs } from '../src/lib/model.js';
import { buildEvolucao } from '../src/lib/text.js';

const HOJE = '2026-11-01';

// Laudo de laboratório fictício, com as armadilhas comuns (urina antes da gaso, HCM, referência).
const LAB = `LABORATÓRIO EXEMPLO
Paciente: FULANO FICTÍCIO Prontuário: 000000
Data da coleta: 31/10/2026 06:10
HEMOGRAMA
Hemácias 3,10 milhões/mm³ 4,50 a 5,90
Hemoglobina 9,4 g/dL 13,5 a 17,5
Hematócrito 28,1 % 39 a 50
HCM 29,9 pg 26 a 34
Hemoglobina corpuscular média 29,9 pg
Leucócitos 12.800 /mm³ 4.000 a 11.000
Plaquetas 245.000 /mm³ 150.000 a 450.000
COAGULOGRAMA
Tempo de protrombina 13,8 s Atividade 78 % INR 1,15
BIOQUÍMICA
Ureia 45 mg/dL 15 a 40
Creatinina 0,79 mg/dL 0,70 a 1,30
Sódio 147 mEq/L 135 a 145
Potássio 3,4 mEq/L 3,5 a 5,0
Magnésio 1,8 mg/dL 1,6 a 2,6
Cálcio iônico 1,12 mmol/L
TGO 45 U/L até 40
Proteína C reativa 12,1 mg/dL até 0,5
EAS
pH 6,0
Glicose negativa
GASOMETRIA ARTERIAL
pH 7,44 7,35 a 7,45
pCO2 35,0 mmHg 35 a 45
pO2 98,0 mmHg 80 a 100
HCO3 24,1 mmol/L 22 a 26
BE -1,2 mmol/L -2 a +2
SatO2 97,5 %
Lactato 1,1 mmol/L 0,5 a 2,2
Liberado por: Dra. Exemplo CRM 00000`;

describe('PDF de laboratório', () => {
  const r = parseLab(LAB, HOJE);
  const val = (k) => (r.itens.find((x) => x.k === k) || {}).valor;

  it('data da coleta', () => {
    expect(r.data).toBe('2026-10-31');
    expect(r.hora).toBe('06:10');
  });
  it('painel principal, sem pegar HCM nem valor de referência', () => {
    expect(val('hb')).toBe('9,4');
    expect(val('leuc')).toBe('12.800');
    expect(val('plaq')).toBe('245.000');
    expect(val('inr')).toBe('1,15');
    expect(val('ur')).toBe('45');
    expect(val('cr')).toBe('0,79');
    expect(val('na')).toBe('147');
    expect(val('k')).toBe('3,4');
    expect(val('mg')).toBe('1,8');
    expect(val('pcr')).toBe('12,1');
  });
  it('gasometria, sem confundir com o pH da urina', () => {
    expect(val('ph')).toBe('7,44');
    expect(val('pco2')).toBe('35,0');
    expect(val('po2')).toBe('98,0');
    expect(val('hco3')).toBe('24,1');
    expect(val('be')).toBe('-1,2');
    expect(val('sao2')).toBe('97,5');
    expect(val('lac')).toBe('1,1');
    expect(r.itens.every((x) => !x.suspeito)).toBe(true);
  });
  it('outros exames', () => {
    expect(r.outros.map((o) => `${o.label} ${o.valor}`)).toEqual(['Ht 28,1', 'Ca iônico 1,12', 'TGO 45']);
  });

  it('o mais novo vira atual e o de antes vira anterior', () => {
    const p = newPatient(HOJE);
    p.labs = { ...emptyLabs(), data: '2026-10-30', hb: '9,8', leuc: '14.200', cr: '0,82' };
    const n = applyLab(p, { data: r.data, itens: r.itens, outros: r.outros });
    expect(n.labs).toMatchObject({ data: '2026-10-31', hb: '9,4', leuc: '12.800', cr: '0,79' });
    expect(n.labsAnt).toMatchObject({ data: '2026-10-30', hb: '9,8', cr: '0,82' });
    expect(n.labs.outros).toBe('Ht 28,1\nCa iônico 1,12\nTGO 45');
    expect(n.gaso).toMatchObject({ data: '2026-10-31', ph: '7,44', hora: '' });
    const txt = buildEvolucao({ ...n, idade: '58', sexo: 'M' }, { hoje: HOJE, unidade: 'CTI', leito: '01', drugConc: {} });
    expect(txt).toContain('LABORATÓRIO (30/10 > 31/10):');
    expect(txt).toContain('Hb 9,8 > 9,4');
    expect(txt).toContain('TGO 45');
    expect(txt).toContain('BE -1,2');
  });

  it('exame mais antigo que o atual entra como anterior; mesma data completa o atual', () => {
    const cur = { ...emptyLabs(), data: '2026-10-31', hb: '9,4' };
    expect(placePanel(cur, emptyLabs(), '2026-10-29', { hb: '10,1' }, emptyLabs)).toMatchObject({ destino: 'anterior', cur: { hb: '9,4' }, ant: { data: '2026-10-29', hb: '10,1' } });
    expect(placePanel(cur, emptyLabs(), '2026-10-31', { k: '3,9' }, emptyLabs)).toMatchObject({ destino: 'atual', cur: { hb: '9,4', k: '3,9' } });
  });

  it('valor fora do plausível vem marcado para conferir', () => {
    const r2 = parseLab('Data da coleta: 31/10/2026\nSódio 14,7 mEq/L', HOJE);
    expect(r2.itens[0]).toMatchObject({ k: 'na', valor: '14,7', suspeito: true });
  });
});

const LAUDO = `SERVIÇO DE RADIOLOGIA EXEMPLO
Paciente: FULANO FICTÍCIO Prontuário: 000000
TOMOGRAFIA COMPUTADORIZADA DE CRÂNIO SEM CONTRASTE
Data do exame: 30/10/2026
Técnica: aquisição volumétrica sem contraste.
Análise:
Área hipodensa córtico-subcortical em território da artéria cerebral média esquerda.
Ventrículos de dimensões normais.
Conclusão:
Isquemia em território de ACM esquerda, sem transformação hemorrágica.
Sem hidrocefalia.
Dr. Radiologista Exemplo CRM 00000
ANGIOTOMOGRAFIA ARTERIAL CERVICAL E INTRACRANIANA
Data do exame: 30/10/2026
Análise: oclusão do segmento M1 esquerdo.
Impressão diagnóstica: oclusão de M1 à esquerda.
Laudo assinado eletronicamente`;

describe('PDF de laudo de imagem', () => {
  const r = parseLaudos(LAUDO, HOJE);
  it('separa os exames com data e conclusão', () => {
    expect(r.map((e) => [e.exame, e.data, e.resultado])).toEqual([
      ['TC de crânio sem contraste', '2026-10-30', 'Isquemia em território de ACM esquerda, sem transformação hemorrágica. Sem hidrocefalia.'],
      ['Angio-TC arterial cervical e intracraniana', '2026-10-30', 'oclusão de M1 à esquerda.'],
    ]);
  });
  it('não duplica o mesmo exame', () => {
    const p = newPatient(HOJE);
    const n = applyLaudos(p, r);
    expect(n.exames).toHaveLength(2);
    expect(applyLaudos(n, r).exames).toHaveLength(2);
    const txt = buildEvolucao(n, { hoje: HOJE, unidade: 'CTI', leito: '01', drugConc: {} });
    expect(txt).toContain('TC de crânio sem contraste 30/10: Isquemia em território de ACM esquerda, sem transformação hemorrágica. Sem hidrocefalia.');
  });
});

describe('laudo que chega depois', () => {
  const r = parseLaudos(LAUDO, HOJE);
  it('completa o exame que aguardava laudo, sem duplicar', () => {
    const p = newPatient(HOJE);
    p.exames = [{ id: 'x1', exame: 'TC crânio', data: '2026-10-30', resultado: '' }];
    const n = applyLaudos(p, r);
    expect(n.exames).toHaveLength(2);
    expect(n.exames[0]).toMatchObject({ id: 'x1', exame: 'TC crânio', resultado: expect.stringContaining('Isquemia em território de ACM') });
    expect(n.exames[1].exame).toBe('Angio-TC arterial cervical e intracraniana');
  });
  it('outro dia ou outro exame não se confundem', () => {
    const p = newPatient(HOJE);
    p.exames = [
      { id: 'a', exame: 'TC de crânio', data: '2026-10-28', resultado: 'sem alterações agudas' },
      { id: 'b', exame: 'TC de tórax', data: '2026-10-30', resultado: '' },
    ];
    const n = applyLaudos(p, r);
    expect(n.exames).toHaveLength(4);
    expect(n.exames.find((e) => e.id === 'b').resultado).toBe('');
  });
});

describe('laboratório em outros formatos', () => {
  it('tabela em colunas (TAB entre colunas) e duas colunas na mesma linha', () => {
    const txt = [
      'Data da coleta: 31/10/2026',
      'Exame\tResultado\tUnidade\tReferência',
      'Hemoglobina\t9,4\tg/dL\t13,5 a 17,5',
      'Leucócitos\t12,8\tmil/mm³\t4,0 a 11,0',
      'Plaquetas\t245\tx10³/µL\t150 a 450',
      'Sódio\t147\tmEq/L\tPotássio\t3,4\tmEq/L',
      'Proteína C reativa\t121\tmg/L\taté 5',
      'INR\t1,15',
    ].join('\n');
    const r = parseLab(txt, HOJE);
    const it = (k) => r.itens.find((x) => x.k === k) || {};
    expect(it('hb').valor).toBe('9,4');
    expect(it('leuc')).toMatchObject({ valor: '12.800', suspeito: false, nota: 'Convertido de 12,8 mil.' });
    expect(it('plaq')).toMatchObject({ valor: '245.000', suspeito: false });
    expect(it('na').valor).toBe('147');
    expect(it('k').valor).toBe('3,4');
    expect(it('pcr')).toMatchObject({ valor: '121', nota: 'No PDF a unidade é mg/L.' });
    expect(it('inr').valor).toBe('1,15');
  });

  it('um exame por bloco, resultado na linha de baixo, urina antes do sangue', () => {
    const txt = [
      'Paciente: FULANO FICTÍCIO Data de nascimento: 12/03/1962',
      'Liberado em 31/10/2026 10:15',
      'URINA TIPO I',
      'Material: Urina',
      'pH 6,0',
      'Leucócitos 8.000 /mL',
      'SÓDIO',
      'Material: Soro',
      'Resultado: 133 mEq/L',
      'CREATININA',
      'Material: Soro',
      'Resultado: 1,42 mg/dL',
      'GASOMETRIA ARTERIAL',
      'PaO2/FiO2 245',
      'pH 7,31',
      'PaCO2 48,2 mmHg',
      'PaO2 72 mmHg',
      'SaO2 93 %',
      'cHCO3- 23,9 mmol/L',
    ].join('\n');
    const r = parseLab(txt, HOJE);
    const val = (k) => (r.itens.find((x) => x.k === k) || {}).valor;
    expect(r.data).toBe('2026-10-31'); // não pega a data de nascimento
    expect(val('na')).toBe('133');
    expect(val('cr')).toBe('1,42');
    expect(val('leuc')).toBeUndefined(); // leucócitos da urina não entram
    expect(val('ph')).toBe('7,31');
    expect(val('pco2')).toBe('48,2');
    expect(val('po2')).toBe('72');
    expect(val('sao2')).toBe('93');
    expect(val('hco3')).toBe('23,9');
  });

  it('não perde o sinal negativo do BE (hífen, menos tipográfico, valor na linha de baixo)', () => {
    const v = (txt) => (parseLab(txt, HOJE).itens.find((x) => x.k === 'be') || {}).valor;
    expect(v('BE\t-0,8\tmmol/L')).toBe('-0,8');
    expect(v('BE\t\u22122,5\tmmol/L')).toBe('-2,5');
    expect(v('Excesso de bases: \u22123,1 mmol/L')).toBe('-3,1');
    expect(v('BE\n-4,0 mmol/L')).toBe('-4,0');
    expect(v('- Hemoglobina\t9,4\nBE\t+1,2')).toBe('1,2');
  });

  it('pdf.js: espaço largo entre colunas vira TAB', () => {
    const it = (str, x, w) => ({ str, transform: [10, 0, 0, 10, x, 500], width: w });
    expect(itemsToLines([it('Hemoglobina', 50, 55), it('9,4', 200, 14), it('g/dL', 260, 20)])).toBe('Hemoglobina\t9,4\tg/dL');
    expect(itemsToLines([it('Proteína', 50, 40), it('C', 92, 6), it('reativa', 100, 32)])).toBe('Proteína C reativa');
  });
});

describe('laudo em outros formatos', () => {
  it('"Procedimento:" como título, número do exame e nascimento ignorados', () => {
    const txt = [
      'Paciente: FULANO FICTÍCIO DN: 12/03/1962',
      'Exame: 4471203',
      'Procedimento: RX DE TÓRAX NO LEITO AP',
      'Realizado em 31/10/2026',
      'Análise: cateter venoso central com extremidade em projeção de veia cava superior.',
      'Impressão: opacidade em base direita, sem pneumotórax.',
      'Médico responsável: Dr. Exemplo',
    ].join('\n');
    const r = parseLaudos(txt, HOJE);
    expect(r.map((e) => [e.exame, e.data, e.resultado])).toEqual([['RX de tórax no leito AP', '2026-10-31', 'opacidade em base direita, sem pneumotórax.']]);
  });
});
