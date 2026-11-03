const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(process.env.CASTLE_UPDATE_ROOT||path.join(__dirname,'..')),service=require('./update-core.cjs').createService(root),job=process.argv[2],expected=process.argv[3];
if(!/^[\w-]{8,80}$/.test(job)||!/^[0-9a-f]{40,64}$/i.test(expected))throw Error('Invalid update job.');
const staging=path.resolve(root,'.tmp','update-stage-'+job),junction=path.join(staging,'node_modules');
if(!staging.startsWith(path.resolve(root,'.tmp')+path.sep))throw Error('Unsafe staging path');
let before=null,merged=false;
function status(state,message,extra={}){const value={job,status:state,message,before,expected,...extra};fs.writeFileSync(service.statusFile+'.next',JSON.stringify(value));fs.renameSync(service.statusFile+'.next',service.statusFile)}
function run(file,args,cwd=root){return execFileSync(file,args,{cwd,encoding:'utf8',timeout:180000,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}}).trim()}
(async()=>{try{
 const check=await service.check();if(!check.canInstall||check.latest!==expected)throw Error('Preflight rejected: '+check.message);before=check.commit;
 status('running','Downloading repository update...');const cfg=service.config();run('git',['fetch','--no-tags','origin',cfg.branch]);const fetched=run('git',['rev-parse','FETCH_HEAD']);if(fetched!==expected)throw Error('Repository changed during download. Check for updates again.');run('git',['merge-base','--is-ancestor',before,expected]);
 const oldPackage=JSON.parse(run('git',['show',before+':package.json'])),newPackage=JSON.parse(run('git',['show',expected+':package.json']));
 const dependencies=p=>JSON.stringify([p.dependencies??{},p.devDependencies??{},p.optionalDependencies??{}]);
 if(dependencies(oldPackage)!==dependencies(newPackage)||run('git',['diff','--name-only',before,expected,'--','package-lock.json']).length)throw Error('This update changes dependencies. Run git pull --ff-only, npm ci, and npm run build in Cursor; the browser updater has left your checkout unchanged.');
 status('running','Validating the new source in an isolated checkout...');run('git',['worktree','add','--detach',staging,expected]);fs.symlinkSync(path.join(root,'node_modules'),junction,process.platform==='win32'?'junction':'dir');
 run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(staging,'tsconfig.json')],staging);
 const tests=['tests/game.cjs','tests/shell.cjs','tests/renderer.cjs'];for(const test of tests)if(fs.existsSync(path.join(staging,test)))run(process.execPath,[path.join(staging,test)],staging);
 if(await service.git(['status','--porcelain']))throw Error('Local edits appeared during preflight. No update was installed.');
 status('running','Installing validated source and build...');run('git',['merge','--ff-only',expected]);merged=true;fs.cpSync(path.join(staging,'dist'),path.join(root,'dist'),{recursive:true});
 status('complete','Update installed. Reload the game when the server is ready.',{installed:expected,managed:process.env.CASTLE_SUPERVISED==='1'});fs.writeFileSync(path.join(service.temp,'update-restart'),job);
 }catch(error){status('failed',((error.stderr||error.message)||'Update failed.').slice(0,1400),{sourceUpdated:merged})}
 finally{
  try{if(fs.existsSync(junction)&&fs.lstatSync(junction).isSymbolicLink())fs.unlinkSync(junction)}catch{}
  try{if(fs.existsSync(staging))run('git',['worktree','remove','--force',staging])}catch{}
  try{fs.unlinkSync(service.lock)}catch{}
 }
})();
