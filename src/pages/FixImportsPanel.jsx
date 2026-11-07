import { sha256 } from '@noble/hashes/sha2.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateTimeBrt } from '../lib/admin-ui';
import AdminTabs from '../components/AdminTabs';

const ROOT='/panel-api/fix-import';
const SESSION_KEY='merlin.fix-import.local-lease';
const CLEANUP_KEY='merlin.fix-import.pending-cleanup';
const MAX_BYTES=2*1024*1024*1024;
const LOCAL_IO_TIMEOUT_MS=60_000;
const LOCAL_IO_CLEANUP_TIMEOUT_MS=5_000;
const TABS=[{key:'missing',label:'Não baixados'},{key:'processing',label:'Baixando'},
  {key:'queued',label:'Aguardando'},{key:'migrated',label:'Migrados'},
  {key:'failed',label:'Falhou'},{key:'skipped',label:'Ignorados'}];
const PHASES={checking:'Conferindo override',downloading:'Baixando arquivo',publishing:'Cadastrando fix',
  local_queued:'Aguardando a fila do PC',local_downloading:'Baixando para o PC',local_upload_ready:'Pronto para enviar ao R2',
  local_uploading:'Enviando do PC ao R2',local_finalizing:'Confirmando arquivo no R2',local_publishing:'Cadastrando fix',queued:'Aguardando processamento',
  migrated:'Migrado',failed:'Falha na importação',skipped:'Ignorado',missing:'Ainda não baixado'};
function size(bytes){return bytes>0?`${(bytes/1024**2).toFixed(1)} MB`:'—';}
function safeName(value,fallback){
  const cleaned=String(value||'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim();
  return cleaned||fallback;
}
function safeFilename(value){
  const base=String(value||'arquivo.zip').split(/[\\/]/).pop();
  return safeName(base,'arquivo.zip');
}
function validArchiveHeader(header,filename){
  const ext=String(filename).split('.').pop()?.toLowerCase();
  if(ext==='zip')return header.length>=4&&header[0]===0x50&&header[1]===0x4b&&
    [[0x03,0x04],[0x05,0x06],[0x07,0x08]].some(([a,b])=>header[2]===a&&header[3]===b);
  return ext==='rar'&&header.length>=8&&header[0]===0x52&&header[1]===0x61&&header[2]===0x72&&
    header[3]===0x21&&header[4]===0x1a&&header[5]===0x07&&
    (header[6]===0x00||(header[6]===0x01&&header[7]===0x00));
}
function toHex(bytes){return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');}
function pendingCleanup(){
  try { return JSON.parse(localStorage.getItem(CLEANUP_KEY)||'{}'); } catch { return {}; }
}
function rememberCleanup(appId,digest){
  try {
    const pending=pendingCleanup();
    if(digest)pending[appId]=digest;
    else delete pending[appId];
    localStorage.setItem(CLEANUP_KEY,JSON.stringify(pending));
  } catch {}
}
function gameFolder(job){return `${job.app_id} - ${safeName(job.name,`Jogo ${job.app_id}`)}`;}

function awaitLocalIo(operation,stage,abort){
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=window.setTimeout(()=>{
      abort.abort();
      const error=new Error(`${stage} ficou 60 segundos sem avançar.`);
      error.code='LOCAL_IO_TIMEOUT';
      reject(error);
    },LOCAL_IO_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(operation),timeout]).finally(()=>window.clearTimeout(timer));
}

async function settleLocalIoCleanup(operations){
  if(!operations.length)return;
  let timer;
  try{
    await Promise.race([
      Promise.allSettled(operations),
      new Promise(resolve=>{timer=window.setTimeout(resolve,LOCAL_IO_CLEANUP_TIMEOUT_MS);})
    ]);
  }finally{window.clearTimeout(timer);}
}

export default function FixImportsPanel({apiRequest,apiUpload,notify}) {
  const [snapshot,setSnapshot]=useState(null),[tab,setTab]=useState('missing');
  const [search,setSearch]=useState(''),[selected,setSelected]=useState(new Set());
  const [tagFilter,setTagFilter]=useState('');
  const [page,setPage]=useState(1),[limit,setLimit]=useState(50);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [task,setTask]=useState(null),[direct,setDirect]=useState(false);
  const request=useRef(apiRequest),upload=useRef(apiUpload),mounted=useRef(false),controller=useRef(null),folderRef=useRef(null),running=useRef(false);
  request.current=apiRequest;upload.current=apiUpload;
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
  const pending=pendingCleanup();
  const cleanupPending=snapshot?.jobs?.some(job=>job.status==='migrated'&&job.sha256&&pending[job.app_id]===job.sha256);
  useEffect(()=>{
    if(!active||error||busy||loading)return;
    const timer=setTimeout(()=>void load(),5000);return()=>clearTimeout(timer);
  },[snapshot,active,error,busy,loading,load]);
  useEffect(()=>{setSelected(new Set());setPage(1);},[tab,search,limit,tagFilter]);
  const missingJobs=(snapshot?.jobs||[]).filter(job=>job.status==='missing');
  const tags=[...new Set(missingJobs.flatMap(job=>job.tags||[]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const hasUnknownTags=missingJobs.some(job=>job.tags==null);
  useEffect(()=>{
    if(snapshot&&tagFilter.startsWith('tag:')&&!tags.includes(tagFilter.slice(4)))setTagFilter('');
  },[snapshot,tagFilter]);
  const jobs=(snapshot?.jobs||[]).filter(job=>job.status===tab&&
    (tab!=='missing'||!tagFilter||(tagFilter==='untagged'
      ? Array.isArray(job.tags)&&job.tags.length===0
      : job.tags?.includes(tagFilter.slice(4))))&&
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
      else notify(`${result.queued||0} jogos colocados na fila do seu PC.`);
      if(mounted.current){setSelected(new Set());await load();}
    }catch(cause){notify(cause.message||'Não foi possível atualizar a fila.');}
    finally{if(mounted.current)setBusy('');}
  }
  function toggle(id){setSelected(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});}
  function togglePage(){setSelected(current=>{const next=new Set(current);for(const job of shown){if(allSelected)next.delete(job.app_id);else next.add(job.app_id);}return next;});}

  async function ensureLocalFolder(){
    if(!window.showDirectoryPicker)throw new Error('Este navegador não permite salvar arquivos diretamente em Documentos. Abra o painel no Chrome ou Edge atualizado.');
    let handle=folderRef.current;
    if(!handle){
      handle=await window.showDirectoryPicker({id:'merlin-fix-import-documents',mode:'readwrite',startIn:'documents'});
      if(handle.name.toLocaleLowerCase('pt-BR')!=='jogos-fixes')
        throw new Error('Selecione Documentos\\jogos-fixes. Se a pasta ainda não existir, crie-a no Explorador de Arquivos e selecione essa subpasta.');
      folderRef.current=handle;
    }
    let permission=await handle.queryPermission({mode:'readwrite'});
    if(permission!=='granted')permission=await handle.requestPermission({mode:'readwrite'});
    if(permission!=='granted')throw new Error('O navegador não recebeu permissão para salvar na pasta Documentos.');
    return handle;
  }

  async function readLocalArchive(gameDir,filename,expectedBytes,allowUnknown){
    try {
      const file=await (await gameDir.getFileHandle(filename)).getFile();
      if((expectedBytes<=0&&!allowUnknown)||(expectedBytes>0&&file.size!==expectedBytes)||file.size<8||file.size>MAX_BYTES)return null;
      const header=new Uint8Array(await file.slice(0,8).arrayBuffer());
      return validArchiveHeader(header,filename)?file:null;
    } catch(error) {
      if(error.name==='NotFoundError')return null;
      throw error;
    }
  }

  async function hashArchive(file) {
    const digest=sha256.create();
    for await (const chunk of file.stream())digest.update(chunk);
    return toHex(digest.digest());
  }

  async function cleanArchive(job,rootHandle,digest){
    if(!digest)return false;
    try {
      const folder=await rootHandle.getDirectoryHandle(gameFolder(job));
      const filename=safeFilename(job.filename);
      const file=await readLocalArchive(folder,filename,job.total_bytes,false);
      if(!file || await hashArchive(file)!==digest) {
        // A missing or replaced file is no longer ours to remove.
        rememberCleanup(job.app_id,null);
        return false;
      }
      await folder.removeEntry(filename);
      rememberCleanup(job.app_id,null);
      return true;
    } catch(error) {
      if(error.name==='NotFoundError'){
        rememberCleanup(job.app_id,null);
        return true;
      }
      return false;
    }
  }

  async function downloadArchive(job,path,token,gameDir,filename,show) {
    show('local_downloading',0,0);
    const started=performance.now(), abort=new AbortController();
    let reader, writer;
    try {
      const response=await awaitLocalIo(
        request.current(`${path}/source`,{headers:{'X-Fix-Import-Lease':token},rawResponse:true,signal:abort.signal}),
        'A resposta da Ryuu',abort);
      if(!response.body)throw new Error('A resposta da Ryuu veio vazia.');
      reader=response.body.getReader();
      const declared=Number(response.headers.get('content-length')||0);
      const handle=await gameDir.getFileHandle(filename,{create:true});
      writer=await handle.createWritable();
      const digest=sha256.create();
      let bytes=0,lastReport=performance.now(),lastUi=0;
      const header=new Uint8Array(8);
      while(true) {
        const {done,value}=await awaitLocalIo(reader.read(),'O recebimento do arquivo',abort);
        if(done)break;
        if(bytes<8)header.set(value.subarray(0,8-bytes),bytes);
        bytes+=value.byteLength;
        if(bytes>MAX_BYTES)throw new Error('O arquivo ultrapassa o limite de 2 GiB.');
        if(bytes>=8&&!validArchiveHeader(header,filename))throw new Error('A Ryuu não retornou um ZIP ou RAR válido.');
        digest.update(value);
        await awaitLocalIo(writer.write(value),'A gravação do arquivo no PC',abort);
        const now=performance.now();
        if(now-lastUi>=200){
          show('local_downloading',bytes,declared,{speed:bytes/Math.max(0.001,(now-started)/1000)});
          lastUi=now;
        }
        if(now-lastReport>=5000){
          lastReport=now;
          void request.current(`${ROOT}/local/progress`,{method:'POST',mutate:true,body:{appId:job.app_id,leaseToken:token,bytes}}).catch(()=>{});
        }
      }
      if(bytes<8||(declared&&bytes!==declared))throw new Error('O download terminou com o arquivo incompleto.');
      await awaitLocalIo(writer.close(),'A finalização do arquivo no PC',abort);
      return {file:await handle.getFile(),digest:toHex(digest.digest()),downloadMs:Math.round(performance.now()-started)};
    } catch(error) {
      const cleanup=[];
      if(reader)cleanup.push(Promise.resolve().then(()=>reader.cancel()).catch(()=>{}));
      if(writer)cleanup.push(Promise.resolve().then(()=>writer.abort()).catch(()=>{}));
      await settleLocalIoCleanup(cleanup);
      if(error?.code==='LOCAL_IO_TIMEOUT')throw error;
      if(abort.signal.aborted)throw new Error('O download foi interrompido antes de concluir.');
      throw error;
    } finally {
      try{reader?.releaseLock();}catch{}
    }
  }

  async function processOne(job,token,rootHandle){
    const folderName=gameFolder(job);
    const filename=safeFilename(job.filename),path=`${ROOT}/local/${job.app_id}`;
    const post=(suffix,body={})=>request.current(path+suffix,{method:'POST',mutate:true,body:{leaseToken:token,...body}});
    const show=(phase,bytes,total,extra={})=>setTask({appId:job.app_id,name:job.name,phase,bytes,total,...extra});
    const gameDir=await rootHandle.getDirectoryHandle(folderName,{create:true});
    let localFile,digest=job.sha256;
    if(!['local_publishing','local_finalizing'].includes(job.phase)){
      localFile=await readLocalArchive(gameDir,filename,job.total_bytes,direct);
      if(!localFile&&direct)throw new Error(`Baixe pela Ryuu e salve como ${folderName}\\${filename}.`);
      const archive=localFile
        ? {file:localFile,digest:await hashArchive(localFile)}
        : await downloadArchive(job,path,token,gameDir,filename,show);
      localFile=archive.file;
      digest=archive.digest;
      const bytes=localFile.size;
      const header=new Uint8Array(await localFile.slice(0,8).arrayBuffer());
      await post('/downloaded',{bytes,signature:toHex(header),sha256:digest,downloadMs:archive.downloadMs});
      rememberCleanup(job.app_id,digest);
      const started=await post('/upload/start');
      const confirmedParts=started.parts?.length||0;
      show('local_uploading',Math.min(bytes,confirmedParts*started.partBytes),bytes);
      for(let partNumber=confirmedParts+1;partNumber<=started.partCount;partNumber++){
        const start=(partNumber-1)*started.partBytes,end=Math.min(bytes,start+started.partBytes);
        const chunk=localFile.slice(start,end);
        for(let attempt=0;;attempt++){
          try {
            await upload.current(`${path}/upload/part`,chunk,{mutate:true,timeoutMs:120_000,
              headers:{'Content-Type':'application/octet-stream','X-Fix-Import-Lease':token,'X-Fix-Import-Part-Number':String(partNumber)},
              onProgress:event=>show('local_uploading',start,bytes,{sending:start+event.loaded})});
            break;
          } catch(error) {
            if(attempt>=1||(error.status&&![502,503,504].includes(error.status)))throw error;
          }
        }
        show('local_uploading',end,bytes);
      }
    }
    show('local_publishing',job.total_bytes,job.total_bytes);
    const result=await post('/upload/complete');
    if(result.status!=='migrated'){
      rememberCleanup(job.app_id,null);
      return 'skipped';
    }
    return await cleanArchive({...job,total_bytes:localFile?.size||job.total_bytes},rootHandle,result.sha256||digest)
      ? 'migrated' : 'cleanup-failed';
  }

  async function startLocalQueue(){
    if(running.current)return;
    setBusy('start-local');setError('');let token='';let currentJob=null;running.current=true;
    let heartbeat,failureMessage='',failed=0,cleanupFailed=0,migrated=0,releaseBrowserLock;
    try{
      const rootHandle=await ensureLocalFolder();
      if(navigator.locks){
        const acquired=await new Promise((resolve,reject)=>{
          navigator.locks.request(SESSION_KEY,{ifAvailable:true},lock=>{
            if(!lock){resolve(false);return;}
            return new Promise(release=>{releaseBrowserLock=release;resolve(true);});
          }).catch(reject);
        });
        if(!acquired)throw new Error('A fila já está aberta em outra aba.');
      }
      const pending=pendingCleanup();
      const fresh=await request.current(ROOT);
      for(const job of fresh.jobs||[]){
        if(job.status==='migrated'&&job.sha256&&pending[job.app_id]===job.sha256)
          await cleanArchive(job,rootHandle,job.sha256);
      }
      let previousToken='';try{previousToken=window.sessionStorage.getItem(SESSION_KEY)||'';}catch{}
      let first;
      try{first=await request.current(`${ROOT}/local/next`,{method:'POST',mutate:true,body:{leaseToken:previousToken}});}
      catch(cause){
        if(!previousToken||cause.status!==409)throw cause;
        try{window.sessionStorage.removeItem(SESSION_KEY);}catch{}
        first=await request.current(`${ROOT}/local/next`,{method:'POST',mutate:true,body:{leaseToken:''}});
      }
      token=first.leaseToken||'';
      if(token)try{window.sessionStorage.setItem(SESSION_KEY,token);}catch{}
      if(!first.job){try{window.sessionStorage.removeItem(SESSION_KEY);}catch{}notify('Não há jogos aguardando na fila do PC.');return;}
      heartbeat=setInterval(()=>{if(token)void request.current(`${ROOT}/local/heartbeat`,{method:'POST',mutate:true,body:{leaseToken:token}}).catch(()=>{});},30_000);
      let next=first;
      while(next.job){
        currentJob=next.job;
        try {
          const result=await processOne(currentJob,token,rootHandle);
          if(result!=='skipped')migrated++;
          if(result==='cleanup-failed')cleanupFailed++;
        } catch(cause) {
          if([401,403,409,429].includes(cause.status)||['NotAllowedError','SecurityError','QuotaExceededError'].includes(cause.name))throw cause;
          await request.current(`${ROOT}/local/fail`,{method:'POST',mutate:true,body:{appId:currentJob.app_id,leaseToken:token}});
          notify(`${currentJob.name}: ${cause.message||'falha na importação'}`);
          failed++;
        }
        await load();
        next=await request.current(`${ROOT}/local/next`,{method:'POST',mutate:true,body:{leaseToken:token}});
        token=next.leaseToken||'';currentJob=null;
        if(token)try{window.sessionStorage.setItem(SESSION_KEY,token);}catch{}
      }
      try{window.sessionStorage.removeItem(SESSION_KEY);}catch{}
      setTask(null);notify(`Fila concluída. ${migrated} migrados, ${failed} com falha.${cleanupFailed?` ${cleanupFailed} arquivos locais não puderam ser excluídos.`:''}`);
    }catch(cause){
      if(cause.name!=='AbortError')failureMessage=cause.message||'Não foi possível executar a fila local.';
    }finally{
      if(heartbeat)clearInterval(heartbeat);running.current=false;
      releaseBrowserLock?.();
      if(mounted.current){setTask(null);setBusy('');await load();if(failureMessage)setError(failureMessage);}
    }
  }

  return <section>
    <div className="page__header page__header--split">
      <div><p className="eyebrow">Correções</p><h1>Importar fixes da Ryuu</h1>
        <p className="page__meta">Os arquivos são baixados no seu PC e depois enviados ao R2 para cadastrar o fix no Merlin.</p></div>
      <div className="catalog-queue__top-actions">
        <button className="button button--ghost" disabled={loading||!!busy} onClick={()=>void load()}>Atualizar dados</button>
        <button className="button button--ghost" disabled={!!busy||loading} onClick={()=>void act('scan')}>{busy==='scan'?'Consultando…':'Consultar catálogo da Ryuu'}</button>
        <button className="button button--primary" disabled={!!busy||loading||!(snapshot?.localQueued||snapshot?.summary?.processing||cleanupPending)} onClick={()=>void startLocalQueue()}>{busy==='start-local'?'Processando no PC…':'Iniciar fila no PC'}</button>
      </div>
    </div>
    <p className="field-grid__note">Ao iniciar, selecione a pasta <code>Documentos\jogos-fixes</code>. Se ainda não existir, crie-a uma vez no Explorador de Arquivos. Cada arquivo será salvo em <code>Documentos\jogos-fixes\&lt;AppID&gt; - &lt;nome do jogo&gt;\&lt;arquivo&gt;</code>. O navegador bloqueia a seleção da raiz de Documentos, então o painel pede acesso somente à subpasta. O envio ao R2 começa após o download. A cópia local é excluída quando o cadastro do fix for confirmado. Em caso de falha, ela é mantida para tentar novamente. A ordem segue a tela Correções; jogos ocultos, fixes próprios, fixes online e hypervisor ficam de fora. Overrides de manifest são preservados.</p>
    <label className="field-grid__note">
      <input type="checkbox" checked={direct} disabled={!!busy} onChange={event=>setDirect(event.target.checked)}/>
      {' '}Usar arquivos já baixados pela Ryuu
    </label>
    {direct&&<p className="field-grid__note">Abra o link da Ryuu com sua sessão ativa e salve o pacote na pasta do jogo, com o nome exibido na tabela. A fila só importa os arquivos encontrados no PC.</p>}
    {snapshot?.isolated&&<div className="notice notice--warning" role="status">Ambiente de teste: arquivos e cadastros desta importação ficam separados dos overrides de produção.</div>}
    {error&&<div className="notice notice--warning" role="alert">{error} <button className="button button--ghost button--sm" disabled={loading||!!busy} onClick={()=>void load()}>Tentar novamente</button></div>}
    {task&&<div className="notice" role="status"><strong>{task.name}</strong> · {PHASES[task.phase]||'Processando'}
      {task.total>0?<><progress max="100" value={Math.min(100,task.bytes/task.total*100)}/><small>{size(task.bytes)} / {size(task.total)}{task.sending!=null?` confirmados no R2 · ${size(task.sending)} enviados`:task.speed?` · ${size(task.speed)}/s`:null}</small></>:
        task.bytes>0&&<small>{size(task.bytes)} baixados</small>}</div>}
    <section className="panel panel--audit catalog-queue">
      <AdminTabs id="fix-import-state" label="Estados da importação" value={tab} onChange={setTab}
        tabs={TABS.map(item=>({value:item.key,label:<><span>{item.label}</span> <strong>{snapshot?.summary?.[item.key]||0}</strong></>}))}/>
      <div role="tabpanel" id={`fix-import-state-panel-${tab}`} aria-labelledby={`fix-import-state-tab-${tab}`} aria-busy={loading}>
      <div className="filters">
        <label className="field-shell field-shell--search"><span>Buscar jogo</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nome ou App ID"/></label>
        {tab==='missing'&&<label className="field"><span>Tag da Ryuu</span>
          <select value={tagFilter} onChange={event=>setTagFilter(event.target.value)}>
            <option value="">Todos</option>
            <option value="untagged">Sem tag</option>
            {tags.map(tag=><option key={tag} value={`tag:${tag}`}>{tag}</option>)}
          </select>
        </label>}
        <label className="field"><span>Por página</span><select value={limit} onChange={event=>setLimit(Number(event.target.value))}>{[25,50,100,200].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        {canQueue&&<button className="button button--primary" disabled={!selected.size||selected.size>200||!!busy||!!error} onClick={()=>void act('local/enqueue',[...selected])}>{busy==='local/enqueue'?'Adicionando…':`${tab==='failed'?'Tentar novamente':'Colocar na fila do PC'}${selected.size?` (${selected.size})`:''}`}</button>}
        {canReset&&<button className="button button--ghost" disabled={!selected.size||selected.size>200||!!busy||!!error} onClick={()=>void act('reset',[...selected])}>{busy==='reset'?'Atualizando…':`Voltar para Não baixados${selected.size?` (${selected.size})`:''}`}</button>}
      </div>
      {selected.size>200&&<p className="custom-game-indexing__error" role="alert">Selecione até 200 jogos por vez.</p>}
      {tab==='missing'&&hasUnknownTags&&<p className="field-grid__note">Use “Consultar catálogo da Ryuu” para atualizar as tags dos jogos já listados.</p>}
      {active>0&&<p className="field-grid__note">Aguardando: {snapshot?.localQueued||0} · Baixando/enviando: {snapshot?.summary?.processing||0}. A lista atualiza a cada 5 segundos enquanto houver tarefas.</p>}
      {loading&&!snapshot?<div className="empty-state"><h3>Consultando fixes…</h3></div>:!shown.length?<div className="empty-state"><h3>Nenhum jogo nesta seleção</h3><p>{snapshot?.jobs?.length?'Escolha outra aba ou ajuste a busca.':'Use Consultar catálogo da Ryuu para listar os jogos disponíveis, sem iniciar downloads.'}</p></div>:
        <div className="table-shell custom-game-indexing__table-wrap"><table className="custom-game-indexing__table"><thead><tr>
          {canSelect&&<th><input type="checkbox" aria-label="Selecionar jogos desta página" checked={allSelected} onChange={togglePage}/></th>}
          <th>Ordem</th><th>Jogo</th><th>Arquivo</th><th>Andamento</th><th>Atualizado</th><th>Ação</th>
        </tr></thead><tbody>{shown.map(job=><tr key={job.app_id}>
          {canSelect&&<td><input type="checkbox" aria-label={`Selecionar ${job.name}`} checked={selected.has(job.app_id)} onChange={()=>toggle(job.app_id)}/></td>}
          <td>{job.position}</td><td><strong>{job.name}</strong><small>App ID {job.app_id}</small></td><td>{job.filename}<small>{size(job.total_bytes)}</small>{direct&&job.directDownloadUrl&&<small><a href={job.directDownloadUrl} target="_blank" rel="noopener noreferrer">Baixar na Ryuu</a></small>}</td>
          <td><span className={`badge badge--${job.status==='migrated'?'success':job.status==='failed'?'danger':job.status==='processing'?'warning':'muted'}`}>{PHASES[job.phase]||PHASES[job.status]}</span>
            {job.status==='processing'&&<progress aria-label={`Importação de ${job.name}`} max="100" {...(job.total_bytes>0?{value:Math.min(100,job.processed_bytes/job.total_bytes*100)}:{})}/>}
            {job.processed_bytes>0&&<small>{size(job.processed_bytes)} / {size(job.total_bytes)}</small>}
            {job.error&&<p className="custom-game-indexing__error">{job.error}</p>}<small>{job.attempts} {job.attempts===1?'tentativa':'tentativas'}</small></td>
          <td>{formatDateTimeBrt(job.updated_at)}</td><td>{canQueue?<button className="button button--ghost button--sm" disabled={!!busy||!!error} onClick={()=>void act('local/enqueue',[job.app_id])}>{tab==='failed'?'Tentar novamente':'Colocar na fila do PC'}</button>:canReset?<button className="button button--ghost button--sm" disabled={!!busy||!!error} onClick={()=>void act('reset',[job.app_id])}>Voltar para Não baixados</button>:'—'}</td>
        </tr>)}</tbody></table></div>}
      <div className="page__actions"><button className="button button--ghost button--sm" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Anterior</button><span>Página {currentPage} de {totalPages} · {jobs.length} jogos</span><button className="button button--ghost button--sm" disabled={currentPage>=totalPages} onClick={()=>setPage(currentPage+1)}>Próxima</button></div>
      </div>
    </section>
  </section>;
}
