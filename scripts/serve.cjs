const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dev=process.argv.includes('--dev'),temp=path.join(root,'.tmp');let child=null,stopping=false,restarting=false,timer;
const marker=path.join(temp,'update-restart');let lastMarker='';try{lastMarker=fs.readFileSync(marker,'utf8')}catch{}
function launch(){child=spawn(process.execPath,dev?['--import','tsx','src/index.ts']:['dist/index.js'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,CASTLE_SUPERVISED:'1'}});child.on('exit',()=>{if(stopping)return;if(restarting){restarting=false;launch()}else timer=setTimeout(launch,1000)});child.on('error',error=>console.error(error.message))}
function restart(){if(stopping||restarting)return;restarting=true;if(child?.exitCode===null)child.kill();else{restarting=false;launch()}}
function updating(){try{return JSON.parse(fs.readFileSync(path.join(temp,'update-status.json'),'utf8')).status==='running'}catch{return false}}
const poll=setInterval(()=>{try{const next=fs.readFileSync(marker,'utf8');if(next!==lastMarker){lastMarker=next;restart()}}catch{}},700);
let watcher;if(dev){let debounce;watcher=fs.watch(path.join(root,'src'),{recursive:true},()=>{clearTimeout(debounce);debounce=setTimeout(()=>{if(!updating())restart()},300)})}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;clearInterval(poll);clearTimeout(timer);watcher?.close();child?.kill();process.exit(0)});
launch();
