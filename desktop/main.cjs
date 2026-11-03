const {app,BrowserWindow,dialog,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
let server,window;
if(process.argv.includes('--smoke-test')&&process.env.CASTLE_SMOKE_PROFILE)app.setPath('userData',process.env.CASTLE_SMOKE_PROFILE);
// Keep the local origin stable so settings and leaderboard survive restarts.
const port=3167;
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus()}});
 app.whenReady().then(async()=>{
  process.env.CASTLE_DESKTOP='1';
  const {startServer}=await import('../dist/server.js');
  server=startServer(port);
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  const origin='http://127.0.0.1:'+port;
  window=new BrowserWindow({title:'AGE Defenders',width:1600,height:1000,minWidth:1000,minHeight:700,backgroundColor:'#171910',show:false,autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.webContents.setWindowOpenHandler(({url})=>{openLink(url);return {action:'deny'}});
  window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();openLink(url)}});
  window.once('ready-to-show',()=>{if(!process.argv.includes('--smoke-test'))window.show()});
  await window.loadURL(origin);
  if(process.argv.includes('--smoke-test')){
   await new Promise(resolve=>setTimeout(resolve,1800));
   const state=await window.webContents.executeJavaScript(`(async()=>{const response=await fetch('/api/update/version');const assets=await Promise.all(['crossbowmanwalk','crossbowmanattack','arbalesterwalk','arbalesterattack','farm','castle','tower'].map(async name=>{const image=new Image();image.src='/assets/aoe/'+name+'.png';await image.decode();return image.naturalWidth>0}));document.getElementById('begin-game').click();return {desktop:(await response.json()).desktop,mode:CastleShell.mode,assets:assets.every(Boolean),renderer:CastleEngine.surface.active?'webgpu':'canvas'}})()`);
   const file=process.env.CASTLE_SMOKE_OUTPUT||path.join(app.getPath('temp'),'age-defenders-desktop-smoke.json');
   fs.writeFileSync(file,JSON.stringify(state));
   app.quit();
  }
 }).catch(error=>{if(process.argv.includes('--smoke-test')&&process.env.CASTLE_SMOKE_OUTPUT)fs.writeFileSync(process.env.CASTLE_SMOKE_OUTPUT,JSON.stringify({error:error.message}));else dialog.showErrorBox('AGE Defenders could not start',error.message);app.quit()});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>server?.close());
}
function openLink(url){try{const parsed=new URL(url);if(parsed.protocol==='https:'&&parsed.hostname==='github.com'&&parsed.pathname.startsWith('/tcsteel/AGE_Defenders'))void shell.openExternal(url)}catch{}}
