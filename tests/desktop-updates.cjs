const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {createService,newerVersion}=require('../scripts/desktop-updates.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'age-download-test-'));
const bytes=Buffer.from('MZ-test-update-payload-'.repeat(2000)),hash=crypto.createHash('sha256').update(bytes).digest('hex');
const name='AGE-Defenders-9.0.0-Windows.exe',base='https://github.com/tcsteel/AGE_Defenders/releases/download/v9.0.0/';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let unblock,corrupt=false,missing=false,foreign=false,networkFailure=false,wrongSize=false,lookups=0,revealed;
function fixture(){return {tag_name:'v9.0.0',assets:missing?[]:[{name,size:wrongSize?bytes.length-1:bytes.length,browser_download_url:(foreign?'https://evil.example/':base)+name},{name:name+'.sha256',browser_download_url:base+name+'.sha256'}]}}
async function mockFetch(url){
 if(String(url).includes('api.github.com')){lookups++;return Response.json(fixture())}
 if(String(url).endsWith('.sha256'))return new Response((corrupt?'0'.repeat(64):hash)+'  '+name+'\n');
 if(networkFailure)throw Error('Download connection interrupted');
 return new Response(new ReadableStream({async start(controller){controller.enqueue(bytes.subarray(0,1000));await new Promise(resolve=>{unblock=resolve});controller.enqueue(bytes.subarray(1000));controller.close()}}));
}
const service=createService({version:'1.2.0',downloadsDirectory:temp,fetchImpl:mockFetch,revealFile:file=>{revealed=file}});
const server=http.createServer(service.handle);
async function waitFor(test){for(let i=0;i<300;i++){if(test())return;await sleep(10)}throw Error('Download test timed out')}
(async()=>{try{
 assert.equal(newerVersion('1.10.0','1.9.9'),true);assert.equal(newerVersion('1.2.0','1.2.0'),false);assert.equal(newerVersion('1.1.9','1.2.0'),false);assert.equal(newerVersion('../../file','1.2.0'),false);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const post=(route,body,headers={})=>fetch(origin+'/api/update/'+route,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post('download',{expected:'9.0.0'},{origin:'https://evil.example'})).status,403);
 assert.equal((await fetch(origin+'/api/update/download',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
 assert.equal(lookups,0,'Rejected writes never contact GitHub');
 assert.equal((await post('reveal',{job:'unknown'})).status,409);
 assert.equal((await post('download',{expected:'8.0.0'})).status,409,'Stale versions rejected');
 const info=await service.check();assert.equal(info.canDownload,true);assert.equal(info.latest,'9.0.0');
 const response=await post('download',{expected:'9.0.0',url:'https://evil.example/arbitrary.exe'});assert.equal(response.status,202);const job=await response.json();
 await waitFor(()=>service.readStatus().downloaded>0);const progress=service.readStatus();assert.equal(progress.status,'running');assert.ok(progress.percent>0&&progress.percent<100);
 await assert.rejects(()=>service.download('9.0.0'),/already running/);
 assert.equal((await service.check()).canDownload,false);
 unblock();await waitFor(()=>service.readStatus().status!=='running');const ready=service.readStatus();assert.equal(ready.status,'complete',ready.message);
 assert.equal(ready.percent,100);assert.equal(ready.downloaded,bytes.length);assert.deepEqual(fs.readFileSync(ready.file),bytes);assert.equal(path.basename(ready.file),name);assert.ok(ready.file.startsWith(temp+path.sep));
 assert.equal((await post('reveal',{job:job.job})).status,200);assert.equal(revealed,ready.file);assert.equal((await service.check()).canDownload,false,'Completed version is not downloaded twice');
 const statusResponse=await(await fetch(origin+'/api/update/status')).json();assert.equal(statusResponse.file,ready.file);
 // Checksum and stream failures must never leave runnable executables.
 for(const scenario of ['checksum','connection','size']){
  corrupt=scenario==='checksum';networkFailure=scenario==='connection';wrongSize=scenario==='size';
  const failing=createService({version:'1.2.0',downloadsDirectory:path.join(temp,scenario),fetchImpl:mockFetch});
  await failing.download('9.0.0');if(!networkFailure){await waitFor(()=>failing.readStatus().downloaded>0);unblock()}
  await waitFor(()=>failing.readStatus().status!=='running');assert.equal(failing.readStatus().status,'failed');
  const files=fs.readdirSync(path.join(temp,scenario),{recursive:true});assert.equal(files.some(file=>file.endsWith('.exe')||file.endsWith('.partial')),false,'Failed downloads are removed');
 }
 corrupt=false;networkFailure=false;wrongSize=false;missing=true;assert.equal((await service.check()).canDownload,false,'Release must include executable and checksum');
 missing=false;foreign=true;await assert.rejects(()=>service.check(),/Unexpected update download address/);
 assert.equal(service.readStatus().file,ready.file,'Bad release metadata cannot replace a verified file');
 console.log('Passed: in-game desktop download, progress, checksum, saved file/reveal, version pinning, failure cleanup and request guards.');
}finally{
 await new Promise(resolve=>server.close(resolve));
 const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('age-download-test-'))throw Error('Unsafe test cleanup path');
 fs.rmSync(resolved,{recursive:true,force:true});
}})().catch(error=>{console.error(error);process.exitCode=1});
