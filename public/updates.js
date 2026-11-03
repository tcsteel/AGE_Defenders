(() => {
 const $=id=>document.getElementById(id),shell=window.CastleShell;
 const updates=window.CastleUpdates={state:null,returnMode:'menu',installing:false,
  async request(route,options){const response=await fetch('/api/update/'+route,{cache:'no-store',...options});const value=await response.json();if(!response.ok)throw Error(value.error||'Update request failed');return value},
  open(){this.returnMode=shell.mode;shell.mode='updates';shell.show();void this.check()},
  close(){if(this.installing)return;shell.mode=this.returnMode;shell.show()},
  show(message){$('update-message').textContent=message;$('update-install').disabled=this.installing||!this.state?.canInstall;$('update-check').disabled=this.installing;$('update-back').disabled=this.installing;$('update-install').textContent=shell.runActive?'Exit run & install update':'Install update';$('update-repository').href=this.state?.repository??'https://github.com/tcsteel/AGE_Defenders';$('update-local').textContent=this.state?.commit?.slice(0,10)??'Uncommitted working copy';$('update-online').textContent=this.state?.latest?.slice(0,10)??'Not checked'},
  async check(){try{this.show('Checking the online repository...');this.state=await this.request('check');this.show(this.state.message);$('menu-updates').textContent=this.state.available?'Web updates · update available':'Web updates'}catch(error){this.show(error.message)}},
  async install(){
   if(this.installing||!this.state?.canInstall)return;
   if(shell.runActive)shell.archive('retired');this.installing=true;this.show('Starting update...');
   try{const job=await this.request('install',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expected:this.state.latest})});await this.poll(job.job)}catch(error){this.installing=false;this.show(error.message)}
  },
  async poll(job){
   for(let attempt=0;attempt<360;attempt++){
    await new Promise(resolve=>setTimeout(resolve,1000));
    let status;try{status=await this.request('status')}catch{this.show('The game server is restarting...');continue}
    if(status.job!==job)continue;this.show(status.message);
    if(status.status==='failed'){this.installing=false;this.show(status.message);return}
    if(status.status==='complete'){
     this.installing=false;this.state.canInstall=false;this.state.commit=status.installed;
     this.show(status.managed?'Update installed. Reload to play the new version.':'Update installed. Restart npm run dev or npm start, then reload.');$('update-reload').hidden=false;return;
    }
   }this.installing=false;this.show('The update is taking longer than expected. Check update status before retrying.');
  }
 };
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const actions={'menu-updates':()=>updates.open(),'settings-updates':()=>updates.open(),'update-check':()=>updates.check(),'update-install':()=>updates.install(),'update-back':()=>updates.close(),'update-reload':()=>location.reload()};if(actions[b.id]){e.preventDefault();e.stopImmediatePropagation();actions[b.id]()}},true);
 document.addEventListener('keydown',e=>{if(shell.mode==='updates'&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();updates.close()}},true);
 void updates.request('version').then(state=>{updates.state=state;$('menu-version').textContent='v'+state.version+' · '+(state.commit?.slice(0,8)??'working copy');if(state.configured)void updates.check()}).catch(()=>{$('menu-version').textContent='Local development version'});
 setInterval(()=>{if(shell.mode==='menu'&&!updates.installing&&updates.state?.configured)void updates.check()},300000);
})();
