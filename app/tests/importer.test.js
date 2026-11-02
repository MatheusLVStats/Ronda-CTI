import { describe, it, expect } from 'vitest';
import { parseEvolucao, applyImport, splitSections, findDate } from '../src/lib/importer.js';
import { itemsToLines } from '../src/lib/pdftext.js';
import { newPatient } from '../src/lib/model.js';

const HOJE = '2026-11-01';

// Evolução fictícia no estilo de um sumário de transferência.
const EVOLUCAO = `HOSPITAL EXEMPLO - EVOLUÇÃO MÉDICA
Paciente: JOSÉ FICTÍCIO DA SILVA Prontuário: 000000
Idade: 64 anos Sexo: Masculino
Data de internação: 25/10/2026 Setor: Enfermaria de Clínica Médica
Peso: 78 kg
HD:
1. AVC isquêmico de ACM esquerda (24/10)
2. PO trombectomia mecânica (25/10)
3. Pneumonia aspirativa
HPP: HAS, DM2, tabagismo
Medicações de uso contínuo:
- Losartana 50 mg 12/12h
- Metformina 850 mg 2x/dia
Alergias: dipirona
HDA: paciente admitido com hemiparesia direita súbita, recebeu alteplase.
Dispositivos:
- TOT (IOT em 25/10 na emergência)
- CVC VJID 26/10
- SVD 25/10
- AVP retirado em 27/10
ATB:
- Ceftriaxona D0 27/10
- Clindamicina D0 27/10
- Cefazolina profilática 25/10 a 26/10 (suspensa)
Culturas:
- Hemocultura 27/10: sem crescimento parcial
- Secreção traqueal 27/10: pendente
Exames:
TC de crânio 26/10: área isquêmica em território de ACM esquerda, sem transformação hemorrágica
Suporte ventilatório: PCV PI 16 PEEP 8 FiO2 40% FR 18 VC 480
Conduta: manter antibiótico, alergia a amoxicilina relatada pela família? checar
`;

describe('leitura de evolução/sumário', () => {
  const r = parseEvolucao(EVOLUCAO, HOJE);

  it('acha os dados de identificação (o nome só serve para conferir)', () => {
    expect(r.paciente).toMatchObject({ nome: 'JOSÉ FICTÍCIO DA SILVA', idade: '64', sexo: 'M', peso: '78', internacao: '2026-10-25' });
    expect(r.paciente.origem).toContain('Enfermaria');
  });

  it('separa diagnósticos e marca o pós-operatório', () => {
    expect(r.diagnosticos.map((d) => d.texto)).toEqual(['AVC isquêmico de ACM esquerda', 'PO trombectomia mecânica', 'Pneumonia aspirativa']);
    expect(r.diagnosticos[1]).toMatchObject({ cirurgia: true, data: '2026-10-25' });
    expect(r.diagnosticos[0].cirurgia).toBe(false);
  });

  it('lê comorbidades, medicações e alergias', () => {
    expect(r.comorbidades).toEqual(['HAS', 'DM2', 'tabagismo']);
    expect(r.medicacoes).toEqual(['Losartana 50 mg 12/12h', 'Metformina 850 mg 2x/dia']);
    expect(r.alergias).toEqual(['dipirona']);
  });

  it('lê dispositivos com data e sítio, e ignora o que já foi retirado', () => {
    expect(r.dispositivos.map((d) => [d.nome, d.data, d.sitio])).toEqual([
      ['TOT', '2026-10-25', ''],
      ['CVC', '2026-10-26', 'VJID'],
      ['SVD', '2026-10-25', ''],
    ]);
    expect(r.dispositivos[0].origem).toBe('Emergência');
  });

  it('lê antimicrobianos em uso e prévios, sem confundir com alergia', () => {
    const emUso = r.atbs.filter((a) => !a.fim).map((a) => [a.nome, a.inicio]);
    expect(emUso).toEqual([['Ceftriaxona', '2026-10-27'], ['Clindamicina', '2026-10-27']]);
    const previo = r.atbs.find((a) => a.nome === 'Cefazolina');
    expect(previo).toMatchObject({ inicio: '2026-10-25', fim: '2026-10-26' });
    expect(r.atbs.some((a) => /amoxicilina/i.test(a.nome))).toBe(false);
  });

  it('lê culturas, exames e ventilação', () => {
    expect(r.culturas.map((c) => [c.material, c.data, c.resultado])).toEqual([
      ['Hemocultura', '2026-10-27', 'sem crescimento parcial'],
      ['Secreção traqueal', '2026-10-27', 'pendente'],
    ]);
    expect(r.exames[0]).toMatchObject({ exame: 'TC de crânio', data: '2026-10-26' });
    expect(r.vent).toMatchObject({ modo: 'PCV', pi: '16', peep: '8', fio2: '40', fr: '18', vc: '480' });
  });

  it('aplica só o que foi marcado e nunca guarda o nome', () => {
    const p = newPatient(HOJE);
    p.comorbidades = 'HAS';
    const n = applyImport(p, {
      paciente: { idade: '64', sexo: 'M', internacao: '2026-10-25' },
      comorbidades: r.comorbidades,
      dispositivos: r.dispositivos.slice(0, 2),
      atbs: r.atbs,
    });
    expect(n.idade).toBe('64');
    expect(n.internacao).toBe('2026-10-25');
    expect(n.comorbidades).toBe('HAS\nDM2\ntabagismo');
    expect(n.dispositivos).toHaveLength(2);
    expect(n.dispositivos[0].fonte).toBeUndefined();
    expect(JSON.stringify(n)).not.toContain('JOSÉ');
    expect(n.diagnosticos).toHaveLength(0);
  });
});

describe('detalhes da leitura', () => {
  it('data sem ano no futuro é do ano anterior', () => {
    expect(findDate('28/12', '2027-01-05')).toBe('2026-12-28');
    expect(findDate('05/01', '2027-01-05')).toBe('2027-01-05');
  });
  it('frase comum não vira título de seção', () => {
    const s = splitSections('Paciente com problemas respiratórios desde ontem\nHD: sepse');
    expect(s.diag).toEqual(['sepse']);
  });
  it('monta linhas a partir das posições do pdf.js', () => {
    const items = [
      { str: 'Idade:', transform: [1, 0, 0, 1, 50, 700], width: 30 },
      { str: '64 anos', transform: [1, 0, 0, 1, 85, 700.5], width: 35 },
      { str: 'HD:', transform: [1, 0, 0, 1, 50, 680], width: 15 },
    ];
    expect(itemsToLines(items)).toBe('Idade: 64 anos\nHD:');
  });
});

// Formato do sistema do hospital (texto fictício com a mesma estrutura: tabelas com TAB, "#" e caixa alta).
const SISTEMA = [
  'EVOLUÇÃO MÉDICA',
  'Nome\tBoletim\tData/Hora Entrada',
  'Data/Hora Saída',
  'FULANO FICTICIO DE TAL\t000000\t26/10/2026 00:15:16',
  'Data de nascimento\tIdade\tSexo\tCNS\tProntuário',
  '01/01/1960\t66\tMasculino\t000\t000',
  'Data evolução\tData Internação\tSeção\tLeito',
  '01/11/2026 23:52:58\t25/10/2026 01:25:06\tCTI 1\tLEITO 06 CTI 1',
  'AVC: NÃO\tSEPSE: NÃO\tATB: NÃO',
  'VENTILAÇÃO MECÂNICA',
  'INVASIVA: NÃO\tNÃO INVASIVA: NÃO',
  'AR AMBIENTE: NÃO',
  '# EVOLUÇÃO MÉDICA CTI 1 - POSTO 2 - LEITO 6 - DOMINGO-NOITE #',
  '#IH 26/10',
  '#ADMISSAO CTI 26/10',
  '#TCE GRAVE',
  '#POS OP DE CRANIECTOMIA DESCOMPRESSIVA A DIREITA',
  '#HDA: queda de altura, submetido a IOT em unidade de origem.',
  '# HPP: s informaçao',
  '# ALERGIAS: s informaçao',
  '#ATB CLAVULIN INICIO 26/10 + CLARITOMICINA 27/10',
  '#INVASÕES',
  'VM+TOT 25/10 C CC',
  'TROCA DE TUBO 7,5 (26/10) EM CTI',
  'PVP VJIE (26/10)',
  'PAI AFD CC',
  'CNE',
  '> TEVE DRENO 26/10',
  '#INFUSOES',
  '- FENTANIL 0,5 ML/H',
  '- RL 21 ML/H',
  '- DIETA 21 ML/H',
  '#VM: PSV 11 - PEEP 6 - FIO2 0,30',
  '# CONDUTA CONFORME ROTINA MEDICA:',
  '- EM CASO DE INSTABILIDADE ESCALONAR O ATB PARA TAZOCIN.',
].join('\n');

describe('evolução do sistema do hospital', () => {
  const r = parseEvolucao(SISTEMA, HOJE);
  it('identificação pelas tabelas e pelo #IH/#ADMISSAO', () => {
    expect(r.paciente).toMatchObject({ nome: 'FULANO FICTICIO DE TAL', idade: '66', sexo: 'M', internacao: '2026-10-26', admissao: '2026-10-26' });
  });
  it('diagnósticos nas linhas com #', () => {
    expect(r.diagnosticos.map((d) => [d.texto, d.cirurgia])).toEqual([['TCE GRAVE', false], ['POS OP DE CRANIECTOMIA DESCOMPRESSIVA A DIREITA', true]]);
    expect(r.alergias).toEqual([]);
    expect(r.comorbidades).toEqual([]);
  });
  it('invasões, antimicrobianos, infusões e ventilação', () => {
    expect(r.dispositivos.map((d) => [d.nome, d.data, d.sitio, d.origem])).toEqual([
      ['TOT', '2026-10-25', '', 'CC'], ['CVC', '2026-10-26', 'VJIE', ''], ['PAI', '', 'AFD', 'CC'], ['SNE/SNG', '', '', '']]);
    expect(r.atbs.map((a) => [a.nome, a.inicio])).toEqual([['Amoxicilina-clavulanato', '2026-10-26'], ['Claritromicina', '2026-10-27']]);
    expect(r.infusoes.map((i) => [i.drugId || i.nome, i.vazao])).toEqual([['fenta', '0,5'], ['RL', '21']]);
    expect(r.vent).toMatchObject({ modo: 'PSV', psup: '11', peep: '6', fio2: '30' });
  });
});
