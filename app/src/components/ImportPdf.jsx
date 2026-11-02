import React, { useEffect, useRef, useState } from 'react';
import { parseEvolucao, header } from '../lib/importer.js';
import { parseLab, parseLaudos, destinoTexto, situacaoLaudo } from '../lib/importLab.js';
import { LAB_KEYS, GASO_KEYS } from '../lib/model.js';
import { ddmm } from '../lib/dates.js';
import { DRUGS } from '../lib/drugs.js';
import { has } from '../lib/format.js';
import { Modal, Icon } from './ui.jsx';

const lower = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SEXO = { M: 'masculino', F: 'feminino' };
const ID_LABELS = { idade: 'Idade', sexo: 'Sexo', peso: 'Peso (kg)', internacao: 'Internação hospitalar', admissao: 'Admissão no CTI', origem: 'Origem' };
const DATA_IDS = new Set(['internacao', 'admissao']);
const nomeDroga = (i) => (i.drugId ? (DRUGS.find((d) => d.id === i.drugId) || {}).nome : i.nome);

// Marca cada sugestão: ligada por padrão, menos o que já existe no leito.
function prepare(r, p, hoje) {
  const ids = Object.entries(ID_LABELS)
    .filter(([k]) => has(r.paciente[k]))
    .map(([k, label]) => ({ k, label, value: r.paciente[k], atual: p[k], on: !has(p[k]) || (k === 'admissao' && p[k] === hoje && r.paciente[k] !== hoje) }));
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
    infusoes: mk(r.infusoes || [], (i) => p.infusoes.some((x) => (i.drugId ? x.drugId === i.drugId : lower(x.nome) === lower(i.nome)))),
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

const TIPOS = {
  evolucao: { t: 'Evolução ou sumário', d: 'Transferência ou admissão de outro setor' },
  lab: { t: 'Laboratório', d: 'Hemograma, bioquímica, coagulograma e gasometria' },
  imagem: { t: 'Laudo de imagem', d: 'TC, RX, USG, RM, eco, DTC... Pode escolher vários PDFs de uma vez' },
};
const LABEL = Object.fromEntries([...LAB_KEYS, ...GASO_KEYS]);

function prepareLab(r, p) {
  const itens = r.itens.map((x) => {
    const atual = x.alvo === 'gaso' ? p.gaso[x.k] : p.labs[x.k];
    return { ...x, label: LABEL[x.k] || x.k, atual, on: !x.suspeito };
  });
  return { data: r.data, hora: r.hora, venosa: r.venosa, itens, outros: r.outros.map((o) => ({ ...o, on: true })) };
}

function prepareLaudos(laudos, p) {
  return {
    laudos: laudos.map((e) => {
      const { tipo, ex } = situacaoLaudo(p.exames, e);
      const nota = {
        completa: `Completa "${ex && ex.exame}", que aguardava laudo.`,
        igual: 'Já está no leito com esta conclusão.',
        outra: `Já está no leito com outra conclusão ("${ex && ex.resultado}"). Marcar substitui.`,
      }[tipo];
      return { ...e, on: tipo === 'novo' || (tipo === 'completa' && has(e.resultado)), nota };
    }),
  };
}

function ReviewEvolucao({ s, setS, upd, patient }) {
  return (
    <>
      <Group title="Identificação" n={s.ids.length}>
        {s.ids.map((x, i) => (
          <Row key={x.k} on={x.on} onToggle={(v) => upd('ids', i, { on: v })}
            note={has(x.atual) && x.atual !== x.value ? `No leito hoje: ${DATA_IDS.has(x.k) ? ddmm(x.atual) : x.k === 'sexo' ? SEXO[x.atual] : x.atual}. Marcar substitui.` : undefined}>
            <span>{x.label}: </span>
            {DATA_IDS.has(x.k)
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
      <Group title="Infusões" n={s.infusoes.length}>
        {s.infusoes.map((x, i) => (
          <Row key={x.id} on={x.on} onToggle={(v) => upd('infusoes', i, { on: v })} note={x.dup ? 'Já está no leito.' : x.outra ? 'Fora da lista de diluições: entra como "outra".' : undefined}>
            <div className="flex">
              <b style={{ minWidth: 0 }}>{nomeDroga(x)}</b>
              <input value={x.vazao} inputMode="decimal" onChange={(e) => upd('infusoes', i, { vazao: e.target.value })} style={{ maxWidth: 90 }} aria-label="Vazão" />
              <span className="hint" style={{ marginTop: 0 }}>ml/h</span>
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
    </>
  );
}

function ReviewLab({ s, setS, upd, patient }) {
  const labs = s.itens.map((x, i) => [x, i]).filter(([x]) => x.alvo === 'labs');
  const gaso = s.itens.map((x, i) => [x, i]).filter(([x]) => x.alvo === 'gaso');
  const item = ([x, i]) => (
    <Row key={x.k} on={x.on} onToggle={(v) => upd('itens', i, { on: v })}
      note={[x.nota, x.suspeito ? `Valor fora do esperado, confira no PDF ("${x.fonte}").` : has(x.atual) && `No leito hoje: ${x.atual}`].filter(Boolean).join(' ') || undefined}>
      <div className="flex">
        <span style={{ minWidth: 70 }}>{x.label}</span>
        <input value={x.valor} inputMode="decimal" onChange={(e) => upd('itens', i, { valor: e.target.value })} style={{ maxWidth: 130 }} />
      </div>
    </Row>
  );
  return (
    <>
      <div className="row c2">
        <div><label>Data da coleta</label><input type="date" value={s.data} onChange={(e) => setS((c) => ({ ...c, data: e.target.value }))} /></div>
        <div><label>Hora</label><input type="time" value={s.hora} onChange={(e) => setS((c) => ({ ...c, hora: e.target.value }))} /></div>
      </div>
      <Group title={`Exames - ${destinoTexto(patient.labs, s.data)}`} n={labs.length}>{labs.map(item)}</Group>
      <Group title={`Gasometria - ${destinoTexto(patient.gaso, s.data)}`} n={gaso.length}>
        {s.venosa && <div className="hint" style={{ marginBottom: 6 }}>O PDF fala em gasometria venosa.</div>}
        {gaso.map(item)}
      </Group>
      <Group title="Outros exames (vão para 'outros' do laboratório)" n={s.outros.length}>
        {s.outros.map((o, i) => (
          <Row key={o.label} on={o.on} onToggle={(v) => upd('outros', i, { on: v })}>
            <div className="flex">
              <span style={{ minWidth: 70 }}>{o.label}</span>
              <input value={o.valor} onChange={(e) => upd('outros', i, { valor: e.target.value })} style={{ maxWidth: 130 }} />
            </div>
          </Row>
        ))}
      </Group>
    </>
  );
}

function ReviewImagem({ s, upd }) {
  return (
    <Group title="Laudos" n={s.laudos.length}>
      {s.laudos.map((e, i) => (
        <Row key={e.id} on={e.on} onToggle={(v) => upd('laudos', i, { on: v })}
          note={[e.resumo && !e.completo && 'Laudo sem conclusão: vieram só os achados alterados do relatório.', e.nota, !has(e.resultado) && 'Não achei a conclusão: digite ou copie do laudo.'].filter(Boolean).join(' ') || undefined}>
          <input value={e.exame} onChange={(ev) => upd('laudos', i, { exame: ev.target.value })} aria-label="Exame" style={{ marginBottom: 6 }} />
          <input type="date" value={e.data} onChange={(ev) => upd('laudos', i, { data: ev.target.value })} aria-label="Data do exame" style={{ maxWidth: 190, marginBottom: 6 }} />
          <textarea rows={Math.min(10, Math.max(3, Math.ceil(String(e.resultado || '').length / 38)))} value={e.resultado} onChange={(ev) => upd('laudos', i, { resultado: ev.target.value })} aria-label="Conclusão" />
          {e.relatorio && (
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => upd('laudos', i, e.completo ? { resultado: e.resumoTxt, completo: false } : { resumoTxt: e.resultado, resultado: e.relatorio, completo: true })}>
              {e.completo ? 'Voltar aos achados alterados' : 'Usar o relatório completo'}
            </button>
          )}
        </Row>
      ))}
    </Group>
  );
}

const contar = (tipo, s) => {
  if (tipo === 'lab') return s.itens.length + s.outros.length;
  if (tipo === 'imagem') return s.laudos.length;
  return s.ids.length + ['diagnosticos', 'comorbidades', 'medicacoes', 'alergias', 'dispositivos', 'atbs', 'culturas', 'exames', 'infusoes'].reduce((a, k) => a + s[k].length, 0) + (s.vent ? 1 : 0);
};

// Botão que abre o seletor de arquivo direto (um toque), também no Safari do iPhone.
export function PdfPick({ className = 'btn', children, onFile, multiple }) {
  return (
    <label className={className + ' pdfpick'}>
      <input type="file" accept="application/pdf,.pdf" className="file-hidden" multiple={!!multiple}
        onChange={(e) => {
          const fs = Array.from(e.target.files || []);
          e.target.value = '';
          if (fs.length) onFile(multiple ? fs : fs[0]);
        }} />
      {children}
    </label>
  );
}

export default function ImportPdf({ leito, patient, hoje, tipo: tipoInicial, file: fileInicial, onApply, onClose }) {
  const [tipo, setTipo] = useState(tipoInicial || '');
  const [stage, setStage] = useState(fileInicial ? 'reading' : 'pick');
  const [err, setErr] = useState('');
  const [s, setS] = useState(null);
  const [nome, setNome] = useState('');
  const [texto, setTexto] = useState('');
  const [verTexto, setVerTexto] = useState(false);
  const iniciado = useRef(false);

  async function ler(file, t) {
    if (!file || (Array.isArray(file) && !file.length)) return;
    setTipo(t);
    setStage('reading');
    setErr('');
    try {
      const { pdfToText } = await import('../lib/pdftext.js');
      const arquivos = Array.isArray(file) ? file : [file];
      const textos = [];
      for (const a of arquivos) textos.push(await pdfToText(a));
      const bruto = textos.join('\n');
      if (!bruto.trim()) throw new Error('vazio');
      setTexto(textos.join('\n\n----------\n\n'));
      // Vários laudos: mostra todos os nomes diferentes, para conferir se são do mesmo paciente.
      const nomes = [...new Set(textos.map((x) => header(x, hoje).nome).filter(Boolean))];
      setNome(nomes.join(' / '));
      if (t === 'lab') setS(prepareLab(parseLab(bruto, hoje), patient));
      else if (t === 'imagem') setS(prepareLaudos(textos.flatMap((x) => parseLaudos(x.replace(/\t/g, ' '), hoje)), patient));
      else setS(prepare(parseEvolucao(bruto, hoje), patient, hoje));
      setStage('review');
    } catch (e) {
      console.error('Leitura do PDF:', e);
      setErr(String(e && e.message) === 'vazio'
        ? 'Não achei texto neste PDF. Pode ser um PDF escaneado (imagem), que o app ainda não lê.'
        : 'Não foi possível ler este PDF neste navegador. Tente pelo celular ou por um Chrome atualizado.');
      setStage('pick');
    }
  }

  // Aberto pelo botão da seção (laboratório, gasometria, imagem): o arquivo já vem escolhido.
  useEffect(() => {
    if (fileInicial && !iniciado.current) { iniciado.current = true; ler(fileInicial, tipoInicial || 'evolucao'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (group, i, patch) => setS((cur) => ({ ...cur, [group]: cur[group].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  function aplicar() {
    const on = (arr) => arr.filter((x) => x.on).map(({ on: _o, dup: _d, nota: _n, relatorio: _r, resumo: _s, resumoTxt: _t, completo: _c, ...rest }) => rest);
    let sel;
    let total;
    if (tipo === 'lab') {
      sel = { data: s.data, gasoData: s.data, gasoHora: s.hora, itens: on(s.itens), outros: on(s.outros) };
      total = sel.itens.length + sel.outros.length;
    } else if (tipo === 'imagem') {
      sel = on(s.laudos);
      total = sel.length;
    } else {
      const paciente = Object.fromEntries(s.ids.filter((x) => x.on).map((x) => [x.k, x.value]));
      sel = {
        paciente,
        diagnosticos: on(s.diagnosticos),
        comorbidades: on(s.comorbidades).map((x) => x.t),
        medicacoes: on(s.medicacoes).map((x) => x.t),
        alergias: on(s.alergias).map((x) => x.t),
        dispositivos: on(s.dispositivos),
        atbs: on(s.atbs),
        culturas: on(s.culturas),
        exames: on(s.exames),
        infusoes: on(s.infusoes),
        vent: s.vent && s.vent.on ? (({ on: _o, ...v }) => v)(s.vent) : null,
      };
      total = Object.keys(paciente).length + ['diagnosticos', 'comorbidades', 'medicacoes', 'alergias', 'dispositivos', 'atbs', 'culturas', 'exames', 'infusoes'].reduce((a, k) => a + sel[k].length, 0) + (sel.vent ? 1 : 0);
    }
    setTexto('');
    setS(null);
    setNome('');
    onApply({ tipo: tipo || 'evolucao', sel }, total);
  }

  const nomeTipo = TIPOS[tipo || 'evolucao'].t.toLowerCase();

  return (
    <Modal title={`Importar PDF - leito ${leito}`} onClose={onClose}>
      {stage !== 'review' && (
        <>
          <p style={{ marginTop: 0 }}>O PDF é lido aqui, no aparelho: não vai para a nuvem nem fica guardado no app. Você confere tudo antes de entrar no leito.</p>
          {err && <div className="err">{err}</div>}
          {stage === 'reading'
            ? <div className="calcbox">Lendo o PDF ({nomeTipo})...</div>
            : (
              <div className="row">
                {Object.entries(TIPOS).map(([k, v]) => (
                  <PdfPick key={k} className={'btn block pickopt' + (tipo === k ? ' primary' : '')} multiple={k === 'imagem'} onFile={(f) => ler(f, k)}>
                    <span><Icon name="file" /> {v.t}</span>
                    <span className="pickdesc">{v.d}</span>
                  </PdfPick>
                ))}
              </div>
            )}
          <div className="hint">Depois de importar, apague o PDF baixado do aparelho (o app não consegue apagar arquivos sozinho).</div>
        </>
      )}

      {stage === 'review' && s && (
        <>
          {nome
            ? <div className="banner amber"><span className="grow">Paciente no PDF: <b>{nome}</b>. Confira se é o paciente do leito {leito}. O nome não é salvo.</span></div>
            : <div className="banner amber"><span className="grow">Não achei o nome no PDF: confira se é o paciente do leito {leito}.</span></div>}
          {contar(tipo, s) === 0 && <div className="err">Não reconheci nada neste PDF como {nomeTipo}. Veja o texto lido abaixo; se quiser, apague nome e prontuário e cole na conversa para eu ajustar a leitura.</div>}

          {tipo === 'lab' && <ReviewLab s={s} setS={setS} upd={upd} patient={patient} />}
          {tipo === 'imagem' && <ReviewImagem s={s} upd={upd} />}
          {(tipo === 'evolucao' || !tipo) && <ReviewEvolucao s={s} setS={setS} upd={upd} patient={patient} />}

          <button className="btn sm" onClick={() => setVerTexto(!verTexto)}>{verTexto ? 'Esconder' : 'Ver'} o texto lido do PDF</button>
          {verTexto && <pre className="textout" style={{ marginTop: 8 }}>{texto}</pre>}

          <div className="flex" style={{ marginTop: 14 }}>
            <button className="btn primary grow" onClick={aplicar}><Icon name="check" /> Importar marcados</button>
            <button className="btn" onClick={() => { setTexto(''); setS(null); setNome(''); onClose(); }}>Cancelar</button>
          </div>
          <div className="hint">Depois de importar, apague o PDF baixado do aparelho.</div>
        </>
      )}
    </Modal>
  );
}
