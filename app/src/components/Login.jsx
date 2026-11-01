import React, { useState } from 'react';
import { Field } from './ui.jsx';

// Entrar, criar conta ou desbloquear. A senha cifra os dados: não há como recuperá-la.
export default function Login({ email: emailInicial, locked, onSubmit, onCancel, onForget, busy }) {
  const [email, setEmail] = useState(emailInicial || '');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [criar, setCriar] = useState(false);
  const [msg, setMsg] = useState(null);

  async function enviar(e) {
    e.preventDefault();
    setMsg(null);
    if (criar) {
      if (senha.length < 8) { setMsg({ err: 'Use pelo menos 8 caracteres. Uma frase curta é mais segura e fácil de lembrar.' }); return; }
      if (senha !== senha2) { setMsg({ err: 'As senhas não conferem.' }); return; }
    }
    const r = await onSubmit({ email, password: senha, remember: lembrar, create: criar });
    if (r && r.needsConfirm) {
      setCriar(false);
      setSenha2('');
      setMsg({ ok: `Conta criada. O Supabase mandou um e-mail para ${email}: toque em "Confirm your mail". Pode abrir uma página de erro depois; a conta fica confirmada mesmo assim. Volte aqui e entre com a mesma senha.` });
    } else if (r && r.error) setMsg({ err: r.error });
  }

  return (
    <div className="lockwrap">
      <form className="lockcard" onSubmit={enviar}>
        <div className="logo">
          <img src="icons/icon-192.png" alt="" />
          <div>
            <h1>Ronda CTI</h1>
            <div className="hint" style={{ marginTop: 0 }}>{locked ? 'Bloqueado. Digite a senha para abrir.' : 'Sincronização com criptografia de ponta a ponta'}</div>
          </div>
        </div>
        {!locked && (
          <p style={{ marginTop: 0 }}>
            Os dados são cifrados neste aparelho antes de ir para o servidor, que só guarda texto embaralhado.
            A senha é a chave: <b>se você esquecê-la, os dados da nuvem não podem ser recuperados</b>.
          </p>
        )}
        {msg && msg.err && <div className="err">{msg.err}</div>}
        {msg && msg.ok && <div className="okmsg">{msg.ok}</div>}
        <div className="row">
          <Field label="E-mail" type="email" value={email} onChange={setEmail}
            hint={criar ? 'Use o mesmo e-mail da sua conta do Supabase (é o único que recebe o e-mail de confirmação).' : undefined} />
          <Field label="Senha" type="password" value={senha} onChange={setSenha} />
          {criar && <Field label="Repita a senha" type="password" value={senha2} onChange={setSenha2} />}
        </div>
        <label className="check-line">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
          <span>Lembrar neste aparelho (só no seu celular; <b>não marque no computador do hospital</b>, que bloqueia sozinho após 15 minutos sem uso)</span>
        </label>
        <button className="btn navy block" type="submit" disabled={busy}>
          {busy ? 'Abrindo...' : criar ? 'Criar conta' : locked ? 'Desbloquear' : 'Entrar'}
        </button>
        {!locked && (
          <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={() => { setCriar(!criar); setMsg(null); }}>
            {criar ? 'Já tenho conta: entrar' : 'Primeira vez: criar conta'}
          </button>
        )}
        {onCancel && <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={onCancel}>Continuar sem sincronizar</button>}
        {locked && onForget && (
          <button type="button" className="btn block danger" style={{ marginTop: 8 }} onClick={onForget}>Sair deste aparelho</button>
        )}
      </form>
    </div>
  );
}
