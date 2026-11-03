const fs=require('node:fs'),path=require('node:path'),{execFile,spawn}=require('node:child_process'),{promisify}=require('node:util'),crypto=require('node:crypto');
const run=promisify(execFile);
const normal=url=>String(url).trim().replace(/\/$/,'').replace(/\.git$/,'');
function createService(root=path.resolve(__dirname,'..')){
 const temp=path.join(root,'.tmp'),statusFile=path.join(temp,'update-status.json'),lock=path.join(temp,'update.lock');
 async function git(args){const {stdout}=await run('git',args,{cwd:root,encoding:'utf8',timeout:20000,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});return stdout.trim()}
 function config(){return JSON.parse(fs.readFileSync(path.join(root,'update-config.json'),'utf8'))}
 async function version(){const cfg=config(),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));let head=null,branch=null,remote=null;try{head=await git(['rev-parse','HEAD']);branch=await git(['branch','--show-current']);remote=await git(['remote','get-url','origin'])}catch{}return{version:pkg.version,commit:head,branch,repository:cfg.repository,updateBranch:cfg.branch,configured:!!remote&&normal(remote)===normal(cfg.repository),managed:process.env.CASTLE_SUPERVISED==='1'}}
 async function check(){const local=await version();if(!local.configured)return{...local,available:false,message:'The configured repository must be added as origin before updates can be checked.'};const cfg=config();const refs=await git(['ls-remote','--exit-code','origin','refs/heads/'+cfg.branch]);const latest=refs.split(/\s/)[0];if(!/^[0-9a-f]{40,64}$/i.test(latest))throw Error('The update branch is empty or unavailable.');const dirty=!!await git(['status','--porcelain']);return{...local,latest,available:latest!==local.commit,clean:!dirty,canInstall:latest!==local.commit&&!dirty&&local.branch===cfg.branch,message:dirty?'Local edits detected. Commit or stash them before installing an update.':local.branch!==cfg.branch?'Switch to '+cfg.branch+' before installing.':latest===local.commit?'You are up to date.':'A new repository revision is available.'}}
 function readStatus(){try{return JSON.parse(fs.readFileSync(statusFile,'utf8'))}catch{return{status:'idle',message:'No update is running.'}}}
 function localRequest(req){const address=req.socket?.remoteAddress;if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))return false;try{const host=new URL('http://'+req.headers.host);if(!['localhost','127.0.0.1','[::1]'].includes(host.hostname))return false;if(req.headers.origin&&new URL(req.headers.origin).host!==host.host)return false;return req.headers['sec-fetch-site']!=='cross-site'}catch{return false}}
 async function install(expected){if(!/^[0-9a-f]{40,64}$/i.test(expected))throw Error('Invalid update revision.');const state=await check();if(!state.canInstall||state.latest!==expected)throw Error(state.latest!==expected?'The repository changed. Check for updates again.':state.message);fs.mkdirSync(temp,{recursive:true});try{fs.writeFileSync(lock,JSON.stringify({started:Date.now()}),{flag:'wx'})}catch{throw Error('An update is already running. Check its status before retrying.')}const job=crypto.randomUUID();fs.writeFileSync(statusFile,JSON.stringify({job,status:'running',message:'Starting update preflight...',before:state.commit,expected}));try{const child=spawn(process.execPath,[path.join(root,'scripts/update-worker.cjs'),job,expected],{cwd:root,windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,CASTLE_UPDATE_ROOT:root}});child.on('error',error=>{fs.writeFileSync(statusFile,JSON.stringify({job,status:'failed',message:error.message}));try{fs.unlinkSync(lock)}catch{}});child.unref()}catch(error){fs.unlinkSync(lock);throw error}return{job,status:'running'}}
 async function handle(req,res){const send=(code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))};try{
  if(!localRequest(req)){send(403,{error:'Updates are available only from this computer using a local game URL.'});return}
  const route=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&route==='/api/update/version'){send(200,await version());return}
  if(req.method==='GET'&&route==='/api/update/check'){send(200,await check());return}
  if(req.method==='GET'&&route==='/api/update/status'){send(200,readStatus());return}
  if(req.method==='POST'&&route==='/api/update/install'){
   if(!req.headers.origin||!String(req.headers['content-type']).startsWith('application/json')){send(403,{error:'A same-origin JSON request is required.'});return}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){send(413,{error:'Request too large.'});return}}
   const result=await install(JSON.parse(body).expected);send(202,result);return;
  }send(404,{error:'Unknown update endpoint.'});
 }catch(error){send(409,{error:((error.stderr||error.message)||'Update failed.').slice(0,1000)})}}
 return{git,config,version,check,readStatus,install,localRequest,handle,temp,statusFile,lock};
}
module.exports={createService,normal};
