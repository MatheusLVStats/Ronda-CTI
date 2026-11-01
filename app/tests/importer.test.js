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
