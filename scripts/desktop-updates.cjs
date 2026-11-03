// Portable builds download complete releases; source checkouts keep the Git updater.
const fs=require('node:fs'),path=require('node:path');
const repository='https://github.com/tcsteel/AGE_Defenders';
function createService(){
 const version=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8')).version;
 const local={version,desktop:true,configured:true,repository:repository+'/releases/latest',commit:null,canInstall:false};
 async function check(){
  const response=await fetch('https://api.github.com/repos/tcsteel/AGE_Defenders/releases/latest',{headers:{accept:'application/vnd.github+json','user-agent':'AGE-Defenders'},signal:AbortSignal.timeout(15000)});
  if(response.status===404)return {...local,available:false,message:'No published Windows release is available yet.'};
  if(!response.ok)throw Error('GitHub release check failed ('+response.status+').');
  const release=await response.json(),latest=String(release.tag_name).replace(/^v/,'');
  const numbers=v=>v.split('.').map(Number),a=numbers(latest),b=numbers(version);
  const newer=a.every(Number.isFinite)&&a.some((n,i)=>n>(b[i]??0)&&a.slice(0,i).every((p,k)=>p===(b[k]??0)));
  return {...local,latest,available:newer,message:newer?'Version '+latest+' is available. Open the repository link below to download the new Windows executable.':'You are up to date (v'+version+'). Windows downloads are available from the repository link below.'};
 }
 return {async handle(req,res){const send=(code,body)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))};try{
  const route=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&route==='/api/update/version')send(200,local);
  else if(req.method==='GET'&&route==='/api/update/check')send(200,await check());
  else send(409,{error:'Portable builds update by downloading the latest executable from GitHub Releases.'});
 }catch(error){send(502,{error:error.message})}}};
}
module.exports={createService};
