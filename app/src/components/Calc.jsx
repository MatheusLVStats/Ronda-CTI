import React, { useState } from 'react';
import { DRUGS, DOSE_UNITS, concFor, computeDose, needsWeight } from '../lib/drugs.js';
import { fmtNum, has } from '../lib/format.js';
import { Field } from './ui.jsx';

// Calculadora: droga -> concentração (padrão do CTI, editável) -> vazão da bomba -> dose.
export default function Calc({ state }) {
  const [drugId, setDrugId] = useState('');
  const [conc, setConc] = useState('');
  const [unit, setUnit] = useState('mcg/mL');
  const [vazao, setVazao] = useState('');
  const [peso, setPeso] = useState('');
  const [manualDose, setManualDose] = useState('mcg/kg/min');

  const drug = DRUGS.find((d) => d.id === drugId) || null;
  const pick = (id) => {
    setDrugId(id);
    const d = DRUGS.find((x) => x.id === id);
    if (d) { setConc(String(concFor(d, state.settings.drugConc)).replace('.', ',')); setUnit(d.unit); }
    else { setConc(''); setUnit('mcg/mL'); }
  };
  const units = drug ? drug.doses : [manualDose];
  const leitos = state.settings.leitos.filter((l) => state.beds[l.id] && state.beds[l.id].patient && has(state.beds[l.id].patient.peso));

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="sec open">
        <div className="sec-h"><h2>Dose pela vazão da bomba</h2></div>
        <div className="sec-b">
          <div className="row">
            <div>
              <label>Droga</label>
              <select value={drugId} onChange={(e) => pick(e.target.value)}>
                <option value="">Selecionar</option>
                {DRUGS.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                <option value="_manual">Outra (manual)</option>
              </select>
            </div>
          </div>
          {drugId && (
            <>
              <div className="row c2">
                <Field label="Concentração final" num value={conc} onChange={setConc} hint={drug ? `Padrão do CTI: ${drug.diluicao}` : undefined} />
                <div>
                  <label>Unidade</label>
                  <select value={unit} disabled={!!drug} onChange={(e) => setUnit(e.target.value)}>
                    <option value="mcg/mL">mcg/mL</option>
                    <option value="mg/mL">mg/mL</option>
                    <option value="UI/mL">UI/mL</option>
                  </select>
                </div>
              </div>
              <div className="row c2">
                <Field label="Vazão na bomba (ml/h)" num value={vazao} onChange={setVazao} />
                <Field label="Peso (kg)" num value={peso} onChange={setPeso} />
              </div>
              {leitos.length > 0 && (
                <div className="row"><div>
                  <label>Usar o peso de um leito</label>
                  <select value="" onChange={(e) => { const b = state.beds[e.target.value]; if (b && b.patient) setPeso(b.patient.peso); }}>
                    <option value="">Selecionar leito</option>
                    {leitos.map((l) => <option key={l.id} value={l.id}>Leito {l.label} - {state.beds[l.id].patient.peso} kg</option>)}
                  </select>
                </div></div>
              )}
              {!drug && (
                <div className="row"><div>
                  <label>Unidade da dose</label>
                  <select value={manualDose} onChange={(e) => setManualDose(e.target.value)}>
                    {DOSE_UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div></div>
              )}
              {has(vazao) && has(conc) && (
                <div className="row">
                  {units.map((u) => {
                    const v = computeDose(vazao, conc, unit, u, peso);
                    return (
                      <div className="calcbox" key={u}>
                        {v === null ? (needsWeight(u) ? `Informe o peso para ${u}` : `Unidade incompatível: ${u}`) : <><b>{fmtNum(v)}</b> {u}</>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <div className="hint">Ferramenta de apoio. Confira a diluição e a dose antes de prescrever ou programar a bomba. As concentrações padrão ficam em Ajustes.</div>
        </div>
      </div>
    </div>
  );
}
