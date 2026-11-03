const {spawn}=require('node:child_process');
const env={...process.env};
// Cursor terminals may inherit this flag from their own Electron host.
delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),['.'],{env,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1});
child.on('exit',code=>{process.exitCode=code??1});
