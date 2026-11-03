(() => {
 const $=id=>document.getElementById(id),shell=window.CastleShell;
 const updates=window.CastleUpdates={state:null,returnMode:'menu',installing:false,downloadStatus:null,pollingDownload:false,
  async request(route,options){const response=await fetch('/api/update/'+route,{cache:'no-store',...options});const value=await response.json();if(!response.ok)throw Error(value.error||'Update request failed');return value},
  open(){this.returnMode=shell.mode;shell.mode='updates';shell.show();void this.check()},
  close(){if(this.installing&&!this.state?.desktop)return;shell.mode=this.returnMode;shell.show()},
  show(message){
   const desktop=this.state?.desktop,download=this.downloadStatus;
   $('update-title').textContent=desktop?'Game updates':'Web updates';$('update-local-label').textContent=desktop?'Installed version':'Installed commit';$('update-online-label').textContent=desktop?'Latest version':'Online commit';$('settings-updates').textContent=desktop?'Game updates':'Web updates';
   $('update-message').textContent=message;$('update-install').disabled=this.installing||!(desktop?this.state?.canDownload:this.state?.canInstall);
   $('update-check').disabled=this.installing;$('update-back').disabled=this.installing&&!desktop;
   $('update-install').textContent=desktop?(this.installing?'Downloading update...':'Download update'):(shell.runActive?'Exit run & install update':'Install update');
   $('update-intro').textContent=desktop?'Download the latest Windows version directly here. You can return to the game while it downloads.':'Check for source updates pushed to your repository. Installation validates the new build before updating this local game.';
   $('update-notes').textContent=desktop?'Updates are saved in Downloads / AGE Defenders and verified before use. Close the game, then run the downloaded executable. Your settings and scores are kept.':'Local edits are never overwritten. Graphics, audio, settings, and scores are preserved. Dependency changes require a manual update in Cursor.';
   $('update-progress').hidden=!desktop||!download||download.status==='idle';$('update-progress-bar').value=download?.percent??0;
   $('update-progress-label').textContent=download?`${Math.round((download.downloaded??0)/1048576)} / ${Math.round((download.total??0)/1048576)} MB · ${download.percent??0}%`:'';
   $('update-reveal').hidden=!desktop||download?.status!=='complete';$('update-file').textContent=download?.status==='complete'?download.file:'';
   $('update-repository').href=this.state?.repository??'https://github.com/tcsteel/AGE_Defenders';$('update-local').textContent=desktop?'v'+this.state.version:(this.state?.commit?.slice(0,10)??'Uncommitted working copy');$('update-online').textContent=desktop&&this.state?.latest?'v'+this.state.latest:(this.state?.latest?.slice(0,10)??'Not checked');
  },
  async check(){try{this.show('Checking for updates...');this.state=await this.request('check');if(this.state.desktop){this.downloadStatus=this.state.download??this.downloadStatus;if(this.downloadStatus?.status==='running'){this.installing=true;if(!this.pollingDownload)void this.pollDownload(this.downloadStatus.job)}}this.show(this.downloadStatus&&['running','complete','failed'].includes(this.downloadStatus.status)?this.downloadStatus.message:this.state.message);$('menu-updates').textContent=(this.state.desktop?'Game updates':'Web updates')+(this.state.available?' · update available':'')}catch(error){this.show(error.message)}},
  async install(){
   if(this.state?.desktop){
    if(this.installing||!this.state.canDownload)return;this.installing=true;this.show('Preparing download...');
    try{this.downloadStatus=await this.request('download',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expected:this.state.latest})});await this.pollDownload(this.downloadStatus.job)}catch(error){this.installing=false;this.show(error.message)}return;
   }
   if(this.installing||!this.state?.canInstall)return;
   if(shell.runActive)shell.archive('retired');this.installing=true;this.show('Starting update...');
   try{const job=await this.request('install',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expected:this.state.latest})});await this.poll(job.job)}catch(error){this.installing=false;this.show(error.message)}
  },
  async pollDownload(job){
   if(this.pollingDownload)return;this.pollingDownload=true;
   try{
    for(let attempt=0;attempt<3600;attempt++){
     const status=await this.request('status');if(status.job!==job)throw Error('Download status changed. Check for updates again.');
     this.downloadStatus=status;this.show(status.message);
     if(status.status==='complete'||status.status==='failed'){this.installing=false;if(status.status==='complete')this.state.canDownload=false;this.show(status.message);return}
     await new Promise(resolve=>setTimeout(resolve,500));
    }throw Error('Download status timed out. Check for updates to reconnect.');
   }catch(error){this.installing=false;this.show(error.message)}finally{this.pollingDownload=false}
  },
  async reveal(){try{await this.request('reveal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job:this.downloadStatus?.job})})}catch(error){this.show(error.message)}},
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
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const actions={'menu-updates':()=>updates.open(),'settings-updates':()=>updates.open(),'update-check':()=>updates.check(),'update-install':()=>updates.install(),'update-reveal':()=>updates.reveal(),'update-back':()=>updates.close(),'update-reload':()=>location.reload()};if(actions[b.id]){e.preventDefault();e.stopImmediatePropagation();actions[b.id]()}},true);
 document.addEventListener('keydown',e=>{if(shell.mode==='updates'&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();updates.close()}},true);
 void updates.request('version').then(state=>{updates.state=state;$('menu-version').textContent='v'+state.version+' · '+(state.desktop?'Windows':(state.commit?.slice(0,8)??'working copy'));if(state.configured)void updates.check()}).catch(()=>{$('menu-version').textContent='Local development version'});
 setInterval(()=>{if(shell.mode==='menu'&&!updates.installing&&updates.state?.configured)void updates.check()},300000);
})();
