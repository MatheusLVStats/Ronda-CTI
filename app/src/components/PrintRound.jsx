import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fichaLeito, cabecalho, folhas } from '../lib/print.js';
import { AUTORIA } from '../config.js';
import { Modal, Icon, Area } from './ui.jsx';

// Janela "Imprimir round": quais leitos e quantos por folha.
export function PrintDialog({ ocupados, inicial, onPrint, onPlano, onClose }) {
  const [sel, setSel] = useState(() => new Set(inicial && inicial.length ? inicial : ocupados.map((o) => o.id)));
  const [porFolha, setPorFolha] = useState(1);
  const escolhidos = ocupados.filter((o) => sel.has(o.id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todos = escolhidos.length === ocupados.length;

  return (
    <Modal title="Imprimir round" onClose={onClose}>
      <div className="lbl">Leitos</div>
      <div className="flex wrap-f" style={{ marginBottom: 8 }}>
        {ocupados.map((o) => (
          <button key={o.id} className={'chipbtn' + (sel.has(o.id) ? ' on' : '')} onClick={() => toggle(o.id)} aria-pressed={sel.has(o.id)}>{o.label}</button>
        ))}
      </div>
      <button className="btn sm" style={{ marginBottom: 14 }} onClick={() => setSel(new Set(todos ? [] : ocupados.map((o) => o.id)))}>{todos ? 'Desmarcar todos' : `Todos os ocupados (${ocupados.length})`}</button>

      {escolhidos.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="lbl">Plano do dia (sai impresso)</div>
          {escolhidos.map((o) => (
            <Area key={o.id} label={`Leito ${o.label}${o.dx ? ' - ' + o.dx : ''}`} value={o.plano} rows={3}
              onChange={(v) => onPlano(o.id, v)} placeholder="Um item por linha. Fica salvo no leito." />
          ))}
        </div>
      )}

      <div className="lbl">Por folha</div>
      <div className="seg" style={{ marginBottom: 6 }}>
        <button className={porFolha === 1 ? 'on' : ''} onClick={() => setPorFolha(1)}>1 leito (paisagem)</button>
        <button className={porFolha === 2 ? 'on' : ''} onClick={() => setPorFolha(2)}>2 leitos (economia)</button>
      </div>
      <div className="hint" style={{ marginBottom: 14 }}>A4, preto e branco, só o que foi preenchido. A letra diminui sozinha para cada leito caber na folha. O nome do paciente não fica no app: a folha traz uma linha para escrever à mão.</div>

      <button className="btn primary block" disabled={!escolhidos.length} onClick={() => onPrint(escolhidos.map((o) => o.id), porFolha)}>
        <Icon name="print" /> Imprimir {escolhidos.length} {escolhidos.length === 1 ? 'leito' : 'leitos'} - {folhas(escolhidos.length, porFolha)} {folhas(escolhidos.length, porFolha) === 1 ? 'folha' : 'folhas'}
      </button>
      <div className="hint">No iPhone, escolha a impressora ou "Salvar em Arquivos" para gerar o PDF.</div>
    </Modal>
  );
}

function Caixa({ v }) {
  return <span className={'pbox' + (v === 'ok' ? ' ok' : v === 'na' ? ' na' : '')} aria-hidden="true">{v === 'ok' ? '✓' : v === 'na' ? '-' : ''}</span>;
}

function Secao({ s }) {
  return (
    <div className={'psec' + (s.anotacoes ? ' anot' : '')}>
      <h4>{s.t}</h4>
      {s.checklist && (
        <div className="pcheck">
          {s.checklist.map((c) => (
            <div key={c.t}><Caixa v={c.v} /> {c.t}{c.v === 'pend' ? ': pendência' : ''}{c.nota ? ` (${c.nota})` : ''}</div>
          ))}
        </div>
      )}
      {s.items && s.items.map((l, i) => <p key={i} className={s.alerta && s.alerta(l) ? 'mk' : ''}>{l}</p>)}
      {s.vazias ? Array.from({ length: s.vazias }, (_, i) => <div key={'v' + i} className="pline" />) : null}
      {s.pendencias && (
        <>
          {s.pendencias.map((l, i) => <div key={i} className="ppend"><Caixa /> {l}</div>)}
          {[0, 1].map((i) => <div key={'n' + i} className="ppend"><Caixa /> <span className="pline grow" /></div>)}
        </>
      )}
      {s.anotacoes && [0, 1, 2, 3].map((i) => <div key={i} className="pline" />)}
    </div>
  );
}

function Leito({ f, head }) {
  return (
    <div className="pbed">
      <div className="ptop">
        <span><b>{head}</b></span>
        <span>Documento com dados sensíveis. Descartar em fragmentadora.</span>
      </div>
      <div className="pid">
        <div className="pleito"><small>LEITO</small><b>{f.leito}</b></div>
        <div className="pidt">
          <div className="pnome">Nome: <span className="pline" /></div>
          <div>{[f.id, ...f.dias].filter(Boolean).join(' - ') || 'Identificação não preenchida'}</div>
        </div>
        <div className="palerts">
          {f.alergias.length > 0 && <div className="pal crit">ALERGIA: {f.alergias.join(', ').toUpperCase()}</div>}
          {f.isolamento.length > 0 && <div className="pal">ISOLAMENTO: {f.isolamento.join(', ').toUpperCase()}</div>}
          {f.dve && <div className="pal">Questionar retirada da DVE</div>}
        </div>
      </div>
      <div className="pcols">
        {f.secoes.map((s) => <Secao key={s.t} s={s} />)}
      </div>
      <div className="pfoot">Ronda CTI - {AUTORIA}</div>
    </div>
  );
}

// Folhas para impressão: montadas fora da tela, ajustadas e enviadas ao window.print().
export function PrintSheets({ job, beds, ctx, onDone }) {
  const ref = useRef(null);
  const { ids, porFolha } = job;
  const fichas = ids.map((id) => beds.find((b) => b.id === id)).filter((b) => b && b.patient)
    .map((b) => fichaLeito(b.patient, { ...ctx, leito: b.label }));
  const head = cabecalho(ctx.unidade, ctx.hoje);
  const paginas = [];
  for (let i = 0; i < fichas.length; i += porFolha) paginas.push(fichas.slice(i, i + porFolha));

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const inicio = porFolha === 1 ? 10 : 8.5;
    for (const bed of root.querySelectorAll('.pbed')) {
      const cols = bed.querySelector('.pcols');
      const cabe = () => cols.scrollWidth <= cols.clientWidth + 1 && cols.scrollHeight <= cols.clientHeight + 1;
      let pt = inicio;
      bed.style.fontSize = `${pt}pt`;
      while (!cabe() && pt > 6.5) { pt -= 0.25; bed.style.fontSize = `${pt}pt`; }
      if (!cabe()) { const an = bed.querySelector('.psec.anot'); if (an) an.style.display = 'none'; }
    }
    const fim = () => onDone();
    window.addEventListener('afterprint', fim, { once: true });
    const t = setTimeout(() => { try { window.print(); } catch (e) { console.error(e); onDone(); } }, 60);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fim); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className={'print-root ' + (porFolha === 1 ? 'land' : 'port')} ref={ref}>
      <style>{`@page { size: A4 ${porFolha === 1 ? 'landscape' : 'portrait'}; margin: 0; }`}</style>
      {paginas.map((pg, i) => (
        <div className="psheet" key={i}>{pg.map((f) => <Leito key={f.leito} f={f} head={head} />)}</div>
      ))}
    </div>,
    document.body,
  );
}
