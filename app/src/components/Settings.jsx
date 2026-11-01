import React, { useRef, useState } from 'react';
import { DRUGS } from '../lib/drugs.js';
import { backupBlob, parseBackup } from '../lib/storage.js';
import { todayISO } from '../lib/dates.js';
import { AUTORIA } from '../config.js';
import { Field, Icon } from './ui.jsx';

export default function Settings({ state, mode, email, syncStatus, onSettings, onImport, onSetupSync, onLock, onLogout, version, toast }) {
  const s = state.settings;
  const fileRef = useRef(null);
  const [novoLeito, setNovoLeito] = useState('');

  const setLeitos = (leitos) => onSettings({ ...s, leitos });
  const renomear = (id, label) => setLeitos(s.leitos.map((l) => (l.id === id ? { ...l, label } : l)));
  const remover = (id) => {
    if (state.beds[id] && state.beds[id].patient) { toast('Dê saída do paciente antes de remover o leito.'); return; }
    setLeitos(s.leitos.filter((l) => l.id !== id));
  };
  const adicionar = () => {
    const label = novoLeito.trim() || String(s.leitos.length + 1).padStart(2, '0');
    let n = s.leitos.length + 1;
    while (s.leitos.some((l) => l.id === `b${n}`)) n++;
    setLeitos([...s.leitos, { id: `b${n}`, label }]);
    setNovoLeito('');
  };
  const mover = (i, dir) => {
    const arr = [...s.leitos];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setLeitos(arr);
  };

  function baixar() {
    const url = URL.createObjectURL(backupBlob(state));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ronda-cti-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function restaurar(file) {
    try {
      const st = parseBackup(await file.text());
      if (!window.confirm('Restaurar este backup? Os leitos atuais serão substituídos pelos do arquivo.')) return;
      onImport(st);
      toast('Backup restaurado');
    } catch { toast('Arquivo de backup inválido'); }
  }

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="sections" style={{ gridTemplateColumns: '1fr' }}>
        <div className="sec open">
          <div className="sec-h"><h2>Conta e sincronização</h2></div>
          <div className="sec-b">
            {mode === 'cloud' ? (
              <>
                <p style={{ marginTop: 0 }}>Conectado como <b>{email}</b>. Dados cifrados no aparelho (AES-256) antes de ir para o servidor do Supabase em São Paulo.</p>
                <p className="hint">Status: {syncStatus}</p>
                <div className="flex wrap-f">
                  <button className="btn" onClick={onLock}><Icon name="lock" /> Bloquear agora</button>
                  <button className="btn danger" onClick={onLogout}><Icon name="exit" /> Sair deste aparelho</button>
                </div>
                <p className="hint">Sair apaga deste aparelho a chave e a cópia local; os dados continuam na nuvem para os outros aparelhos.</p>
              </>
            ) : (
              <>
                <p style={{ marginTop: 0 }}>Os dados estão só neste aparelho. Com a sincronização, o que você lança no celular aparece no PC do plantão, cifrado de ponta a ponta.</p>
                <button className="btn primary" onClick={onSetupSync}><Icon name="cloud" /> Ativar sincronização</button>
              </>
            )}
          </div>
        </div>

        <div className="sec open">
          <div className="sec-h"><h2>Unidade e leitos</h2></div>
          <div className="sec-b">
            <div className="row">
              <Field label="Nome da unidade (vai no cabeçalho da evolução)" value={s.unidade} onChange={(v) => onSettings({ ...s, unidade: v })} placeholder="ex.: CTI 1 Neurológico" />
            </div>
            <label>Leitos ({s.leitos.length})</label>
            {s.leitos.map((l, i) => (
              <div className="flex" key={l.id} style={{ marginBottom: 6 }}>
                <input value={l.label} onChange={(e) => renomear(l.id, e.target.value)} style={{ maxWidth: 120 }} aria-label="Nome do leito" />
                <span className="grow hint" style={{ marginTop: 0 }}>{state.beds[l.id] && state.beds[l.id].patient ? 'ocupado' : 'vago'}</span>
                <button className="icon-btn" aria-label="Subir" onClick={() => mover(i, -1)}><span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><Icon name="back" /></span></button>
                <button className="icon-btn" aria-label="Descer" onClick={() => mover(i, 1)}><span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><Icon name="next" /></span></button>
                <button className="icon-btn del" aria-label="Remover leito" onClick={() => remover(l.id)}><Icon name="x" /></button>
              </div>
            ))}
            <div className="flex" style={{ marginTop: 8 }}>
              <input value={novoLeito} onChange={(e) => setNovoLeito(e.target.value)} placeholder="Nome do novo leito" style={{ maxWidth: 220 }} />
              <button className="btn" onClick={adicionar}><Icon name="plus" /> Leito</button>
            </div>
          </div>
        </div>

        <div className="sec open">
          <div className="sec-h"><h2>Diluições padrão (concentração final)</h2></div>
          <div className="sec-b">
            {DRUGS.map((d) => (
              <div className="row c2" key={d.id} style={{ marginBottom: 6 }}>
                <div style={{ alignSelf: 'center' }}><b>{d.nome}</b><div className="hint" style={{ marginTop: 0 }}>{d.diluicao}</div></div>
                <Field num label={`${d.unit} (padrão ${String(d.conc).replace('.', ',')})`}
                  value={s.drugConc[d.id] ?? ''}
                  placeholder={String(d.conc).replace('.', ',')}
                  onChange={(v) => onSettings({ ...s, drugConc: { ...s.drugConc, [d.id]: v } })} />
              </div>
            ))}
            <div className="hint">Deixe em branco para usar o padrão. Pendente de conferência no serviço: amiodarona, dobutamina e dexmedetomidina.</div>
          </div>
        </div>

        <div className="sec open">
          <div className="sec-h"><h2>Backup em arquivo</h2></div>
          <div className="sec-b">
            <p style={{ marginTop: 0 }}>O arquivo sai <b>sem criptografia</b> e contém dados de pacientes: guarde com cuidado e apague quando não precisar mais.</p>
            <div className="flex wrap-f">
              <button className="btn" onClick={baixar}>Baixar backup</button>
              <button className="btn" onClick={() => fileRef.current && fileRef.current.click()}>Restaurar backup</button>
              <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && restaurar(e.target.files[0])} />
            </div>
          </div>
        </div>

        <div className="footer">{AUTORIA}<br />Versão {version}</div>
      </div>
    </div>
  );
}
