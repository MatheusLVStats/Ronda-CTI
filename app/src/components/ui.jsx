import React, { useState } from 'react';

// Ícones simples em SVG (traço), sem dependências externas.
const P = {
  copy: 'M8 8h11v13H8zM5 16H4V3h11v1',
  clip: 'M9 4h6v3H9zM7 5H5v16h14V5h-2',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
  print: 'M6 9V3h12v6M6 18H4v-8h16v8h-2M7 14h10v7H7z',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h1M14 12h1M9 16h1M14 16h1',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  chev: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  exit: 'M10 17l-5-5 5-5M5 12h11M14 4h5v16h-5',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z',
};

export function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      <path d={P[name]} />
    </svg>
  );
}

export function Section({ title, summary, open, onToggle, wide, children, extra }) {
  return (
    <section className={'sec' + (open ? ' open' : '') + (wide ? ' wide' : '')}>
      <button className="sec-h" onClick={onToggle} aria-expanded={open}>
        <h2>{title}</h2>
        {extra}
        <span className="sum">{!open ? summary : ''}</span>
        <span className="chev"><Icon name="chev" /></span>
      </button>
      {open && <div className="sec-b">{children}</div>}
    </section>
  );
}

// Campo de texto. num=true abre o teclado numérico com vírgula.
export function Field({ label, value, onChange, placeholder, num, type, hint, prev, id }) {
  return (
    <div>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        type={type || 'text'}
        inputMode={num ? 'decimal' : undefined}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {prev && <div className="prev">{prev}</div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Area({ label, value, onChange, placeholder, rows = 3, hint }) {
  return (
    <div>
      {label && <label>{label}</label>}
      <textarea rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Seg({ options, value, onChange, cls }) {
  return (
    <div className="seg">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        const on = value === v;
        return (
          <button key={v} type="button" className={on ? (cls && cls[v]) || 'on' : ''} onClick={() => onChange(on ? '' : v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="flex" style={{ marginBottom: 8 }}>
          <h3 className="grow" style={{ margin: 0 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* cai para o método antigo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export function TextModal({ title, text, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <pre className="textout">{text}</pre>
      <div className="flex">
        <button className="btn primary grow" onClick={async () => { const ok = await copyText(text); setCopied(ok ? 'ok' : 'fail'); }}>
          <Icon name="copy" /> {copied === 'ok' ? 'Copiado' : 'Copiar texto'}
        </button>
        <button className="btn" onClick={onClose}>Fechar</button>
      </div>
      {copied === 'fail' && <div className="hint">Não deu para copiar automaticamente: selecione o texto acima e copie.</div>}
      <div className="hint">Revise antes de colar. O texto usa só caracteres que o TI MED aceita.</div>
    </Modal>
  );
}
