import { describe, it, expect } from 'vitest';
import { fichaLeito, folhas } from '../src/lib/print.js';
import { newPatient } from '../src/lib/model.js';

const HOJE = '2026-11-02';
describe('round impresso', () => {
  it('leito vazio: só checklist, plano, pendências e anotações', () => {
    const f = fichaLeito(newPatient(HOJE), { hoje: HOJE, leito: '02', drugConc: {} });
    expect(f.secoes.map((s) => s.t)).toEqual(['Checklist da ronda', 'Plano', 'Pendências', 'Anotações do plantão']);
  });
  it('mostra o que foi preenchido e os alertas', () => {
    const p = newPatient(HOJE);
    p.alergias = 'dipirona';
    p.dispositivos = [{ id: 'a', nome: 'TOT', data: '2026-10-20', sitio: '', origem: '' }];
    p.plano = 'Desmame de sedação';
    const f = fichaLeito(p, { hoje: HOJE, leito: '01', drugConc: {} });
    expect(f.alergias).toEqual(['dipirona']);
    const disp = f.secoes.find((s) => s.t === 'Dispositivos');
    expect(disp.items[0]).toMatch(/D13 .*TOT - rever/);
    expect(disp.alerta(disp.items[0])).toBe(true);
    expect(f.secoes.find((s) => s.t === 'Plano').items).toEqual(['Desmame de sedação']);
  });
  it('conta folhas', () => {
    expect(folhas(9, 1)).toBe(9);
    expect(folhas(9, 2)).toBe(5);
  });
});
