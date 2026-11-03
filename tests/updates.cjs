const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const {createService}=require('../scripts/update-core.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'age-update-test-')),remote=path.join(temp,'remote.git'),local=path.join(temp,'game'),author=path.join(temp,'author');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const write=(file,content)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function identity(cwd){git(cwd,'config','user.name','Update Test');git(cwd,'config','user.email','test@example.invalid');git(cwd,'config','commit.gpgsign','false')}
function publish(message){git(author,'add','.');git(author,'commit','-m',message);git(author,'push','origin','main');return git(author,'rev-parse','HEAD')}
async function completed(service,job){for(let i=0;i<150;i++){const state=service.readStatus();if(state.job===job&&state.status!=='running'&&!fs.existsSync(service.lock))return state;await sleep(100)}throw Error('Update job timed out')}
(async()=>{try{
 fs.mkdirSync(local);git(temp,'init','--bare',remote);git(local,'init','-b','main');identity(local);
 write(path.join(local,'.gitignore'),'node_modules/\ndist/\n.tmp/\npublic/assets/\n');
 write(path.join(local,'package.json'),JSON.stringify({name:'update-test',version:'1.0.0',private:true,type:'module'}));
 write(path.join(local,'package-lock.json'),'{}');
 write(path.join(local,'update-config.json'),JSON.stringify({repository:remote,branch:'main'}));
 write(path.join(local,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',outDir:'dist',rootDir:'src',skipLibCheck:true},include:['src/**/*.ts']}));
 write(path.join(local,'src/index.ts'),'export const version = 1;');write(path.join(local,'public/index.html'),'version one');
 for(const name of ['update-core.cjs','update-worker.cjs'])write(path.join(local,'scripts',name),fs.readFileSync(path.join(__dirname,'../scripts',name)));
 fs.symlinkSync(path.resolve('node_modules'),path.join(local,'node_modules'),process.platform==='win32'?'junction':'dir');
 write(path.join(local,'public/assets/local-only.txt'),'preserve');git(local,'add','.');git(local,'commit','-m','Initial');git(local,'remote','add','origin',remote);git(local,'push','-u','origin','main');
 git(temp,'clone','--branch','main',remote,author);identity(author);
 const service=createService(local);assert.equal((await service.check()).available,false);
 assert.equal(service.localRequest({socket:{remoteAddress:'192.0.2.1'},headers:{host:'localhost:3000'}}),false,'Remote callers rejected');
 assert.equal(service.localRequest({socket:{remoteAddress:'127.0.0.1'},headers:{host:'evil.example:3000'}}),false,'DNS rebinding host rejected');
 assert.equal(service.localRequest({socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3000',origin:'https://evil.example'}}),false,'Cross-origin writes rejected');
 assert.equal(service.localRequest({socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3000',origin:'http://localhost:3000'}}),true);
 write(path.join(author,'public/index.html'),'version two');write(path.join(author,'src/index.ts'),'export const version = 2;');const revision=publish('Update game');
 assert.equal((await service.check()).canInstall,true);await assert.rejects(()=>service.install('0'.repeat(40)));
 const job=await service.install(revision),result=await completed(service,job.job);assert.equal(result.status,'complete',result.message);assert.equal(git(local,'rev-parse','HEAD'),revision);assert.equal(fs.readFileSync(path.join(local,'public/index.html'),'utf8'),'version two');assert.ok(fs.existsSync(path.join(local,'dist/index.js')));assert.equal(fs.readFileSync(path.join(local,'public/assets/local-only.txt'),'utf8'),'preserve');
 write(path.join(local,'public/index.html'),'my local edits');write(path.join(author,'public/index.html'),'version three');publish('More data');assert.equal((await service.check()).canInstall,false);await assert.rejects(()=>service.install(git(author,'rev-parse','HEAD')),/Local edits/);assert.equal(fs.readFileSync(path.join(local,'public/index.html'),'utf8'),'my local edits');
 write(path.join(local,'public/index.html'),'version two');
 write(path.join(author,'package.json'),JSON.stringify({name:'update-test',version:'1.0.0',private:true,type:'module',dependencies:{uninstalled:'1.0.0'}}));const dependencies=publish('Change dependencies');const depJob=await service.install(dependencies),depResult=await completed(service,depJob.job);assert.equal(depResult.status,'failed');assert.ok(depResult.message.includes('changes dependencies'));assert.equal(git(local,'rev-parse','HEAD'),revision,'Dependency failure leaves installed source intact');
 write(path.join(author,'package.json'),JSON.stringify({name:'update-test',version:'1.0.0',private:true,type:'module'}));write(path.join(author,'src/index.ts'),'export const broken: number = "wrong";');const invalid=publish('Broken build');const badJob=await service.install(invalid),badResult=await completed(service,badJob.job);assert.equal(badResult.status,'failed');assert.equal(git(local,'rev-parse','HEAD'),revision,'Failed preflight never replaces installed source');
 console.log('Passed: update detection/install/build, local assets preserved, dirty checkout rejection, dependency/build preflight failures, and local-origin guards.');
 }finally{
  const link=path.join(local,'node_modules');if(fs.existsSync(link)&&fs.lstatSync(link).isSymbolicLink())fs.unlinkSync(link);
  const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('age-update-test-'))throw Error('Unsafe test cleanup path');fs.rmSync(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
