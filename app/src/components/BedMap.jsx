import React from 'react';
import { ddmm } from '../lib/dates.js';
import { has } from '../lib/format.js';
import { statusDispositivo, isDVE } from '../lib/devices.js';
import { diasCTI, diasInternacao } from '../lib/text.js';
import { CHECK_DEFS } from '../lib/model.js';
import { Icon } from './ui.jsx';

const DVA = ['nora', 'vaso', 'dobuta', 'dopa'];

export function bedFacts(p, hoje) {
  const devs = p.dispositivos;
  const overLimit = devs.filter((d) => { const s = statusDispositivo(d, hoje); return s && s.alerta; });
  const vals = CHECK_DEFS.map((c) => p.check[c.k]);
  const pend = vals.filter((v) => v === 'pend').length;
  const done = vals.every(Boolean);
  const pendencias = p.pendencias.filter((x) => !x.feita).length + pend +
    (devs.some((d) => isDVE(d.nome) && d.questionarRetirada) ? 1 : 0);
  return {
    dc: diasCTI(p, hoje),
    di: diasInternacao(p, hoje),
    dx: (p.diagnosticos.find((d) => has(d.texto)) || {}).texto || '',
    alergia: has(p.alergias),
    isolamento: has(p.isolamento),
    vm: ['VCV', 'PCV', 'PSV'].includes(p.vent.modo),
    vni: p.vent.modo === 'VNI',
    dva: p.infusoes.some((i) => DVA.includes(i.drugId)),
    dve: devs.some((d) => isDVE(d.nome)),
    overLimit,
    pendChecks: pend,
    rondaFeita: done && pend === 0,
    pendencias,
    stale: p.diaRound !== hoje,
  };
}

export default function BedMap({ state, hoje, onOpen, onAdmit, onRollover, onPassagem, staleCount, roundDates, localOnly, onSetupSync }) {
  const leitos = state.settings.leitos;
  const occ = leitos.filter((l) => state.beds[l.id] && state.beds[l.id].patient);
  const facts = Object.fromEntries(occ.map((l) => [l.id, bedFacts(state.beds[l.id].patient, hoje)]));
  const nOver = occ.reduce((s, l) => s + facts[l.id].overLimit.length, 0);
  const nPend = occ.reduce((s, l) => s + facts[l.id].pendencias, 0);
  const nRonda = occ.filter((l) => facts[l.id].rondaFeita).length;

  return (
    <div className="wrap">
      {localOnly && (
        <div className="banner">
          <span className="grow">Os dados estão só neste aparelho. Ative a sincronização para ver no PC do plantão o que você lançou no celular.</span>
          <button className="btn sm primary" onClick={onSetupSync}><Icon name="cloud" /> Ativar sincronização</button>
        </div>
      )}
      {staleCount > 0 && (
        <div className="banner amber">
          <span className="grow">
            <b>{staleCount} {staleCount === 1 ? 'leito ainda está' : 'leitos ainda estão'} no round de {roundDates}.</b>{' '}
            Ao iniciar o de hoje: dispositivos e ATB seguem contando, laboratório e gaso viram "anterior", 24 h, sinais, checklist e plano recomeçam.
          </span>
          <button className="btn sm navy" onClick={onRollover}>Iniciar round de hoje</button>
        </div>
      )}

      <div className="stats">
        <div className="stat"><b>{occ.length}</b><span>leitos ocupados</span></div>
        <div className="stat"><b>{leitos.length - occ.length}</b><span>{leitos.length - occ.length === 1 ? 'leito vago' : 'leitos vagos'}</span></div>
        <div className="stat"><b>{nRonda}/{occ.length}</b><span>com a ronda completa</span></div>
        <div className={'stat' + (nOver ? ' amber' : '')}><b>{nOver}</b><span>dispositivos acima do limite</span></div>
        <div className="stat"><b>{nPend}</b><span>pendências abertas</span></div>
      </div>

      <div className="bedgrid">
        {leitos.map((l) => {
          const bed = state.beds[l.id];
          const p = bed && bed.patient;
          if (!p) {
            return (
              <button key={l.id} className="bedcard vago" onClick={() => onAdmit(l.id)}>
                <div className="top"><span className="lt">LEITO {l.label}</span></div>
                <div className="dx">Vago</div>
                <div className="sub">+ Admitir</div>
              </button>
            );
          }
          const f = facts[l.id];
          return (
            <button key={l.id} className={'bedcard' + (f.stale ? ' stale' : '')} onClick={() => onOpen(l.id)}>
              <div className="top">
                <span className="lt">LEITO {l.label}</span>
                {f.dc !== null && <span className="chip blue">D{f.dc}</span>}
              </div>
              <div className="dx">{f.dx || 'Sem diagnóstico'}</div>
              <div className="sub">{[has(p.idade) && `${p.idade} anos`, p.sexo, has(p.peso) && `${p.peso} kg`].filter(Boolean).join(' - ')}</div>
              <div className="chips">
                {f.alergia && <span className="chip red">Alergia</span>}
                {f.isolamento && <span className="chip amber">Isolamento</span>}
                {f.vm && <span className="chip">VM</span>}
                {f.vni && <span className="chip">VNI</span>}
                {f.dva && <span className="chip">DVA</span>}
                {f.dve && <span className="chip">DVE</span>}
              </div>
              <div className="foot">
                {f.overLimit.length > 0 && <span className="warn">{f.overLimit.map((d) => d.nome).join(', ')} acima do limite</span>}
                {f.stale ? <span className="warn">Round de {ddmm(p.diaRound)}: iniciar o de hoje</span>
                  : f.rondaFeita ? <span>Ronda completa</span>
                  : f.pendChecks ? <span className="warn">{f.pendChecks} {f.pendChecks === 1 ? 'item' : 'itens'} da ronda com pendência</span>
                  : <span>Ronda em aberto</span>}
                <span>{f.pendencias ? `${f.pendencias} ${f.pendencias === 1 ? 'pendência' : 'pendências'}` : 'Sem pendências'}</span>
              </div>
            </button>
          );
        })}
      </div>

      {occ.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn primary block" onClick={onPassagem}><Icon name="clip" /> Passagem de plantão (copiar texto)</button>
        </div>
      )}
    </div>
  );
}
