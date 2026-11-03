// Desktop downloads are pinned to this repository and verified before becoming .exe files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const repository='https://github.com/tcsteel/AGE_Defenders';
const localRequest=require('./update-core.cjs').createService().localRequest;
let desktopOptions={};
function configure(options){desktopOptions=options}
function newerVersion(candidate,current){
 if(!/^\d+\.\d+\.\d+$/.test(candidate))return false;
 const a=candidate.split('.').map(Number),b=current.split('.').map(Number);
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}return false;
}
function createService(options={}){
 const {downloadsDirectory,revealFile,fetchImpl=fetch,version=require('../package.json').version}= {...desktopOptions,...options};
 const local={version,desktop:true,configured:true,repository:repository+'/releases/latest',commit:null,canInstall:false};
 const headers={accept:'application/vnd.github+json','user-agent':'AGE-Defenders'};
 let state={status:'idle',message:'No download is running.'},candidate=null;
 function releaseURL(asset,tag,name){
  const url=new URL(asset.browser_download_url);
  if(url.origin!=='https://github.com'||url.pathname!=='/tcsteel/AGE_Defenders/releases/download/'+tag+'/'+name||url.search||url.hash)throw Error('Unexpected update download address.');
  return url.href;
 }
 async function check(){
  const response=await fetchImpl('https://api.github.com/repos/tcsteel/AGE_Defenders/releases/latest',{headers,signal:AbortSignal.timeout(15000)});
  candidate=null;
  if(response.status===404)return {...local,available:false,canDownload:false,message:'No published Windows release is available yet.'};
  if(!response.ok)throw Error('GitHub release check failed ('+response.status+').');
  const release=await response.json(),latest=String(release.tag_name).replace(/^v/,''),available=newerVersion(latest,version);
  const name='AGE-Defenders-'+latest+'-Windows.exe',asset=release.assets?.find(a=>a.name===name),checksum=release.assets?.find(a=>a.name===name+'.sha256');
  if(available&&asset&&checksum){
   if(!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>1024*1024*1024)throw Error('Invalid update file size.');
   candidate={version:latest,name,size:asset.size,url:releaseURL(asset,release.tag_name,name),checksumURL:releaseURL(checksum,release.tag_name,name+'.sha256')};
  }
  const canDownload=!!candidate&&!!downloadsDirectory&&state.status!=='running'&&!(state.status==='complete'&&state.version===latest);
  return {...local,latest,available,canDownload,download:{...state},message:available?candidate?'Version '+latest+' is available. Download it here without leaving the game.':'Version '+latest+' is available, but its Windows download is not ready yet. Check again shortly.':'You are up to date (v'+version+').'};
 }
 async function download(expected){
  if(state.status==='running')throw Error('An update download is already running.');
  // Re-check instead of accepting any browser-supplied URL or filename.
  const result=await check();if(!result.canDownload||candidate?.version!==expected)throw Error('The available update changed or is not ready. Check for updates again.');
  if(state.status==='running')throw Error('An update download is already running.');
  const selected={...candidate},job=crypto.randomUUID();
  state={job,status:'running',version:selected.version,downloaded:0,total:selected.size,percent:0,message:'Preparing download...'};
  void saveDownload(selected,job);
  return {...state};
 }
 async function saveDownload(selected,job){
  let partial=null;
  try{
   const response=await fetchImpl(selected.checksumURL,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Could not download the release checksum.');
   const checksum=await response.text(),match=checksum.trim().match(/^([a-f\d]{64})\s+\*?([^\r\n]+)$/i);
   if(checksum.length>4096||!match||match[2]!==selected.name)throw Error('Invalid release checksum.');
   const directory=path.join(downloadsDirectory,'AGE Defenders');await fs.promises.mkdir(directory,{recursive:true});
   const folder=await fs.promises.mkdtemp(path.join(directory,selected.version+'-'));
   const verifiedFile=path.join(folder,selected.name);partial=verifiedFile+'.partial';
   const data=await fetchImpl(selected.url,{signal:AbortSignal.timeout(30*60*1000)});
   if(!data.ok||!data.body)throw Error('Could not download the Windows update ('+data.status+').');
   const hash=crypto.createHash('sha256');
   const meter=new Transform({transform(chunk,encoding,callback){
    state.downloaded+=chunk.length;
    if(state.downloaded>selected.size){callback(Error('The update file exceeds its expected size.'));return}
    hash.update(chunk);state.percent=Math.floor(state.downloaded/selected.size*100);state.message='Downloading version '+selected.version+' — '+state.percent+'%';callback(null,chunk);
   }});
   await pipeline(Readable.fromWeb(data.body),meter,fs.createWriteStream(partial,{flags:'wx'}));
   if(state.downloaded!==selected.size||hash.digest('hex')!==match[1].toLowerCase())throw Error('Update verification failed. The incomplete file has been removed; please retry.');
   await fs.promises.rename(partial,verifiedFile);partial=null;
   state={...state,status:'complete',percent:100,file:verifiedFile,message:'Download verified. Close the game and run the downloaded executable to use version '+selected.version+'. Your settings and scores are kept.'};
  }catch(error){
   if(partial)try{await fs.promises.unlink(partial)}catch{}
   state={...state,job,status:'failed',message:error.message};
  }
 }
 async function reveal(job){if(state.status!=='complete'||state.job!==job||!state.file||!revealFile)throw Error('No verified download is ready.');await revealFile(state.file);return {message:'The downloaded update is selected in your Downloads folder.'}}
 async function handle(req,res){
  const send=(code,body)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))};
  try{
   if(!localRequest(req)){send(403,{error:'Updates are available only from this computer using the local game window.'});return}
   const route=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&route==='/api/update/version'){send(200,local);return}
   if(req.method==='GET'&&route==='/api/update/check'){send(200,await check());return}
   if(req.method==='GET'&&route==='/api/update/status'){send(200,{...state});return}
   if(req.method==='POST'&&['/api/update/download','/api/update/reveal'].includes(route)){
    if(!req.headers.origin||!String(req.headers['content-type']).startsWith('application/json')){send(403,{error:'A same-origin JSON request is required.'});return}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){send(413,{error:'Request too large.'});return}}
    const request=JSON.parse(body);
    if(route.endsWith('/download'))send(202,await download(request.expected));else send(200,await reveal(request.job));return;
   }
   send(409,{error:'Use Download update to save the Windows executable inside the game.'});
  }catch(error){send(409,{error:error.message})}
 }
 return {check,download,reveal,handle,readStatus:()=>({...state})};
}
module.exports={configure,createService,newerVersion};
