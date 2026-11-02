import { describe, it, expect } from 'vitest';
import { toNum, fmtNum, fmtInt, fmtSigned, tiMedSafe, TEMPLATE_CHARS } from '../src/lib/format.js';
import { diasDesde, addDays, ddmm } from '../src/lib/dates.js';
import { computeDose, infusionLine } from '../src/lib/drugs.js';
import { ckdEpi2021, calcBH, diureseMlKgH } from '../src/lib/clinical.js';
import { deviceLine, statusDispositivo, dveLine } from '../src/lib/devices.js';
import { newPatient, migrateV1, normalizePatient } from '../src/lib/model.js';
import { novoDia } from '../src/lib/rollover.js';
import { buildEvolucao, buildPassagem } from '../src/lib/text.js';
import { deriveKeys, encryptDoc, decryptDoc } from '../src/lib/crypto.js';

const HOJE = '2026-10-27';

describe('números e texto', () => {
  it('entende vírgula, ponto decimal e milhar', () => {
    expect(toNum('37,8')).toBe(37.8);
    expect(toNum('7.4')).toBe(7.4);
    expect(toNum('2.100')).toBe(2100);
    expect(toNum('0.125')).toBe(0.125);
    expect(toNum('')).toBeNaN();
  });
  it('formata em pt-BR', () => {
    expect(fmtNum(0.1389)).toBe('0,14');
    expect(fmtNum(100)).toBe('100');
    expect(fmtNum(1.3889)).toBe('1,39');
    expect(fmtNum(10)).toBe('10');
    expect(fmtInt(2100)).toBe('2.100');
    expect(fmtSigned(640)).toBe('+640');
    expect(fmtSigned(-1200)).toBe('-1.200');
  });
  it('troca símbolos que viram "?" no TI MED', () => {
    expect(tiMedSafe('A · B — C FiO₂ 37°C ≥ 2 ⚠ ok')).toBe('A - B - C FiO2 37C >= 2 ok');
    expect(tiMedSafe('Acentuação ção ÚLTIMAS')).toBe('Acentuação ção ÚLTIMAS');
  });
});

describe('datas', () => {
  it('conta D0 como dia da inserção', () => {
    expect(diasDesde('2026-10-20', HOJE)).toBe(7);
    expect(diasDesde(HOJE, HOJE)).toBe(0);
    expect(addDays(HOJE, -5)).toBe('2026-10-22');
    expect(ddmm('2026-10-20')).toBe('20/10');
  });
  it('não erra na virada do horário de verão', () => {
    expect(diasDesde('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('doses pela vazão (mesmos casos do app anterior)', () => {
  it('noradrenalina 200 mcg/mL', () => {
    expect(computeDose(5, 200, 'mcg/mL', 'mcg/kg/min', 70).toFixed(3)).toBe('0.238');
  });
  it('cisatracúrio 2 mg/mL', () => {
    expect(computeDose(10, 2, 'mg/mL', 'mcg/kg/min', 80).toFixed(2)).toBe('4.17');
  });
  it('vasopressina 0,2 UI/mL', () => {
    expect(computeDose(3, 0.2, 'UI/mL', 'UI/min').toFixed(4)).toBe('0.0100');
  });
  it('fentanila e midazolam com as duas doses', () => {
    expect(computeDose(10, 50, 'mcg/mL', 'mcg/h', 70)).toBe(500);
    expect(computeDose(10, 50, 'mcg/mL', 'mcg/kg/h', 70).toFixed(2)).toBe('7.14');
    expect(computeDose(4, 5, 'mg/mL', 'mg/h', 70)).toBe(20);
    expect(computeDose(4, 5, 'mg/mL', 'mg/kg/h', 70).toFixed(3)).toBe('0.286');
  });
  it('sem peso, a dose por kg não aparece', () => {
    expect(computeDose(5, 200, 'mcg/mL', 'mcg/kg/min', '')).toBeNull();
  });
  it('linha no formato do CriticalEye', () => {
    expect(infusionLine({ drugId: 'nora', vazao: '3' }, '72')).toBe('Noradrenalina 3 ml/h (0,14 mcg/kg/min)');
    expect(infusionLine({ drugId: 'fenta', vazao: '2' }, '72')).toBe('Fentanila 2 ml/h (100 mcg/h - 1,39 mcg/kg/h)');
    expect(infusionLine({ drugId: '', outra: true, nome: 'NaCl 3%', vazao: '21' }, '72')).toBe('NaCl 3% 21 ml/h');
    expect(infusionLine({ drugId: 'nora', vazao: '3' }, '72', { nora: '400' })).toBe('Noradrenalina 3 ml/h (0,28 mcg/kg/min)');
  });
});

describe('cálculos clínicos', () => {
  it('CKD-EPI 2021 (referências publicadas)', () => {
    expect(ckdEpi2021('1.0', 60, 'M')).toEqual({ tfg: 86, classe: 'G2' });
    expect(ckdEpi2021('2,0', 70, 'M').tfg).toBe(35);
    expect(ckdEpi2021('0,6', 50, 'F').tfg).toBeGreaterThan(100);
    expect(ckdEpi2021('1.0', 60, '')).toBeNull();
  });
  it('balanço: vazio não entra, zero entra', () => {
    expect(calcBH({ entradas: '3200', drenos: '200', du: '2400', uf: '' })).toBe(600);
    expect(calcBH({ entradas: '3200', drenos: '200', du: '2400', uf: '1000' })).toBe(-400);
    expect(calcBH({ entradas: '3200', drenos: '200', du: '2400', uf: '0' })).toBe(600);
    expect(calcBH({ entradas: '', drenos: '', du: '', uf: '' })).toBeNull();
    expect(diureseMlKgH('2100', '72').toFixed(1)).toBe('1.2');
  });
});

describe('dispositivos', () => {
  it('linha "D7 (D0 20/10 - CC) CVC VJID" e alerta de dias', () => {
    expect(deviceLine({ nome: 'CVC', data: '2026-10-20', origem: 'CC', sitio: 'VJID' }, HOJE)).toBe('D7 (D0 20/10 - CC) CVC VJID');
    expect(deviceLine({ nome: 'TOT', data: '2026-10-15', origem: 'Emergência' }, HOJE)).toBe('D12 (D0 15/10 - Emergência) TOT - rever');
    expect(statusDispositivo({ nome: 'CVC', data: '2026-10-12' }, HOJE)).toEqual({ dias: 15, alerta: true });
    expect(statusDispositivo({ nome: 'CDL', data: '2026-10-01' }, HOJE).alerta).toBe(false);
  });
  it('drenos com montagem sem apóstrofo e DVE no neurológico', () => {
    expect(deviceLine({ nome: 'Dreno torácico', data: '2026-10-25', origem: 'CTI', sitios: ['Hemitórax D', 'Basal'], montagem: "Selo d'água", debito: '150', aspecto: 'serohemático' }, HOJE))
      .toBe('D2 (D0 25/10 - CTI) Dreno torácico Hemitórax D/Basal - selo de água - 150 ml/24 h - serohemático');
    expect(dveLine({ altura: '15', estado: 'aberta', debito: '180', aspecto: 'claro' })).toBe('DVE a 15 cmH2O - aberta - débito 180 ml/24 h - claro');
  });
});

function pacienteModelo() {
  const p = newPatient('2026-10-20');
  Object.assign(p, {
    idade: '58', sexo: 'M', peso: '72', internacao: '2026-10-18',
    diaRound: HOJE,
    diagnosticos: [
      { id: 'a', texto: 'HSA aneurismática (aneurisma de AComA), ictus', data: '2026-10-20', cirurgia: false },
      { id: 'b', texto: 'PO embolização de aneurisma de AComA', data: '2026-10-21', cirurgia: true },
    ],
    comorbidades: 'HAS\nTabagismo',
    medicacoes: 'Losartana 50 mg 12/12h - suspensa na admissão',
    alergias: 'Dipirona (urticária)',
    isolamento: 'Contato (MRSA)',
    dispositivos: [
      { id: 'd1', nome: 'TOT', data: '2026-10-20', origem: 'Emergência' },
      { id: 'd2', nome: 'CVC', data: '2026-10-20', origem: 'CC', sitio: 'VJID' },
      { id: 'd3', nome: 'DVE', data: '2026-10-20', origem: 'CC', altura: '15', estado: 'aberta', debito: '180', aspecto: 'xantocrômico', questionarRetirada: true },
    ],
    atbs: [
      { id: 'x1', nome: 'Cefepime', inicio: '2026-10-25', duracao: '7', foco: 'pulmonar', fim: '' },
      { id: 'x2', nome: 'Cefazolina', inicio: '2026-10-20', fim: '2026-10-21' },
    ],
    culturas: [{ id: 'c1', material: 'Secreção traqueal', data: '2026-10-25', resultado: 'Klebsiella pneumoniae, sensível a cefepime' }, { id: 'c2', material: 'Hemocultura', data: '2026-10-25', resultado: '' }],
    infusoes: [{ id: 'i1', drugId: 'nora', vazao: '3' }, { id: 'i2', drugId: 'fenta', vazao: '2' }],
    vent: { modo: 'PCV', pi: '14', peep: '8', fio2: '35', fr: '18', vc: '450' },
    neuro: { escala: 'RASS', valor: '-2', pupilas: 'isocóricas, fotorreagentes', picMin: '8', picMax: '14', obs: 'Nimodipino - dia 7 de 21' },
    vitais: { pa: '130/80', fc: '82', sat: '97', tax: '37,2' },
    h24: { taxMax: '37,8', taxPicos: '1 pico', pasMin: '118', pasMax: '152', padMin: '60', padMax: '88', fcMin: '72', fcMax: '98', gliMin: '132', gliMax: '178', insulina: '6 UI', entradas: '3000', drenos: '80', du: '2100', uf: '' },
    bhAcumulado: 2210,
    labs: { data: '2026-10-27', hb: '9,4', leuc: '12.800', cr: '0,79', na: '147' },
    labsAnt: { data: '2026-10-26', hb: '9,8', leuc: '14.200', cr: '0,82', na: '144' },
    gaso: { data: '2026-10-27', ph: '7,44', pco2: '35', pf: '297', lac: '1,1' },
    gasoAnt: { data: '2026-10-26', ph: '7,41', pco2: '38', pf: '263', lac: '1,4' },
    exames: [{ id: 'e1', exame: 'TC de crânio', data: '2026-10-25', resultado: 'sem novo sangramento, sem hidrocefalia' }],
    profilaxias: { tev: 'Mecânica', tevObs: '', lamg: 'Omeprazol', lamgObs: '40 mg/dia' },
    nutricao: { via: 'Enteral', vazao: '50', meta: '100', obs: '' },
    evacuacao: '2026-10-26',
    pele: 'Sem lesão por pressão - Braden 12',
    plano: 'Neuro: PAS < 160 e PPC > 60\nInfecção: cefepime D2 de 7',
    pendencias: [{ id: 'p1', texto: 'Angio-TC de crânio de controle', feita: false }, { id: 'p2', texto: 'feita ontem', feita: true }],
    check: { inv: 'ok', prof: 'pend', analg: 'ok', atb: 'ok', lab: 'ok', rx: 'na' },
    checkNote: { inv: '', prof: 'iniciar enoxaparina após TC', analg: '', atb: '', lab: '', rx: '' },
  });
  return normalizePatient(p, HOJE);
}

describe('evolução padrão (modelo do CriticalEye)', () => {
  const ctx = { hoje: HOJE, unidade: 'CTI 1 Neurológico', leito: '04', drugConc: {} };
  const txt = buildEvolucao(pacienteModelo(), ctx);

  it('tem as seções na ordem do modelo', () => {
    const order = ['DIAGNÓSTICOS:', 'COMORBIDADES:', 'MEDICAÇÕES DE USO CONTÍNUO:', 'ALERGIAS:', 'ISOLAMENTO:', 'DISPOSITIVOS:', 'ANTIMICROBIANOS:', 'CULTURAS:', 'INFUSÕES:', 'VENTILAÇÃO:', 'NEUROLÓGICO:', 'ÚLTIMAS 24 H:', 'LABORATÓRIO (26/10 > 27/10):', 'GASOMETRIA (26/10 > 27/10):', 'IMAGEM E OUTROS EXAMES:', 'PROFILAXIAS:', 'NUTRIÇÃO E TGI:', 'PELE:', 'EXAME FÍSICO:', 'PLANO:', 'PENDÊNCIAS:'];
    let last = -1;
    for (const h of order) {
      const i = txt.indexOf(h);
      expect(i, h).toBeGreaterThan(last);
      last = i;
    }
  });

  it('linhas no formato combinado', () => {
    for (const l of [
      'EVOLUÇÃO MÉDICA - CTI 1 NEUROLÓGICO - LEITO 04 - 27/10/2026',
      '58 anos - masculino - 72 kg',
      'D9 de internação hospitalar (18/10)',
      'D7 de CTI (admissão em 20/10)',
      '2. PO embolização de aneurisma de AComA (21/10) - PO D6',
      'D7 (D0 20/10 - Emergência) TOT',
      'D7 (D0 20/10 - CC) CVC VJID',
      'D2 (D0 25/10) Cefepime - foco pulmonar - previsto 7 dias',
      'Prévio: Cefazolina (20/10 a 21/10)',
      'Secreção traqueal 25/10: Klebsiella pneumoniae, sensível a cefepime',
      'Hemocultura 25/10: pendente',
      'Noradrenalina 3 ml/h (0,14 mcg/kg/min)',
      'Fentanila 2 ml/h (100 mcg/h - 1,39 mcg/kg/h)',
      'D7 (D0 20/10) TOT + VM',
      'PCV / Pinsp 14 / PEEP 8 / FiO2 35% / FR 18 / VC 450 ml',
      'RASS -2',
      'PIC 8-14 mmHg',
      'DVE a 15 cmH2O - aberta - débito 180 ml/24 h - xantocrômico',
      'Tax máx 37,8 (1 pico)',
      'PAS 118-152 / PAD 60-88',
      'Glicemia 132-178 (6 UI)',
      'Diurese 2.100 ml (1,2 ml/kg/h)',
      'BH +640 ml / acumulado +2.850 ml',
      'Hb 9,8 > 9,4',
      'Leuc 14.200 > 12.800',
      'TFG (CKD-EPI 2021) 102 > 103',
      'pH 7,41 > 7,44',
      'P/F 263 > 297',
      'TC de crânio 25/10: sem novo sangramento, sem hidrocefalia',
      'TEV: Mecânica',
      'LAMG: Omeprazol - 40 mg/dia',
      'Enteral 50 ml/h - 100% da meta',
      'Última evacuação: 26/10',
      'PA 130/80 mmHg - FC 82 bpm - SatO2 97% - Tax 37,2',
      'Angio-TC de crânio de controle',
      'Profilaxias: iniciar enoxaparina após TC',
      'Questionar retirada da DVE',
    ]) expect(txt.split('\n'), l).toContain(l);
  });

  it('pendência feita não entra e não tem nome do paciente', () => {
    expect(txt).not.toContain('feita ontem');
  });

  it('só caracteres aceitos pelo TI MED', () => {
    // O texto do próprio app usa só o conjunto combinado; o que o médico digita passa pelo filtro.
    expect(TEMPLATE_CHARS.test(txt)).toBe(true);
    expect(/[·—–₂°⚠⚑]/.test(txt)).toBe(false);
  });

  it('passagem de plantão sem símbolos e com "sem registro"', () => {
    const vazio = normalizePatient({ ...newPatient(HOJE), admissao: '' }, HOJE);
    const t = buildPassagem([{ leito: '04', patient: pacienteModelo() }, { leito: '05', patient: vazio }, { leito: '06', patient: null }], { ...ctx, now: new Date(2026, 9, 27, 19, 5) });
    expect(t.startsWith('PASSAGEM DE PLANTÃO - CTI 1 NEUROLÓGICO - 27/10/2026 19:05')).toBe(true);
    expect(t).toContain('LEITO 05');
    expect(t).toContain('Ventilação: sem registro');
    expect(t).not.toContain('LEITO 06');
    expect(/[·—–₂°⚠⚑]/.test(t)).toBe(false);
  });
});

describe('round diário', () => {
  it('copia o que continua, zera o que é do dia', () => {
    const p = pacienteModelo();
    const n = novoDia(p, '2026-10-28');
    expect(n.diaRound).toBe('2026-10-28');
    expect(n.bhAcumulado).toBe(2210 + 640);
    expect(n.h24.entradas).toBe('');
    expect(n.vitais.pa).toBe('');
    expect(n.labsAnt.hb).toBe('9,4');
    expect(n.labs.hb).toBe('');
    expect(n.gasoAnt.ph).toBe('7,44');
    expect(n.check.inv).toBe('');
    expect(n.plano).toBe('');
    expect(n.planoOntem).toContain('PAS < 160');
    expect(n.pendencias.map((x) => x.texto)).toEqual(['Angio-TC de crânio de controle']);
    expect(n.dispositivos.length).toBe(3);
    expect(n.dispositivos[2].debito).toBe('');
    expect(n.conferir).toEqual({ neuro: true, infusoes: true, vent: true });
    const txt = buildEvolucao(n, { hoje: '2026-10-28', unidade: 'CTI', leito: '04', drugConc: {} });
    expect(txt).toContain('D8 (D0 20/10 - CC) CVC VJID');
    expect(txt).toContain('D3 (D0 25/10) Cefepime');
    expect(txt).toContain('Hb 9,4 (anterior)');
  });
  it('não mexe no mesmo dia', () => {
    const p = pacienteModelo();
    expect(novoDia(p, HOJE)).toEqual(p);
  });
});

describe('migração do app anterior', () => {
  it('converte os leitos do v1', () => {
    const v1 = [
      { num: 1, occupied: false },
      {
        num: 2, occupied: true, peso: '70', idade: '58', sexo: 'M', creat: '1.4', diagnostico: 'HSA Fisher 4',
        neuroEscala: 'RASS', neuroValor: '-3', modo: 'Máscara/Cateter O₂', fluxo: '3',
        infusoes: [{ nome: 'Noradrenalina', vazao: '6' }, { nome: 'NaCl 3%', vazao: '21' }],
        invasoes: [{ nome: 'CVC', data: '2026-10-20', sitio: 'VJID' }],
        atbs: [{ nome: 'Meropenem', dia: '5', total: '14' }],
        h24: { tax: '38,0', taxObs: '3X', entradas: '3000', drenos: '150', du: '2200', uf: '', gliObs: '20UI', evac: '20/10' },
        gaso: { ph: '7,40' }, pend: 'Repetir TC\nLigar família',
        check: { inv: 'ok' }, checkNote: {},
      },
    ];
    const st = migrateV1(v1, HOJE);
    expect(st.settings.leitos.map((l) => l.label)).toEqual(['01', '02']);
    expect(st.beds.b1.patient).toBeNull();
    const p = st.beds.b2.patient;
    expect(p.diagnosticos[0].texto).toBe('HSA Fisher 4');
    expect(p.vent.modo).toBe('Máscara/cateter O2');
    expect(p.infusoes[0].drugId).toBe('nora');
    expect(p.infusoes[1]).toMatchObject({ drugId: '', outra: true, nome: 'NaCl 3%' });
    expect(p.atbs[0]).toMatchObject({ nome: 'Meropenem', inicio: '2026-10-22', duracao: '14' });
    expect(p.labs.cr).toBe('1.4');
    expect(p.h24.taxPicos).toBe('3X');
    expect(p.pendencias.map((x) => x.texto)).toEqual(['Repetir TC', 'Ligar família']);
  });
});

describe('criptografia de ponta a ponta', () => {
  it('cifra, decifra e recusa troca de documento', async () => {
    const { encKey, authSecret } = await deriveKeys('Teste@Exemplo.com', 'uma frase longa', 1000);
    expect(authSecret).toMatch(/^[0-9a-f]{64}$/);
    const again = await deriveKeys('teste@exemplo.com', 'uma frase longa', 1000);
    expect(again.authSecret).toBe(authSecret);
    const other = await deriveKeys('teste@exemplo.com', 'outra senha', 1000);
    expect(other.authSecret).not.toBe(authSecret);
    const doc = { idade: '58', dx: 'HSA' };
    const c = await encryptDoc(encKey, 'bed:b4', doc);
    expect(c).not.toContain('HSA');
    expect(await decryptDoc(encKey, 'bed:b4', c)).toEqual(doc);
    await expect(decryptDoc(encKey, 'bed:b5', c)).rejects.toBeTruthy();
    await expect(decryptDoc(other.encKey, 'bed:b4', c)).rejects.toBeTruthy();
  });
});

import { normalizeState as _norm } from '../src/lib/storage.js';
describe('configuração CTI 1 - Posto 2', () => {
  it('padrão antigo (CTI, 01 a 10) vira leitos 06 a 15 sem perder paciente', () => {
    const leitos = Array.from({ length: 10 }, (_, i) => ({ id: `b${i + 1}`, label: String(i + 1).padStart(2, '0') }));
    const s = _norm({ settings: { unidade: 'CTI', leitos }, beds: { b1: { patient: { plano: 'x' }, updatedAt: 1 } } });
    expect(s.settings.unidade).toBe('CTI 1 - Posto 2');
    expect(s.settings.leitos.map((l) => l.label)).toEqual(['06', '07', '08', '09', '10', '11', '12', '13', '14', '15']);
    expect(s.beds.b1.patient.plano).toBe('x');
  });
  it('configuração editada pelo usuário fica como está', () => {
    const s = _norm({ settings: { unidade: 'CTI 2', leitos: [{ id: 'b1', label: '01' }] }, beds: {} });
    expect(s.settings.unidade).toBe('CTI 2');
  });
});

import { calcBH as _bh, drenosTotal as _dt } from '../src/lib/clinical.js';
import { h24Lines as _h24 } from '../src/lib/text.js';
import { novoDia as _novo } from '../src/lib/rollover.js';
import { newPatient as _np } from '../src/lib/model.js';
describe('balanço com débito de cada dreno', () => {
  const dev = (nome, debito, extra = {}) => ({ id: nome, nome, data: '2026-11-01', sitio: '', sitios: [], debito, ...extra });
  const devs = [dev('DVE', '120'), dev('Hemovac', '330', { sitio: 'Flanco D' }), dev('SNG em sifonagem', '200'), dev('Ostomia', '400'), dev('SVD', '999'), dev('Dreno torácico', '')];
  it('soma só os dispositivos que contam, vazio não entra', () => {
    const dr = _dt({ drenos: '' }, devs);
    expect(dr.total).toBe(650);
    expect(dr.itens.map((x) => x.nome)).toEqual(['DVE', 'Hemovac Flanco D', 'SNG em sifonagem']);
    expect(_bh({ entradas: '2.500', du: '1.200', drenos: '50', uf: '' }, devs)).toBe(2500 - 700 - 1200);
  });
  it('dispositivo pode ser ligado ou desligado à mão', () => {
    const d2 = [dev('Dreno pigtail', '80', { balanco: true }), dev('DVE', '100', { balanco: false })];
    expect(_dt({}, d2).total).toBe(80);
  });
  it('aparece na evolução e zera no round seguinte', () => {
    const p = _np('2026-11-01');
    p.dispositivos = devs;
    p.h24.entradas = '2000';
    expect(_h24(p).join('\n')).toContain('Drenos 650 ml (DVE 120 / Hemovac Flanco D 330 / SNG em sifonagem 200)');
    const n = _novo(p, '2026-11-02');
    expect(n.bhAcumulado).toBe(1350);
    expect(n.dispositivos.every((d) => d.debito === '')).toBe(true);
  });
});

import { CATALOG as _CAT, contaNoBH as _conta, deviceLine as _dl } from '../src/lib/devices.js';
describe('Hemovac neurológico', () => {
  it('está nos dispositivos neuro, entra no balanço e mostra o sítio', () => {
    expect(_CAT.find((g) => g.cat === 'Neuro').items).toContain('Hemovac (neuro)');
    const d = { nome: 'Hemovac (neuro)', data: '2026-11-01', sitio: 'Subgaleal D', sitios: [], debito: '80' };
    expect(_conta(d)).toBe(true);
    expect(_dl(d, '2026-11-02')).toBe('D1 (D0 01/11) Hemovac (neuro) Subgaleal D - 80 ml/24 h');
  });
});
