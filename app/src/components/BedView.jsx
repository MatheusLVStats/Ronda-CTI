import React, { useState } from 'react';
import { ddmm, todayISO, diasDesde } from '../lib/dates.js';
import { has, show, fmtNum, fmtSigned, lines } from '../lib/format.js';
import { ckdEpi2021, calcBH, diureseMlKgH } from '../lib/clinical.js';
import { DRUGS, infusionDoses } from '../lib/drugs.js';
import {
  CATALOG, ORIGENS, SITE_OPTS, ABD_REGIOES, ABD_CIRURGICAS, TORAX_SITIOS, SITE_AMPLO, MONTAGENS,
  catOf, isDVE, isThorax, isAbdDrain, isOstomia, isSngSifon, isOutro, statusDispositivo, isViaAereaInvasiva,
} from '../lib/devices.js';
import { CHECK_DEFS, MODOS, ventFields, VENT_LABELS, LAB_KEYS, GASO_KEYS, uid } from '../lib/model.js';
import { ventLines, neuroLines, labLines, gasoLines, atbLines, exameLines, profilaxiaLines, nutricaoLines, vitaisLine, diagLines } from '../lib/text.js';
import { Section, Field, Area, Seg, Modal, Icon } from './ui.jsx';
import { bedFacts } from './BedMap.jsx';

const ABERTAS = ['ronda', 'disp', 'inf', 'atb', 'plano'];
const abertasPara = (p) => [...ABERTAS, ...(!p.idade && !p.peso ? ['ident'] : []), ...(!p.diagnosticos.some((d) => d.texto) ? ['diag'] : [])];
const TODAS = ['ronda', 'ident', 'diag', 'alertas', 'disp', 'inf', 'vent', 'neuro', 'atb', 'prof', 'vitais', 'h24', 'lab', 'gaso', 'exames', 'nutri', 'pele', 'plano'];
const TEV = ['Enoxaparina', 'HNF', 'Mecânica', 'Contraindicada', 'Não indicada'];
const LAMG = ['Omeprazol', 'Pantoprazol', 'Não indicada'];
const VIAS = ['Enteral', 'Parenteral', 'Oral', 'Zero'];
const MATERIAIS = ['Hemocultura', 'Urocultura', 'Secreção traqueal', 'Líquor', 'Ponta de cateter', 'Swab de vigilância', 'Escarro', 'Ferida operatória'];
const sexoTxt = { M: 'masculino', F: 'feminino' };

function Conferir({ on, onDone }) {
  if (!on) return null;
  return (
    <span className="conferir" onClick={(e) => e.stopPropagation()}>
      <span className="chip amber">Copiado de ontem</span>
      <button className="btn sm" onClick={onDone}><Icon name="check" /> Conferido</button>
    </span>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="check-line" style={{ margin: '2px 0 8px', fontWeight: 500, color: 'var(--ink-2)' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function MultiSeg({ options, values, onChange }) {
  const set = new Set(values || []);
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o} type="button" className={set.has(o) ? 'on' : ''}
          onClick={() => { const n = new Set(set); n.has(o) ? n.delete(o) : n.add(o); onChange([...n]); }}>
          {o}
        </button>
      ))}
    </div>
  );
}

function DeviceItem({ d, hoje, onChange, onDelete }) {
  const st = statusDispositivo(d, hoje);
  const set = (patch) => onChange({ ...d, ...patch });
  return (
    <div className={'item' + (st && st.alerta ? ' alert-item' : '')}>
      <div className="item-h">
        <span className="nm">{d.nome}</span>
        <span className="chip blue">{catOf(d.nome)}</span>
        {st && <span className={'daybadge' + (st.alerta ? ' alert' : '')}>D{st.dias}{st.alerta ? ' - rever' : ''}</span>}
        <button className="icon-btn del" aria-label={`Remover ${d.nome}`} onClick={onDelete}><Icon name="x" /></button>
      </div>
      <div className="row c2">
        <Field label="Inserção (D0)" type="date" value={d.data} onChange={(v) => set({ data: v })} />
        <div>
          <label>Local da inserção</label>
          <select value={d.origem || ''} onChange={(e) => set({ origem: e.target.value })}>
            <option value="">-</option>
            {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      {SITE_OPTS[d.nome] && (<div className="row"><div><label>Sítio</label><Seg options={SITE_OPTS[d.nome]} value={d.sitio} onChange={(v) => set({ sitio: v })} /></div></div>)}
      {(isAbdDrain(d.nome) || isOstomia(d.nome)) && (
        <div className="row"><div>
          <label>{isOstomia(d.nome) ? 'Localização' : 'Região abdominal'}</label>
          <Seg options={ABD_REGIOES} value={d.sitio} onChange={(v) => set({ sitio: v })} />
          {isAbdDrain(d.nome) && <div style={{ marginTop: 6 }}><Seg options={ABD_CIRURGICAS} value={d.sitio} onChange={(v) => set({ sitio: v })} /></div>}
        </div></div>
      )}
      {isThorax(d.nome) && (<div className="row"><div><label>Sítio torácico</label><MultiSeg options={TORAX_SITIOS} values={d.sitios} onChange={(v) => set({ sitios: v })} /></div></div>)}
      {isOutro(d.nome) && (<div className="row"><div><label>Localização (tórax a abdome)</label><Seg options={SITE_AMPLO} value={d.sitio} onChange={(v) => set({ sitio: v })} /></div></div>)}
      {(isAbdDrain(d.nome) || isThorax(d.nome)) && (<div className="row"><div><label>Montagem</label><Seg options={MONTAGENS} value={d.montagem} onChange={(v) => set({ montagem: v })} /></div></div>)}
      {isDVE(d.nome) && (
        <div className="row c2">
          <Field label="Altura da coluna (cmH2O)" num value={d.altura} onChange={(v) => set({ altura: v })} />
          <div><label>Estado</label><Seg options={['aberta', 'fechada']} value={d.estado} onChange={(v) => set({ estado: v })} /></div>
        </div>
      )}
      {(isAbdDrain(d.nome) || isThorax(d.nome) || isDVE(d.nome) || isSngSifon(d.nome)) && (
        <div className="row c2">
          <Field label={isSngSifon(d.nome) ? 'Resíduo 24 h (ml)' : 'Débito 24 h (ml)'} num value={d.debito} onChange={(v) => set({ debito: v })}
            hint={isDVE(d.nome) ? 'Referência de desmame: < 250 ml/24 h (protocolo institucional publicado, não regra universal)' : undefined} />
          <Field label="Aspecto" value={d.aspecto} onChange={(v) => set({ aspecto: v })} placeholder={isDVE(d.nome) ? 'ex.: liquórico claro' : 'ex.: serossanguinolento'} />
        </div>
      )}
      {isOstomia(d.nome) && <Field label="Aspecto" value={d.aspecto} onChange={(v) => set({ aspecto: v })} placeholder="ex.: fezes pastosas" />}
      {isDVE(d.nome) && <Toggle label="Questionar retirada da DVE (vai para as pendências)" checked={d.questionarRetirada} onChange={(v) => set({ questionarRetirada: v })} />}
    </div>
  );
}

function AddDevice({ onAdd, onClose }) {
  const [outro, setOutro] = useState('');
  return (
    <Modal title="Adicionar dispositivo" onClose={onClose}>
      {CATALOG.map((g) => (
        <div className="catg" key={g.cat}>
          <div className="lbl">{g.cat}</div>
          <div className="seg">{g.items.map((it) => <button key={it} onClick={() => onAdd(it)}>{it}</button>)}</div>
        </div>
      ))}
      <div className="lbl" style={{ marginTop: 6 }}>Outro dispositivo</div>
      <div className="flex">
        <input value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="Nome" />
        <button className="btn primary" onClick={() => outro.trim() && onAdd(outro.trim())}>Adicionar</button>
      </div>
    </Modal>
  );
}

function SaidaModal({ leito, onConfirm, onClose }) {
  const [tipo, setTipo] = useState('Alta');
  return (
    <Modal title={`Saída do CTI - leito ${leito}`} onClose={onClose}>
      <p style={{ marginTop: 0 }}>Os dados deste paciente são apagados do aparelho e da nuvem. O leito fica vago para a próxima admissão.</p>
      <Seg options={['Alta', 'Transferência', 'Óbito']} value={tipo} onChange={(v) => setTipo(v || tipo)} />
      <div className="flex" style={{ marginTop: 14 }}>
        <button className="btn danger grow" onClick={() => onConfirm(tipo)}>Registrar saída e liberar o leito</button>
        <button className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

export default function BedView({ leito, patient: p, hoje, drugConc, onChange, onSaida, onEvolucao, onRollover, tabs }) {
  const [open, setOpen] = useState(() => new Set(abertasPara(p)));
  const [completa, setCompleta] = useState(false);
  const [addDev, setAddDev] = useState(false);
  const [saida, setSaida] = useState(false);
  const [novaPend, setNovaPend] = useState('');

  const upd = (fn) => onChange((cur) => fn(cur));
  const setP = (patch) => upd((c) => ({ ...c, ...patch }));
  const setIn = (key, patch, conferirKey) => upd((c) => ({ ...c, [key]: { ...c[key], ...patch }, ...(conferirKey ? { conferir: { ...c.conferir, [conferirKey]: false } } : {}) }));
  const listSet = (key, id, patch, conferirKey) => upd((c) => ({ ...c, [key]: c[key].map((x) => (x.id === id ? { ...x, ...patch } : x)), ...(conferirKey ? { conferir: { ...c.conferir, [conferirKey]: false } } : {}) }));
  const listAdd = (key, item, conferirKey) => upd((c) => ({ ...c, [key]: [...c[key], { id: uid(), ...item }], ...(conferirKey ? { conferir: { ...c.conferir, [conferirKey]: false } } : {}) }));
  const listDel = (key, id) => upd((c) => ({ ...c, [key]: c[key].filter((x) => x.id !== id) }));
  const conferido = (k) => upd((c) => ({ ...c, conferir: { ...c.conferir, [k]: false } }));

  const isOpen = (k) => completa || open.has(k);
  const toggle = (k) => {
    if (completa) { setCompleta(false); setOpen(new Set(TODAS.filter((x) => x !== k))); return; }
    const n = new Set(open); n.has(k) ? n.delete(k) : n.add(k); setOpen(n);
  };

  const f = bedFacts(p, hoje);
  const tfg = ckdEpi2021(p.labs.cr, p.idade, p.sexo);
  const bh = calcBH(p.h24);
  const via = p.dispositivos.find((d) => isViaAereaInvasiva(d.nome));
  const conf = p.conferir || {};
  const stale = p.diaRound !== hoje;

  return (
    <div>
      {tabs}
      <div className="wrap">
        {stale && (
          <div className="banner amber">
            <span className="grow">Este leito está no round de {ddmm(p.diaRound)}. Os sinais, a 24 h e o checklist abaixo são de lá.</span>
            <button className="btn sm navy" onClick={onRollover}>Iniciar round de hoje</button>
          </div>
        )}

        <div className="bedhead">
          <div className="bedno"><small>LEITO</small><b>{leito}</b></div>
          <div className="who">
            <div className="l1">{f.dx || 'Sem diagnóstico'}</div>
            <div className="l2">{[has(p.idade) && `${p.idade} anos`, sexoTxt[p.sexo], has(p.peso) && `${p.peso} kg`, f.di !== null && `D${f.di} de internação`, f.dc !== null && `D${f.dc} no CTI`].filter(Boolean).join(' - ') || 'Preencha a identificação'}</div>
          </div>
          <div className="acts">
            <div className="seg">
              <button className={!completa ? 'on' : ''} onClick={() => { setCompleta(false); setOpen(new Set(abertasPara(p))); }}>Resumida</button>
              <button className={completa ? 'on' : ''} onClick={() => setCompleta(true)}>Completa</button>
            </div>
            <button className="btn primary" onClick={onEvolucao}><Icon name="copy" /> Copiar evolução</button>
            <button className="btn danger" onClick={() => setSaida(true)}><Icon name="exit" /> Saída do CTI</button>
          </div>
          {(f.alergia || f.isolamento || f.overLimit.length > 0 || conf.infusoes || conf.vent || conf.neuro || p.dispositivos.some((d) => isDVE(d.nome) && d.questionarRetirada)) && (
            <div className="alerts">
              {f.alergia && <div className="abox red"><b>ALERGIA</b>{lines(p.alergias).join('; ')}</div>}
              {f.isolamento && <div className="abox amber"><b>ISOLAMENTO</b>{lines(p.isolamento).join('; ')}</div>}
              {f.overLimit.length > 0 && <div className="abox amber"><b>REVER DISPOSITIVO</b>{f.overLimit.map((d) => `${d.nome} D${statusDispositivo(d, hoje).dias}`).join('; ')}</div>}
              {p.dispositivos.some((d) => isDVE(d.nome) && d.questionarRetirada) && <div className="abox amber"><b>DVE</b>Questionar retirada</div>}
              {(conf.infusoes || conf.vent || conf.neuro) && <div className="abox amber"><b>CONFERIR (COPIADO DE ONTEM)</b>{[conf.infusoes && 'infusões', conf.vent && 'ventilação', conf.neuro && 'neurológico'].filter(Boolean).join(', ')}</div>}
            </div>
          )}
        </div>

        <div className="sections">
          {/* 1. Checklist da ronda */}
          <Section title="Checklist da ronda" open={isOpen('ronda')} onToggle={() => toggle('ronda')}
            summary={`${CHECK_DEFS.filter((c) => p.check[c.k]).length}/6 itens vistos`}>
            {CHECK_DEFS.map((c) => (
              <div className="checkrow" key={c.k}>
                <span className="n">{c.n}</span>
                <div>
                  <div className="t">{c.t}</div>
                  <Seg options={[{ v: 'ok', l: 'OK' }, { v: 'pend', l: 'Pendência' }, { v: 'na', l: 'N/A' }]} value={p.check[c.k]}
                    cls={{ ok: 'on-ok', pend: 'on-pend', na: 'on-na' }}
                    onChange={(v) => setIn('check', { [c.k]: v })} />
                  {(p.check[c.k] === 'pend' || has(p.checkNote[c.k])) && (
                    <div style={{ marginTop: 6 }}>
                      <input value={p.checkNote[c.k]} placeholder="O que falta (vai para as pendências)" onChange={(e) => setIn('checkNote', { [c.k]: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Section>

          {/* 2. Identificação */}
          <Section title="Identificação" open={isOpen('ident')} onToggle={() => toggle('ident')}
            summary={[has(p.idade) && `${p.idade} anos`, sexoTxt[p.sexo], has(p.peso) && `${p.peso} kg`, has(p.internacao) && `internação ${ddmm(p.internacao)}`, has(p.admissao) && `CTI ${ddmm(p.admissao)}`].filter(Boolean).join(' - ')}>
            <div className="row c2">
              <Field label="Internação hospitalar" type="date" value={p.internacao} onChange={(v) => setP({ internacao: v })} hint={f.di !== null ? `D${f.di} de internação` : undefined} />
              <Field label="Admissão no CTI" type="date" value={p.admissao} onChange={(v) => setP({ admissao: v })} hint={f.dc !== null ? `D${f.dc} de CTI` : undefined} />
            </div>
            <div className="row">
              <Field label="Origem" value={p.origem} onChange={(v) => setP({ origem: v })} placeholder="ex.: emergência, CC" />
            </div>
            <div className="row c3">
              <Field label="Idade" num value={p.idade} onChange={(v) => setP({ idade: v })} />
              <div><label>Sexo</label><Seg options={['M', 'F']} value={p.sexo} onChange={(v) => setP({ sexo: v })} /></div>
              <Field label="Peso (kg)" num value={p.peso} onChange={(v) => setP({ peso: v })} />
            </div>
            <div className="hint">Sem nome do paciente: o texto vai colado no prontuário dele. Peso calcula doses e diurese; idade, sexo e creatinina, a TFG.</div>
          </Section>

          {/* 3. Diagnósticos e história */}
          <Section title="Diagnósticos e história" open={isOpen('diag')} onToggle={() => toggle('diag')}
            summary={diagLines(p, hoje).map((l) => l.replace(/^\d+\. /, '')).join('; ')}>
            {p.diagnosticos.length === 0 && <div className="empty">Nenhum diagnóstico</div>}
            {p.diagnosticos.map((d, i) => (
              <div className="item" key={d.id}>
                <div className="item-h">
                  <span className="nm">{i + 1}.</span>
                  {d.cirurgia && has(d.data) && diasDesde(d.data, hoje) >= 0 && <span className="daybadge">PO D{diasDesde(d.data, hoje)}</span>}
                  <button className="icon-btn del" aria-label="Remover diagnóstico" onClick={() => listDel('diagnosticos', d.id)}><Icon name="x" /></button>
                </div>
                <div className="row"><Field value={d.texto} onChange={(v) => listSet('diagnosticos', d.id, { texto: v })} placeholder="ex.: HSA aneurismática, Hunt-Hess 3" /></div>
                <div className="row c2">
                  <Field label="Data (ictus, cirurgia...)" type="date" value={d.data} onChange={(v) => listSet('diagnosticos', d.id, { data: v })} />
                  <div style={{ alignSelf: 'end' }}><Toggle label="Cirurgia/procedimento (conta PO)" checked={d.cirurgia} onChange={(v) => listSet('diagnosticos', d.id, { cirurgia: v })} /></div>
                </div>
              </div>
            ))}
            <button className="btn ghost sm" onClick={() => listAdd('diagnosticos', { texto: '', data: '', cirurgia: false })}><Icon name="plus" /> Diagnóstico</button>
            <div className="row" style={{ marginTop: 12 }}>
              <Area label="Comorbidades (uma por linha)" value={p.comorbidades} onChange={(v) => setP({ comorbidades: v })} rows={2} />
              <Area label="Medicações de uso contínuo (uma por linha, com mantida/suspensa)" value={p.medicacoes} onChange={(v) => setP({ medicacoes: v })} rows={2} />
            </div>
          </Section>

          {/* 4. Alertas */}
          <Section title="Alergias e isolamento" open={isOpen('alertas')} onToggle={() => toggle('alertas')}
            summary={[has(p.alergias) && 'alergia', has(p.isolamento) && 'isolamento'].filter(Boolean).join(' e ') || 'nenhum'}>
            <div className="row">
              <Area label="Alergias (droga e reação)" value={p.alergias} onChange={(v) => setP({ alergias: v })} rows={2} placeholder="ex.: Dipirona (urticária)" />
              <Area label="Isolamento (tipo e motivo)" value={p.isolamento} onChange={(v) => setP({ isolamento: v })} rows={2} placeholder="ex.: Contato (KPC)" />
            </div>
          </Section>

          {/* 5. Dispositivos */}
          <Section title="Dispositivos" open={isOpen('disp')} onToggle={() => toggle('disp')} wide
            summary={p.dispositivos.map((d) => { const s = statusDispositivo(d, hoje); return `${d.nome}${s ? ' D' + s.dias : ''}`; }).join(', ') || 'nenhum'}>
            {p.dispositivos.length === 0 && <div className="empty">Nenhum dispositivo</div>}
            {p.dispositivos.map((d) => (
              <DeviceItem key={d.id} d={d} hoje={hoje}
                onChange={(nd) => listSet('dispositivos', d.id, nd)}
                onDelete={() => listDel('dispositivos', d.id)} />
            ))}
            <button className="btn ghost sm" onClick={() => setAddDev(true)}><Icon name="plus" /> Dispositivo</button>
            <div className="hint">Dias contados a partir da inserção (D0). Vermelho: TOT acima de 10 dias, CVC/PICC acima de 14.</div>
          </Section>

          {/* 6. Infusões */}
          <Section title="Infusões" open={isOpen('inf')} onToggle={() => toggle('inf')}
            extra={<Conferir on={conf.infusoes} onDone={() => conferido('infusoes')} />}
            summary={p.infusoes.map((i) => { const d = DRUGS.find((x) => x.id === i.drugId); return `${d ? d.nome : i.nome} ${show(i.vazao)} ml/h`; }).join(', ') || 'nenhuma'}>
            {p.infusoes.length === 0 && <div className="empty">Nenhuma infusão</div>}
            {p.infusoes.map((i) => {
              const doses = infusionDoses(i, p.peso, drugConc);
              const drug = DRUGS.find((x) => x.id === i.drugId);
              return (
                <div key={i.id}>
                  <div className="inline">
                    <div>
                      <label>Droga</label>
                      <select value={i.drugId || (i.outra ? '_outra' : '')}
                        onChange={(e) => {
                          const v = e.target.value;
                          listSet('infusoes', i.id, v === '_outra' ? { drugId: '', outra: true } : { drugId: v, outra: false, nome: '' }, 'infusoes');
                        }}>
                        <option value="">Selecionar</option>
                        {DRUGS.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        <option value="_outra">Outra</option>
                      </select>
                    </div>
                    <Field label="ml/h" num value={i.vazao} onChange={(v) => listSet('infusoes', i.id, { vazao: v }, 'infusoes')} />
                    <button className="icon-btn del" aria-label="Remover infusão" onClick={() => listDel('infusoes', i.id)}><Icon name="x" /></button>
                  </div>
                  {!i.drugId && i.outra && (
                    <div className="row"><Field label="Nome da infusão" value={i.nome} onChange={(v) => listSet('infusoes', i.id, { nome: v }, 'infusoes')} placeholder="ex.: NaCl 3%" /></div>
                  )}
                  {drug && (doses.length > 0
                    ? <div className="dose">{doses.join(' - ')}</div>
                    : has(i.vazao) && drug.doses.some((u) => /kg/.test(u)) && !has(p.peso) ? <div className="hint" style={{ marginTop: -4, marginBottom: 8 }}>Informe o peso para ver a dose.</div> : null)}
                </div>
              );
            })}
            <button className="btn ghost sm" onClick={() => listAdd('infusoes', { drugId: '', outra: false, nome: '', vazao: '' }, 'infusoes')}><Icon name="plus" /> Infusão</button>
            <div className="hint">Dose calculada com a diluição padrão do CTI (Ajustes) e o peso da identificação.</div>
          </Section>

          {/* 7. Ventilação */}
          <Section title="Ventilação" open={isOpen('vent')} onToggle={() => toggle('vent')}
            extra={<Conferir on={conf.vent} onDone={() => conferido('vent')} />}
            summary={ventLines(p, hoje).join(' - ') || 'sem registro'}>
            <div className="row"><div>
              <label>Modo / suporte</label>
              <select value={p.vent.modo} onChange={(e) => setIn('vent', { modo: e.target.value }, 'vent')}>
                <option value="">-</option>
                {MODOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div></div>
            {ventFields(p.vent.modo).length > 0 && (
              <div className="row c3">
                {ventFields(p.vent.modo).map((k) => <Field key={k} label={VENT_LABELS[k]} num value={p.vent[k]} onChange={(v) => setIn('vent', { [k]: v }, 'vent')} />)}
              </div>
            )}
            {via && ['VCV', 'PCV', 'PSV'].includes(p.vent.modo) && statusDispositivo(via, hoje) && (
              <div className="hint">{via.nome} + VM: D{statusDispositivo(via, hoje).dias} (D0 {ddmm(via.data)}), pela data do dispositivo.</div>
            )}
          </Section>

          {/* 8. Neurológico */}
          <Section title="Neurológico" open={isOpen('neuro')} onToggle={() => toggle('neuro')}
            extra={<Conferir on={conf.neuro} onDone={() => conferido('neuro')} />}
            summary={neuroLines(p).join(' - ') || 'sem registro'}>
            <div className="row c2">
              <div><label>Escala</label><Seg options={['Glasgow', 'RASS']} value={p.neuro.escala} onChange={(v) => setIn('neuro', { escala: v }, 'neuro')} /></div>
              <Field label={p.neuro.escala || 'Valor'} value={p.neuro.valor} onChange={(v) => setIn('neuro', { valor: v }, 'neuro')}
                placeholder={p.neuro.escala === 'Glasgow' ? '3 a 15' : p.neuro.escala === 'RASS' ? '-5 a +4' : ''} />
            </div>
            <div className="row"><Field label="Pupilas" value={p.neuro.pupilas} onChange={(v) => setIn('neuro', { pupilas: v }, 'neuro')} placeholder="ex.: isocóricas, fotorreagentes" /></div>
            <div className="row c2">
              <Field label="PIC mín (mmHg)" num value={p.neuro.picMin} onChange={(v) => setIn('neuro', { picMin: v }, 'neuro')} />
              <Field label="PIC máx (mmHg)" num value={p.neuro.picMax} onChange={(v) => setIn('neuro', { picMax: v }, 'neuro')} />
            </div>
            <Area label="Outros (déficit, nimodipino, DTC, TC...)" value={p.neuro.obs} onChange={(v) => setIn('neuro', { obs: v }, 'neuro')} rows={2} />
            {p.dispositivos.some((d) => isDVE(d.nome)) && <div className="hint">A DVE (altura, débito e aspecto) entra aqui no texto, a partir dos dados do dispositivo.</div>}
          </Section>

          {/* 9. Antimicrobianos e culturas */}
          <Section title="Antimicrobianos e culturas" open={isOpen('atb')} onToggle={() => toggle('atb')} wide
            extra={tfg ? <span className="chip blue">TFG {tfg.tfg} - {tfg.classe}</span> : null}
            summary={atbLines(p, hoje).filter((l) => !l.startsWith('Prévio')).join('; ') || 'nenhum'}>
            {p.atbs.filter((a) => !has(a.fim)).length === 0 && <div className="empty">Nenhum antimicrobiano em uso</div>}
            {p.atbs.filter((a) => !has(a.fim)).map((a) => {
              const d = diasDesde(a.inicio, hoje);
              return (
                <div className="item" key={a.id}>
                  <div className="item-h">
                    <span className="nm">{a.nome || 'Novo antimicrobiano'}</span>
                    {d !== null && d >= 0 && <span className="daybadge">D{d}{has(a.duracao) ? ` de ${a.duracao}` : ''}</span>}
                    <button className="btn sm" onClick={() => listSet('atbs', a.id, { fim: hoje })}>Suspender</button>
                    <button className="icon-btn del" aria-label="Remover antimicrobiano" onClick={() => listDel('atbs', a.id)}><Icon name="x" /></button>
                  </div>
                  <div className="row c2">
                    <Field label="Droga" value={a.nome} onChange={(v) => listSet('atbs', a.id, { nome: v })} placeholder="ex.: Meropenem" />
                    <Field label="Início (D0)" type="date" value={a.inicio} onChange={(v) => listSet('atbs', a.id, { inicio: v })} />
                  </div>
                  <div className="row c2">
                    <Field label="Foco" value={a.foco} onChange={(v) => listSet('atbs', a.id, { foco: v })} placeholder="ex.: pulmonar" />
                    <Field label="Duração prevista (dias)" num value={a.duracao} onChange={(v) => listSet('atbs', a.id, { duracao: v })} />
                  </div>
                </div>
              );
            })}
            <button className="btn ghost sm" onClick={() => listAdd('atbs', { nome: '', inicio: hoje, duracao: '', foco: '', fim: '' })}><Icon name="plus" /> Antimicrobiano</button>
            {p.atbs.some((a) => has(a.fim)) && (
              <div style={{ marginTop: 12 }}>
                <div className="lbl">Prévios</div>
                {p.atbs.filter((a) => has(a.fim)).map((a) => (
                  <div className="flex" key={a.id} style={{ padding: '4px 0' }}>
                    <span className="grow">{a.nome} ({has(a.inicio) ? `${ddmm(a.inicio)} a ` : 'até '}{ddmm(a.fim)})</span>
                    <button className="btn sm" onClick={() => listSet('atbs', a.id, { fim: '' })}>Voltar a em uso</button>
                    <button className="icon-btn del" aria-label="Remover" onClick={() => listDel('atbs', a.id)}><Icon name="x" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="lbl" style={{ marginTop: 14 }}>Culturas</div>
            {p.culturas.map((c) => (
              <div className="item" key={c.id}>
                <div className="row c2">
                  <div>
                    <label>Material</label>
                    <input list="materiais" value={c.material} onChange={(e) => listSet('culturas', c.id, { material: e.target.value })} />
                  </div>
                  <Field label="Coleta" type="date" value={c.data} onChange={(v) => listSet('culturas', c.id, { data: v })} />
                </div>
                <div className="inline" style={{ gridTemplateColumns: '1fr 36px', marginBottom: 0 }}>
                  <Field label="Resultado (vazio = pendente)" value={c.resultado} onChange={(v) => listSet('culturas', c.id, { resultado: v })} placeholder="ex.: Klebsiella sensível a cefepime" />
                  <button className="icon-btn del" aria-label="Remover cultura" onClick={() => listDel('culturas', c.id)}><Icon name="x" /></button>
                </div>
              </div>
            ))}
            <datalist id="materiais">{MATERIAIS.map((m) => <option key={m} value={m} />)}</datalist>
            <button className="btn ghost sm" onClick={() => listAdd('culturas', { material: '', data: hoje, resultado: '' })}><Icon name="plus" /> Cultura</button>
            <div className="hint">Sem posologia (fica na prescrição). A dose renal é decisão sua: a TFG aparece aqui só para conferência.</div>
          </Section>

          {/* 10. Profilaxias */}
          <Section title="Profilaxias" open={isOpen('prof')} onToggle={() => toggle('prof')}
            summary={profilaxiaLines(p).join(' - ') || 'sem registro'}>
            <label>TEV</label>
            <Seg options={TEV} value={p.profilaxias.tev} onChange={(v) => setIn('profilaxias', { tev: v })} />
            <div className="row" style={{ marginTop: 6 }}><Field value={p.profilaxias.tevObs} onChange={(v) => setIn('profilaxias', { tevObs: v })} placeholder="dose, motivo, reavaliação" /></div>
            <label>LAMG</label>
            <Seg options={LAMG} value={p.profilaxias.lamg} onChange={(v) => setIn('profilaxias', { lamg: v })} />
            <div className="row" style={{ marginTop: 6, marginBottom: 0 }}><Field value={p.profilaxias.lamgObs} onChange={(v) => setIn('profilaxias', { lamgObs: v })} placeholder="dose, indicação" /></div>
          </Section>

          {/* 11. Sinais vitais agora */}
          <Section title="Sinais vitais agora" open={isOpen('vitais')} onToggle={() => toggle('vitais')}
            summary={vitaisLine(p) || 'sem registro'}>
            <div className="row c4">
              <Field label="PA (mmHg)" value={p.vitais.pa} onChange={(v) => setIn('vitais', { pa: v })} placeholder="120/80" />
              <Field label="FC (bpm)" num value={p.vitais.fc} onChange={(v) => setIn('vitais', { fc: v })} />
              <Field label="SatO2 (%)" num value={p.vitais.sat} onChange={(v) => setIn('vitais', { sat: v })} />
              <Field label="Tax" num value={p.vitais.tax} onChange={(v) => setIn('vitais', { tax: v })} />
            </div>
            <div className="hint">Vão para o início do exame físico na evolução.</div>
          </Section>

          {/* 12. Últimas 24 h e balanço */}
          <Section title="Últimas 24 h e balanço" open={isOpen('h24')} onToggle={() => toggle('h24')} wide
            summary={bh !== null ? `BH ${fmtSigned(bh)} ml` + (Number(p.bhAcumulado) ? ` / acumulado ${fmtSigned(Number(p.bhAcumulado) + bh)} ml` : '') : 'sem registro'}>
            <div className="row c2">
              <Field label="Tax máxima" num value={p.h24.taxMax} onChange={(v) => setIn('h24', { taxMax: v })} />
              <Field label="Picos febris (obs.)" value={p.h24.taxPicos} onChange={(v) => setIn('h24', { taxPicos: v })} placeholder="ex.: 3 picos" />
            </div>
            <div className="row c4">
              <Field label="PAS mín" num value={p.h24.pasMin} onChange={(v) => setIn('h24', { pasMin: v })} />
              <Field label="PAS máx" num value={p.h24.pasMax} onChange={(v) => setIn('h24', { pasMax: v })} />
              <Field label="PAD mín" num value={p.h24.padMin} onChange={(v) => setIn('h24', { padMin: v })} />
              <Field label="PAD máx" num value={p.h24.padMax} onChange={(v) => setIn('h24', { padMax: v })} />
            </div>
            <div className="row c4">
              <Field label="FC mín" num value={p.h24.fcMin} onChange={(v) => setIn('h24', { fcMin: v })} />
              <Field label="FC máx" num value={p.h24.fcMax} onChange={(v) => setIn('h24', { fcMax: v })} />
              <Field label="FR mín" num value={p.h24.frMin} onChange={(v) => setIn('h24', { frMin: v })} />
              <Field label="FR máx" num value={p.h24.frMax} onChange={(v) => setIn('h24', { frMax: v })} />
            </div>
            <div className="row c3">
              <Field label="Glicemia mín" num value={p.h24.gliMin} onChange={(v) => setIn('h24', { gliMin: v })} />
              <Field label="Glicemia máx" num value={p.h24.gliMax} onChange={(v) => setIn('h24', { gliMax: v })} />
              <Field label="Insulina (obs.)" value={p.h24.insulina} onChange={(v) => setIn('h24', { insulina: v })} placeholder="ex.: 34 UI" />
            </div>
            <div className="row c4">
              <Field label="Ganhos (ml)" num value={p.h24.entradas} onChange={(v) => setIn('h24', { entradas: v })} hint="Total da folha" />
              <Field label="Diurese (ml)" num value={p.h24.du} onChange={(v) => setIn('h24', { du: v })}
                hint={diureseMlKgH(p.h24.du, p.peso) !== null ? `${fmtNum(diureseMlKgH(p.h24.du, p.peso), 1)} ml/kg/h` : undefined} />
              <Field label="Drenos (ml)" num value={p.h24.drenos} onChange={(v) => setIn('h24', { drenos: v })} hint="Somatório à mão" />
              <Field label="UF diálise (ml)" num value={p.h24.uf} onChange={(v) => setIn('h24', { uf: v })} hint="Vazio = não dialisou" />
            </div>
            <div className="calcbox">
              BH 24 h: <b>{bh === null ? '-' : `${fmtSigned(bh)} ml`}</b>
              {bh !== null && Number(p.bhAcumulado) !== 0 && <span> - acumulado {fmtSigned(Number(p.bhAcumulado) + bh)} ml</span>}
              <div className="hint">Ganhos - drenos - diurese - UF. Vazio não entra; 0 entra como zero. O acumulado soma os dias anteriores ao iniciar cada round.</div>
            </div>
          </Section>

          {/* 13. Laboratório */}
          <Section title="Laboratório" open={isOpen('lab')} onToggle={() => toggle('lab')} wide
            summary={labLines(p).slice(0, 4).join(' - ') || 'sem registro'}>
            <div className="row c2">
              <Field label="Data da coleta" type="date" value={p.labs.data} onChange={(v) => setIn('labs', { data: v })} />
              {tfg ? <div className="calcbox">TFG (CKD-EPI 2021): <b>{tfg.tfg}</b> ml/min/1,73m2 - {tfg.classe}</div> : <div className="hint" style={{ alignSelf: 'end' }}>TFG aparece com creatinina, idade e sexo.</div>}
            </div>
            <div className="row c4">
              {LAB_KEYS.map(([k, label]) => (
                <Field key={k} label={label} num value={p.labs[k]} onChange={(v) => setIn('labs', { [k]: v })}
                  prev={has(p.labsAnt[k]) ? `anterior: ${show(p.labsAnt[k])}` : undefined} />
              ))}
            </div>
            <Area label="Outros exames (um por linha)" value={p.labs.outros} onChange={(v) => setIn('labs', { outros: v })} rows={2} placeholder="ex.: TGO 45 / TGP 60" />
          </Section>

          {/* 14. Gasometria */}
          <Section title="Gasometria" open={isOpen('gaso')} onToggle={() => toggle('gaso')}
            summary={gasoLines(p).slice(0, 4).join(' - ') || 'sem registro'}>
            <div className="row c2">
              <Field label="Data" type="date" value={p.gaso.data} onChange={(v) => setIn('gaso', { data: v })} />
              <Field label="Hora" type="time" value={p.gaso.hora} onChange={(v) => setIn('gaso', { hora: v })} />
            </div>
            <div className="row c4">
              {GASO_KEYS.map(([k, label]) => (
                <Field key={k} label={label} num value={p.gaso[k]} onChange={(v) => setIn('gaso', { [k]: v })}
                  prev={has(p.gasoAnt[k]) ? `anterior: ${show(p.gasoAnt[k])}` : undefined} />
              ))}
            </div>
          </Section>

          {/* 15. Imagem e outros exames */}
          <Section title="Imagem e outros exames" open={isOpen('exames')} onToggle={() => toggle('exames')}
            summary={exameLines(p).slice(0, 2).join('; ') || 'nenhum'}>
            {p.exames.map((e) => (
              <div className="item" key={e.id}>
                <div className="row c2">
                  <Field label="Exame" value={e.exame} onChange={(v) => listSet('exames', e.id, { exame: v })} placeholder="ex.: TC de crânio" />
                  <Field label="Data" type="date" value={e.data} onChange={(v) => listSet('exames', e.id, { data: v })} />
                </div>
                <div className="inline" style={{ gridTemplateColumns: '1fr 36px', marginBottom: 0 }}>
                  <Field label="Conclusão (vazio = aguarda laudo)" value={e.resultado} onChange={(v) => listSet('exames', e.id, { resultado: v })} />
                  <button className="icon-btn del" aria-label="Remover exame" onClick={() => listDel('exames', e.id)}><Icon name="x" /></button>
                </div>
              </div>
            ))}
            <button className="btn ghost sm" onClick={() => listAdd('exames', { exame: '', data: hoje, resultado: '' })}><Icon name="plus" /> Exame</button>
          </Section>

          {/* 16. Nutrição e TGI */}
          <Section title="Nutrição e TGI" open={isOpen('nutri')} onToggle={() => toggle('nutri')}
            summary={nutricaoLines(p).join(' - ') || 'sem registro'}>
            <label>Via</label>
            <Seg options={VIAS} value={p.nutricao.via} onChange={(v) => setIn('nutricao', { via: v })} />
            <div className="row c2" style={{ marginTop: 8 }}>
              <Field label="Vazão (ml/h)" num value={p.nutricao.vazao} onChange={(v) => setIn('nutricao', { vazao: v })} />
              <Field label="% da meta" num value={p.nutricao.meta} onChange={(v) => setIn('nutricao', { meta: v })} />
            </div>
            <div className="row c2">
              <Field label="Última evacuação" type="date" value={/^\d{4}-/.test(p.evacuacao) ? p.evacuacao : ''} onChange={(v) => setP({ evacuacao: v })}
                hint={has(p.evacuacao) && /^\d{4}-/.test(p.evacuacao) ? `${diasDesde(p.evacuacao, hoje)} dia(s) sem evacuar` : (has(p.evacuacao) ? `Anterior: ${p.evacuacao}` : undefined)} />
              <Field label="Observações" value={p.nutricao.obs} onChange={(v) => setIn('nutricao', { obs: v })} placeholder="ex.: resíduo, distensão" />
            </div>
          </Section>

          {/* 17. Pele */}
          <Section title="Pele" open={isOpen('pele')} onToggle={() => toggle('pele')} summary={lines(p.pele).join('; ') || 'sem registro'}>
            <Area value={p.pele} onChange={(v) => setP({ pele: v })} rows={2} placeholder="Lesão por pressão: local e estágio; Braden" />
          </Section>

          {/* 18. Plano e pendências */}
          <Section title="Plano e pendências" open={isOpen('plano')} onToggle={() => toggle('plano')} wide
            summary={`${p.pendencias.filter((x) => !x.feita).length} pendências`}>
            <Area label="Plano do dia" value={p.plano} onChange={(v) => setP({ plano: v })} rows={4}
              placeholder={'Neuro: ...\nRespiratório: ...\nInfecção: ...'} />
            {has(p.planoOntem) && (
              <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setP({ plano: (has(p.plano) ? p.plano + '\n' : '') + p.planoOntem })}>
                Copiar o plano de ontem
              </button>
            )}
            <div className="lbl" style={{ marginTop: 14 }}>Pendências</div>
            {p.pendencias.map((x) => (
              <div className={'pend' + (x.feita ? ' feita' : '')} key={x.id}>
                <input type="checkbox" checked={!!x.feita} onChange={(e) => listSet('pendencias', x.id, { feita: e.target.checked })} aria-label="Feita" />
                <span className="grow">{x.texto}</span>
                <button className="icon-btn del" aria-label="Remover pendência" onClick={() => listDel('pendencias', x.id)}><Icon name="x" /></button>
              </div>
            ))}
            <div className="flex" style={{ marginTop: 6 }}>
              <input value={novaPend} placeholder="Nova pendência" onChange={(e) => setNovaPend(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && novaPend.trim()) { listAdd('pendencias', { texto: novaPend.trim(), feita: false }); setNovaPend(''); } }} />
              <button className="btn primary" onClick={() => { if (novaPend.trim()) { listAdd('pendencias', { texto: novaPend.trim(), feita: false }); setNovaPend(''); } }}><Icon name="plus" /></button>
            </div>
            <div className="hint">Feitas saem da lista no round seguinte. Itens do checklist marcados como pendência também entram na evolução.</div>
          </Section>
        </div>
      </div>

      {addDev && (
        <AddDevice onClose={() => setAddDev(false)} onAdd={(nome) => {
          listAdd('dispositivos', { nome, data: todayISO(), origem: '', sitio: '', sitios: [], montagem: '', altura: '', estado: '', debito: '', aspecto: '', questionarRetirada: false });
          setAddDev(false);
        }} />
      )}
      {saida && <SaidaModal leito={leito} onClose={() => setSaida(false)} onConfirm={(t) => { setSaida(false); onSaida(t); }} />}
    </div>
  );
}
