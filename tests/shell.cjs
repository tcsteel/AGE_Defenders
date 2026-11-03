const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),storage=new Map(),classes=new Set();let uuid=0;
const context={console,Date,Math,Number,JSON,crypto:{randomUUID:()=>String(++uuid)},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{body:{classList:{toggle(k,on){on?classes.add(k):classes.delete(k)}}},getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,style:{},classList:{toggle(){}},textContent:'',innerHTML:''});return elements.get(id)},addEventListener(){}},addEventListener(){},CastleEngine:{settings:{master:1,music:.4,sfx:.8,lighting:true},defaults:{},read:(k,fallback)=>fallback,status:'test',saveSettings(){}}};context.window=context;context.globalThis=context;
vm.createContext(context);vm.runInContext(fs.readFileSync('public/shell.js','utf8'),context);
const shell=context.CastleShell;let state;shell.onBegin=()=>{state={kills:0,maxWave:0,clearedWave:0,level:1}};shell.getState=()=>state;
assert.equal(shell.mode,'menu');assert.equal(shell.canSimulate(),false);
shell.openSettings();assert.equal(shell.settingsReturn,'menu');assert.ok(elements.get('graphics-settings').innerHTML.includes('data-setting="resolution"'));assert.ok(elements.get('audio-settings').innerHTML.includes('Master volume'));shell.closeSettings();assert.equal(shell.mode,'menu');
shell.begin();assert.equal(shell.mode,'run');assert.equal(shell.runActive,true);assert.equal(shell.canSimulate(),true);
shell.pause();assert.equal(shell.mode,'pause');assert.equal(shell.canSimulate(),false);shell.openSettings();assert.equal(shell.settingsReturn,'pause');shell.closeSettings();assert.equal(shell.mode,'pause');shell.resume();assert.equal(shell.mode,'run');
state.kills=17;state.maxWave=4;state.clearedWave=3;state.level=3;shell.exit();assert.equal(shell.mode,'menu');assert.equal(shell.runs.length,1);assert.equal(shell.runs[0].kills,17);assert.equal(shell.runs[0].wave,4);assert.equal(shell.runs[0].result,'retired');shell.archive('retired');assert.equal(shell.runs.length,1,'Run records are not duplicated');
shell.begin();state.kills=30;state.maxWave=12;state.clearedWave=12;state.level=8;shell.end(state,'won');shell.end(state,'won');assert.equal(shell.runs.length,2);assert.equal(shell.mode,'results');assert.ok(elements.get('result-summary').textContent.includes('30 kills'));shell.leaderboard();assert.equal(shell.boardReturn,'results');assert.ok(elements.get('leaderboard-body').innerHTML.includes('Victory'));
const saved=JSON.parse(storage.get('castlehold.runs.v1'));assert.equal(saved.length,2);assert.equal(saved[0].kills,30);
shell.sort='wave';shell.renderLeaderboard();assert.ok(elements.get('leaderboard-body').innerHTML.indexOf('30')<elements.get('leaderboard-body').innerHTML.indexOf('17'));
shell.begin();state.kills=1;context.localStorage.setItem=()=>{throw Error('disabled')};shell.exit();assert.ok(shell.storageWarning.includes('session'));assert.equal(shell.runs.length,3,'Storage failure keeps session leaderboard working');
shell.begin();state.kills=1000;state.maxWave=8;shell.exit();shell.begin();state.kills=5;state.maxWave=12;shell.exit();for(let i=0;i<70;i++){shell.begin();state.kills=2;state.maxWave=1;shell.exit()}
assert.ok(shell.runs.some(r=>r.kills===1000),'All-time kill record survives later poor runs');
assert.ok(shell.runs.some(r=>r.wave===12),'High wave records survive later poor runs');
assert.ok(shell.runs.length<=51,'Score retention remains bounded');
console.log('Passed: start/settings/pause state, resume/exit, run scoring/deduplication, leaderboard, and storage failure handling.');
