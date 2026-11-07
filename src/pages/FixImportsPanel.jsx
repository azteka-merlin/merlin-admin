import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateTimeBrt } from '../lib/admin-ui';
import AdminTabs from '../components/AdminTabs';

const ROOT='/panel-api/fix-import';
const TABS=[{key:'missing',label:'Não baixados'},{key:'processing',label:'Baixando'},
  {key:'queued',label:'Aguardando'},{key:'migrated',label:'Migrados'},
  {key:'failed',label:'Falhou'},{key:'skipped',label:'Ignorados'}];
const PHASES={checking:'Conferindo override',downloading:'Baixando arquivo',publishing:'Cadastrando fix',
  queued:'Aguardando processamento',migrated:'Migrado',failed:'Falha na importação',skipped:'Ignorado',missing:'Ainda não baixado'};
function size(bytes){return bytes>0?`${(bytes/1024**2).toFixed(1)} MB`:'—';}

export default function FixImportsPanel({apiRequest,notify}) {
  const [snapshot,setSnapshot]=useState(null),[tab,setTab]=useState('missing');
  const [search,setSearch]=useState(''),[selected,setSelected]=useState(new Set());
  const [page,setPage]=useState(1),[limit,setLimit]=useState(50);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const request=useRef(apiRequest),mounted=useRef(false),controller=useRef(null);
  request.current=apiRequest;
  const load=useCallback(async()=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;setLoading(true);
    try {
      const data=await request.current(ROOT,{signal:abort.signal});
      if(mounted.current&&!abort.signal.aborted){setSnapshot(data);setError('');}
    }catch(cause){if(mounted.current&&!abort.signal.aborted)setError(cause.message||'Não foi possível consultar os fixes.');}
    finally{if(mounted.current&&!abort.signal.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;controller.current?.abort();};},[load]);
  const active=(snapshot?.summary?.queued||0)+(snapshot?.summary?.processing||0);
  useEffect(()=>{
    if(!active||error||busy||loading)return;
    const timer=setTimeout(()=>void load(),5000);return()=>clearTimeout(timer);
  },[snapshot,active,error,busy,loading,load]);
  useEffect(()=>{setSelected(new Set());setPage(1);},[tab,search,limit]);
  const jobs=(snapshot?.jobs||[]).filter(job=>job.status===tab&&
    `${job.name} ${job.app_id}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
  const totalPages=Math.max(1,Math.ceil(jobs.length/limit));
  const currentPage=Math.min(page,totalPages),shown=jobs.slice((currentPage-1)*limit,currentPage*limit);
  const canQueue=tab==='missing'||tab==='failed';
  const canReset=['processing','queued','failed'].includes(tab);
  const canSelect=canQueue||canReset;
  const allSelected=shown.length>0&&shown.every(job=>selected.has(job.app_id));
  async function act(action,ids) {
    setBusy(action);
    try {
      const result=await request.current(`${ROOT}/${action}`,{method:'POST',mutate:true,body:ids?{appIds:ids}: {}});
      if(action==='scan')notify(`${result.discovered||0} novos jogos encontrados. Selecione quais colocar na fila.`);
      else if(action==='reset')notify(`${result.reset||0} jogos voltaram para Não baixados.${result.unchanged?` ${result.unchanged} não foram alterados porque já estavam finalizando ou em outro estado.`:''}`);
      else notify(`${result.queued||0} jogos colocados na fila.`);
      if(mounted.current){setSelected(new Set());await load();}
    }catch(cause){notify(cause.message||'Não foi possível atualizar a fila.');}
    finally{if(mounted.current)setBusy('');}
  }
  function toggle(id){setSelected(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});}
  function togglePage(){setSelected(current=>{const next=new Set(current);for(const job of shown){if(allSelected)next.delete(job.app_id);else next.add(job.app_id);}return next;});}
  return <section>
    <div className="page__header page__header--split">
      <div><p className="eyebrow">Correções</p><h1>Importar fixes da Ryuu</h1>
        <p className="page__meta">Selecione os jogos para baixar os arquivos e cadastrar os fixes no Merlin.</p></div>
      <div className="catalog-queue__top-actions">
        <button className="button button--ghost" disabled={loading||!!busy} onClick={()=>void load()}>Atualizar dados</button>
        <button className="button button--primary" disabled={!!busy||loading} onClick={()=>void act('scan')}>{busy==='scan'?'Consultando…':'Consultar catálogo da Ryuu'}</button>
      </div>
    </div>
    <p className="field-grid__note">Consultar o catálogo não inicia downloads. A posição segue a ordem de Correções no momento da consulta; os jogos selecionados são processados nessa ordem. Jogos ocultos, fixes próprios e fixes online ou hypervisor ficam de fora. Overrides de manifest são preservados. Ao salvar um override migrado, a badge de revisão desaparece.</p>
    {snapshot?.isolated&&<div className="notice notice--warning" role="status">Ambiente de teste: arquivos e cadastros desta importação ficam separados dos overrides de produção.</div>}
    {error&&<div className="notice notice--warning" role="alert">{error} <button className="button button--ghost button--sm" disabled={loading} onClick={()=>void load()}>Tentar novamente</button></div>}
    <section className="panel panel--audit catalog-queue">
      <AdminTabs id="fix-import-state" label="Estados da importação" value={tab} onChange={setTab}
        tabs={TABS.map(item=>({value:item.key,label:<><span>{item.label}</span> <strong>{snapshot?.summary?.[item.key]||0}</strong></>}))}/>
      <div role="tabpanel" id={`fix-import-state-panel-${tab}`} aria-labelledby={`fix-import-state-tab-${tab}`} aria-busy={loading}>
      <div className="filters">
        <label className="field-shell field-shell--search"><span>Buscar jogo</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nome ou App ID"/></label>
        <label className="field"><span>Por página</span><select value={limit} onChange={event=>setLimit(Number(event.target.value))}>{[25,50,100,200].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        {canQueue&&<button className="button button--primary" disabled={!selected.size||selected.size>200||!!busy||!!error} onClick={()=>void act('enqueue',[...selected])}>{busy==='enqueue'?'Adicionando…':`${tab==='failed'?'Tentar novamente':'Colocar na fila'}${selected.size?` (${selected.size})`:''}`}</button>}
        {canReset&&<button className="button button--ghost" disabled={!selected.size||selected.size>200||!!busy||!!error} onClick={()=>void act('reset',[...selected])}>{busy==='reset'?'Atualizando…':`Voltar para Não baixados${selected.size?` (${selected.size})`:''}`}</button>}
      </div>
      {selected.size>200&&<p className="custom-game-indexing__error" role="alert">Selecione até 200 jogos por vez.</p>}
      {active>0&&<p className="field-grid__note">O processamento continua com esta página fechada. Os dados são atualizados a cada 5 segundos enquanto há tarefas na fila.</p>}
      {loading&&!snapshot?<div className="empty-state"><h3>Consultando fixes…</h3></div>:!shown.length?<div className="empty-state"><h3>Nenhum jogo nesta seleção</h3><p>{snapshot?.jobs?.length?'Escolha outra aba ou ajuste a busca.':'Use Consultar catálogo da Ryuu para listar os jogos disponíveis, sem iniciar downloads.'}</p></div>:
        <div className="table-shell custom-game-indexing__table-wrap"><table className="custom-game-indexing__table"><thead><tr>
          {canSelect&&<th><input type="checkbox" aria-label="Selecionar jogos desta página" checked={allSelected} onChange={togglePage}/></th>}
          <th>Ordem</th><th>Jogo</th><th>Arquivo</th><th>Andamento</th><th>Atualizado</th><th>Ação</th>
        </tr></thead><tbody>{shown.map(job=><tr key={job.app_id}>
          {canSelect&&<td><input type="checkbox" aria-label={`Selecionar ${job.name}`} checked={selected.has(job.app_id)} onChange={()=>toggle(job.app_id)}/></td>}
          <td>{job.position}</td><td><strong>{job.name}</strong><small>App ID {job.app_id}</small></td><td>{job.filename}<small>{size(job.total_bytes)}</small></td>
          <td><span className={`badge badge--${job.status==='migrated'?'success':job.status==='failed'?'danger':job.status==='processing'?'warning':'muted'}`}>{PHASES[job.phase]||PHASES[job.status]}</span>
            {job.status==='processing'&&<progress aria-label={`Download de ${job.name}`} max="100" {...(job.total_bytes>0?{value:Math.min(100,job.processed_bytes/job.total_bytes*100)}:{})}/>}
            {job.processed_bytes>0&&<small>{size(job.processed_bytes)} / {size(job.total_bytes)}</small>}
            {job.error&&<p className="custom-game-indexing__error">{job.error}</p>}<small>{job.attempts} {job.attempts===1?'tentativa':'tentativas'}</small></td>
          <td>{formatDateTimeBrt(job.updated_at)}</td><td>{canQueue?<button className="button button--ghost button--sm" disabled={!!busy||!!error} onClick={()=>void act('enqueue',[job.app_id])}>{tab==='failed'?'Tentar novamente':'Colocar na fila'}</button>:canReset?<button className="button button--ghost button--sm" disabled={!!busy||!!error} onClick={()=>void act('reset',[job.app_id])}>Voltar para Não baixados</button>:'—'}</td>
        </tr>)}</tbody></table></div>}
      <div className="page__actions"><button className="button button--ghost button--sm" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Anterior</button><span>Página {currentPage} de {totalPages} · {jobs.length} jogos</span><button className="button button--ghost button--sm" disabled={currentPage>=totalPages} onClick={()=>setPage(currentPage+1)}>Próxima</button></div>
      </div>
    </section>
  </section>;
}
