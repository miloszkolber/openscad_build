import {useContext} from 'react';
import {ModelContext} from './contexts';
import {Parameter} from '../state/customizer-types';

export default function CustomizerPanel() {
  const model = useContext(ModelContext)!;
  const groups: Record<string, Parameter[]> = {};
  for (const param of model.state.parameterSet?.parameters ?? []) (groups[param.group] ??= []).push(param);
  if (!model.state.params.activePath) return <p className="empty-state">Select a file to see its properties.</p>;
  return <section className="customizer" aria-label="Properties">
    {Object.entries(groups).map(([name, params]) => <details key={name} open><summary>{name}</summary>
      {params.map(param => <ParameterInput key={param.name} param={param} value={model.state.params.vars?.[param.name] ?? param.initial} change={value => model.setVar(param.name, value)} />)}
    </details>)}
    {!Object.keys(groups).length && <p className="empty-state">No customizable properties.</p>}
  </section>;
}

function ParameterInput({param, value, change}: {param: Parameter, value: any, change: (value: any) => void}) {
  const id = `parameter-${param.name}`;
  const options = 'options' in param ? param.options : undefined;
  const numeric = param.type === 'number' ? param : undefined;
  return <div className="parameter"><div className="parameter-row"><label htmlFor={id} title={param.name}>{param.name}</label>
    {options ? <select id={id} value={value} onChange={event => change(options.find(option => String(option.value) === event.target.value)!.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.name}</option>)}
    </select> : param.type === 'boolean' ? <input id={id} type="checkbox" checked={value} onChange={event => change(event.target.checked)} />
      : Array.isArray(param.initial) ? <div className="vector-inputs">{param.initial.map((_, index) => <input key={index} id={index === 0 ? id : undefined}
        aria-label={`${param.name} ${index + 1}`} type="number" value={value[index]} min={numeric?.min} max={numeric?.max} step={numeric?.step ?? 'any'}
        onChange={event => { if (event.target.value === '') return; const next = [...value]; next[index] = Number(event.target.value); change(next); }} />)}</div>
      : <input id={id} type={numeric ? 'number' : 'text'} value={value} min={numeric?.min} max={numeric?.max} step={numeric?.step ?? 'any'}
        onChange={event => { if (numeric && event.target.value === '') return; change(numeric ? Number(event.target.value) : event.target.value); }} />}
    <button className="reset" aria-label={`Reset ${param.name}`} title={`Reset ${param.name}`} disabled={JSON.stringify(value) === JSON.stringify(param.initial)} onClick={() => change(param.initial)}>↺</button>
  </div>{param.caption && <small>{param.caption}</small>}
    {numeric && !Array.isArray(param.initial) && !options && numeric.min !== undefined && numeric.max !== undefined && <input type="range" aria-label={`${param.name} slider`}
      min={numeric.min} max={numeric.max} step={numeric.step ?? 1} value={value} onChange={event => change(Number(event.target.value))} />}
  </div>;
}
