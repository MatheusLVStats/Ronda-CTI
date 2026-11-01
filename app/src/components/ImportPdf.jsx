import React, { useRef, useState } from 'react';
import { parseEvolucao } from '../lib/importer.js';
import { ddmm } from '../lib/dates.js';
import { has } from '../lib/format.js';
import { Modal, Icon } from './ui.jsx';

const lower = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SEXO = { M: 'masculino', F: 'feminino' };
const ID_LABELS = { idade: 'Idade', sexo: 'Sexo', peso: 'Peso (kg)', internacao: 'Internação hospitalar', origem: 'Origem' };

// Marca cada sugestão: ligada por padrão, menos o que já existe no leito.
function prepare(r, p) {
  const ids = Object.entries(ID_LABELS)
    .filter(([k]) => has(r.paciente[k]))
    .map(([k, label]) => ({ k, label, value: r.paciente[k], atual: p[k], on: !has(p[k]) }));
  const exists = (list, key, v) => list.some((x) => lower(x[key]) === lower(v));
  const lineSet = (txt) => new Set(String(txt || '').split('\n').map(lower).filter(Boolean));
  const mk = (arr, dup) => arr.map((x) => ({ ...x, on: !dup(x), dup: dup(x) }));
  return {
    nome: r.paciente.nome || '',
    ids,
    diagnosticos: mk(r.diagnosticos, (d) => exists(p.diagnosticos, 'texto', d.texto)),
    comorbidades: mk(r.comorbidades.map((t) => ({ t })), (x) => lineSet(p.comorbidades).has(lower(x.t))),
    medicacoes: mk(r.medicacoes.map((t) => ({ t })), (x) => lineSet(p.medicacoes).has(lower(x.t))),
    alergias: mk(r.alergias.map((t) => ({ t })), (x) => lineSet(p.alergias).has(lower(x.t))),
    dispositivos: mk(r.dispositivos, (d) => exists(p.dispositivos, 'nome', d.nome)),
    atbs: mk(r.atbs, (a) => exists(p.atbs, 'nome', a.nome)),
    culturas: mk(r.culturas, (c) => p.culturas.some((x) => lower(x.material) === lower(c.material) && x.data === c.data)),
    exames: mk(r.exames, (e) => p.exames.some((x) => lower(x.exame) === lower(e.exame) && x.data === e.data)),
    vent: r.vent ? { ...r.vent, on: !has(p.vent.modo) } : null,
  };
}

function Group({ title, children, n }) {
  if (!n) return null;
  return (<div style={{ marginBottom: 14 }}><div className="lbl">{title}</div>{children}</div>);
}

function Row({ on, onToggle, children, note }) {
  return (
    <div className="pend" style={{ alignItems: 'flex-start' }}>
      <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} aria-label="Importar" />
      <div className="grow" style={{ minWidth: 0 }}>
        {children}
        {note && <div className="hint" style={{ marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}

export default function ImportPdf({ leito, patient, hoje, onApply, onClose }) {
  const [stage, setStage] = useState('pick');
  const [err, setErr] = useState('');
  const [s, setS] = useState(null);
  const [texto, setTexto] = useState('');
  const [verTexto, setVerTexto] = useState(false);
  const fileRef = useRef(null);

  async function ler(file) {
    if (!file) return;
    setStage('reading');
    setErr('');
    try {
      const { pdfToText } = await import('../lib/pdftext.js');
      const t = await pdfToText(file);
      if (!t.trim()) throw new Error('vazio');
      setTexto(t);
      setS(prepare(parseEvolucao(t, hoje), patient));
      setStage('review');
    } catch (e) {
      console.error('Leitura do PDF:', e);
      setErr(String(e && e.message) === 'vazio'
        ? 'Não achei texto neste PDF. Pode ser um PDF escaneado (imagem), que o app ainda não lê.'
        : 'Não foi possível ler este PDF neste navegador. Tente pelo celular ou por um Chrome atualizado.');
      setStage('pick');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const upd = (group, i, patch) => setS((cur) => ({ ...cur, [group]: cur[group].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  function aplicar() {
    const on = (arr) => arr.filter((x) => x.on).map(({ on: _o, dup: _d, ...rest }) => rest);
    const paciente = Object.fromEntries(s.ids.filter((x) => x.on).map((x) => [x.k, x.value]));
    const sel = {
      paciente,
      diagnosticos: on(s.diagnosticos),
      comorbidades: on(s.comorbidades).map((x) => x.t),
      medicacoes: on(s.medicacoes).map((x) => x.t),
      alergias: on(s.alergias).map((x) => x.t),
      dispositivos: on(s.dispositivos),
      atbs: on(s.atbs),
      culturas: on(s.culturas),
      exames: on(s.exames),
      vent: s.vent && s.vent.on ? (({ on: _o, ...v }) => v)(s.vent) : null,
    };
    const total = Object.keys(paciente).length + ['diagnosticos', 'comorbidades', 'medicacoes', 'alergias', 'dispositivos', 'atbs', 'culturas', 'exames'].reduce((a, k) => a + sel[k].length, 0) + (sel.vent ? 1 : 0);
    setTexto('');
    setS(null);
    onApply(sel, total);
  }

  const vazio = s && !s.ids.length && !['diagnosticos', 'comorbidades', 'medicacoes', 'alergias', 'dispositivos', 'atbs', 'culturas', 'exames'].some((k) => s[k].length) && !s.vent;

  return (
    <Modal title={`Importar PDF - leito ${leito}`} onClose={onClose}>
      {stage !== 'review' && (
        <>
          <p style={{ marginTop: 0 }}>Evolução médica ou sumário de transferência gerado pelo sistema. O PDF é lido aqui, no aparelho: não vai para a nuvem nem fica guardado no app. Você confere tudo antes de entrar no leito.</p>
          {err && <div className="err">{err}</div>}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => ler(e.target.files && e.target.files[0])} />
          <button className="btn primary block" disabled={stage === 'reading'} onClick={() => fileRef.current && fileRef.current.click()}>
            {stage === 'reading' ? 'Lendo o PDF...' : 'Escolher PDF'}
          </button>
          <div className="hint">Depois de importar, apague o PDF baixado do aparelho (o app não consegue apagar arquivos sozinho).</div>
        </>
      )}

      {stage === 'review' && s && (
        <>
          {s.nome
            ? <div className="banner amber"><span className="grow">Paciente no PDF: <b>{s.nome}</b>. Confira se é o paciente do leito {leito}. O nome não é salvo.</span></div>
            : <div className="banner amber"><span className="grow">Não achei o nome no PDF: confira se é o paciente do leito {leito}.</span></div>}
          {vazio && <div className="err">Não reconheci nenhum campo neste PDF. Veja o texto lido abaixo e me mande um exemplo tarjado para eu ajustar a leitura.</div>}

          <Group title="Identificação" n={s.ids.length}>
            {s.ids.map((x, i) => (
              <Row key={x.k} on={x.on} onToggle={(v) => upd('ids', i, { on: v })}
                note={has(x.atual) && x.atual !== x.value ? `No leito hoje: ${x.k === 'internacao' ? ddmm(x.atual) : x.k === 'sexo' ? SEXO[x.atual] : x.atual}. Marcar substitui.` : undefined}>
                <span>{x.label}: </span>
                {x.k === 'internacao'
                  ? <input type="date" value={x.value} onChange={(e) => upd('ids', i, { value: e.target.value })} style={{ maxWidth: 190 }} />
                  : <b>{x.k === 'sexo' ? SEXO[x.value] : x.value}</b>}
              </Row>
            ))}
          </Group>

          <Group title="Diagnósticos" n={s.diagnosticos.length}>
            {s.diagnosticos.map((d, i) => (
              <Row key={d.id} on={d.on} onToggle={(v) => upd('diagnosticos', i, { on: v })} note={d.dup ? 'Já está no leito.' : d.cirurgia ? 'Cirurgia/procedimento: conta PO.' : undefined}>
                <input value={d.texto} onChange={(e) => upd('diagnosticos', i, { texto: e.target.value })} />
              </Row>
            ))}
          </Group>

          {[['comorbidades', 'Comorbidades'], ['medicacoes', 'Medicações de uso contínuo'], ['alergias', 'Alergias']].map(([g, title]) => (
            <Group key={g} title={title} n={s[g].length}>
              {s[g].map((x, i) => (
                <Row key={g + i} on={x.on} onToggle={(v) => upd(g, i, { on: v })} note={x.dup ? 'Já está no leito.' : undefined}>
                  <input value={x.t} onChange={(e) => upd(g, i, { t: e.target.value })} />
                </Row>
              ))}
            </Group>
          ))}

          <Group title="Dispositivos" n={s.dispositivos.length}>
            {s.dispositivos.map((d, i) => (
              <Row key={d.id} on={d.on} onToggle={(v) => upd('dispositivos', i, { on: v })} note={d.dup ? 'Já existe um igual no leito.' : `Lido: "${d.fonte}"`}>
                <div className="flex wrap-f">
                  <b>{d.nome}{d.sitio ? ' ' + d.sitio : ''}</b>
                  <input type="date" value={d.data} onChange={(e) => upd('dispositivos', i, { data: e.target.value })} style={{ maxWidth: 170 }} aria-label="Data de inserção" />
                  {d.origem && <span className="chip">{d.origem}</span>}
                </div>
              </Row>
            ))}
          </Group>

          <Group title="Antimicrobianos" n={s.atbs.length}>
            {s.atbs.map((a, i) => (
              <Row key={a.id} on={a.on} onToggle={(v) => upd('atbs', i, { on: v })} note={a.dup ? 'Já está no leito.' : `Lido: "${a.fonte}"`}>
                <div className="flex wrap-f">
                  <b>{a.nome}</b>
                  <span className="hint" style={{ marginTop: 0 }}>início</span>
                  <input type="date" value={a.inicio} onChange={(e) => upd('atbs', i, { inicio: e.target.value })} style={{ maxWidth: 170 }} aria-label="Início" />
                  {a.fim && <span className="chip">prévio, até {ddmm(a.fim)}</span>}
                </div>
              </Row>
            ))}
          </Group>

          <Group title="Culturas" n={s.culturas.length}>
            {s.culturas.map((c, i) => (
              <Row key={c.id} on={c.on} onToggle={(v) => upd('culturas', i, { on: v })} note={c.dup ? 'Já está no leito.' : undefined}>
                <span>{c.material}{c.data ? ` ${ddmm(c.data)}` : ''}: {c.resultado || 'pendente'}</span>
              </Row>
            ))}
          </Group>

          <Group title="Exames" n={s.exames.length}>
            {s.exames.map((e, i) => (
              <Row key={e.id} on={e.on} onToggle={(v) => upd('exames', i, { on: v })} note={e.dup ? 'Já está no leito.' : undefined}>
                <span>{e.exame}{e.data ? ` ${ddmm(e.data)}` : ''}: {e.resultado || 'aguarda laudo'}</span>
              </Row>
            ))}
          </Group>

          {s.vent && (
            <Group title="Ventilação" n={1}>
              <Row on={s.vent.on} onToggle={(v) => setS((cur) => ({ ...cur, vent: { ...cur.vent, on: v } }))}
                note={has(patient.vent.modo) ? `No leito hoje: ${patient.vent.modo}. Marcar substitui os parâmetros.` : undefined}>
                <span>{[s.vent.modo, s.vent.pi && `PI ${s.vent.pi}`, s.vent.psup && `Psup ${s.vent.psup}`, s.vent.peep && `PEEP ${s.vent.peep}`, s.vent.fio2 && `FiO2 ${s.vent.fio2}%`, s.vent.fr && `FR ${s.vent.fr}`, s.vent.vc && `VC ${s.vent.vc}`, s.vent.fluxo && `${s.vent.fluxo} L/min`].filter(Boolean).join(' / ')}</span>
              </Row>
            </Group>
          )}

          <button className="btn sm" onClick={() => setVerTexto(!verTexto)}>{verTexto ? 'Esconder' : 'Ver'} o texto lido do PDF</button>
          {verTexto && <pre className="textout" style={{ marginTop: 8 }}>{texto}</pre>}

          <div className="flex" style={{ marginTop: 14 }}>
            <button className="btn primary grow" onClick={aplicar}><Icon name="check" /> Importar marcados</button>
            <button className="btn" onClick={() => { setTexto(''); setS(null); onClose(); }}>Cancelar</button>
          </div>
          <div className="hint">Depois de importar, apague o PDF baixado do aparelho.</div>
        </>
      )}
    </Modal>
  );
}
