// Read-only Wwise package importer. Format reference:
// https://github.com/bnnm/wwiser-utils/blob/master/scripts/wwise_pck_extractor.bms
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=process.argv[2],decoder=process.argv[3];if(!root||!decoder)throw Error('Usage: node scripts/import-aoe-audio.cjs <AoE2DE directory> <vgmstream-cli.exe>');
const output=path.resolve('public/assets/audio'),temp=path.resolve('.tmp/audio');fs.mkdirSync(output,{recursive:true});fs.mkdirSync(temp,{recursive:true});
const media=new Map(),objects=new Map(),packages=[];
function slice(fd,offset,length){if(length<0||length>250000000)throw Error('Invalid audio extent');const b=Buffer.alloc(length);if(fs.readSync(fd,b,0,length,offset)!==length)throw Error('Truncated audio archive');return b}
for(const file of ['Base.pck','Base.1.pck']){
 const fd=fs.openSync(path.join(root,'wwise',file),'r');packages.push(fd);const header=slice(fd,0,28);if(header.toString('ascii',0,4)!=='AKPK')throw Error('Invalid AKPK archive');let offset=28+header.readUInt32LE(12);
 for(const [kind,length]of [['bank',header.readUInt32LE(16)],['stream',header.readUInt32LE(20)]]){
  const table=slice(fd,offset,length);offset+=length;const count=table.readUInt32LE(0),stride=count?(length-4)/count:20;
  for(let i=0;i<count;i++){const p=4+i*stride,id=table.readUInt32LE(p),size=stride===24?Number(table.readBigUInt64LE(p+8)):table.readUInt32LE(p+8),start=table.readUInt32LE(p+(stride===24?16:12))*table.readUInt32LE(p+4);
   if(kind==='stream'){media.set(id,{fd,start,size,file,id});continue}
   const bank=slice(fd,start,size);let dataStart=0,indices=[];
   for(let c=0;c+8<=bank.length;){const tag=bank.toString('ascii',c,c+4),n=bank.readUInt32LE(c+4),body=c+8;if(body+n>bank.length)break;
    if(tag==='DIDX')for(let k=body;k<body+n;k+=12)indices.push({id:bank.readUInt32LE(k),offset:bank.readUInt32LE(k+4),size:bank.readUInt32LE(k+8)});
    if(tag==='DATA')dataStart=body;
    if(tag==='HIRC'){let k=body+4;for(let j=0;j<bank.readUInt32LE(body);j++){const type=bank[k],len=bank.readUInt32LE(k+1),id=bank.readUInt32LE(k+5);objects.set(id,{id,type,data:bank.subarray(k+9,k+5+len)});k+=5+len}}
    c=body+n;
   }
   for(const entry of indices)media.set(entry.id,{fd,start:start+dataStart+entry.offset,size:entry.size,file,id:entry.id});
  }
 }
}
function hash(s){let h=2166136261;for(const c of s.toLowerCase()){h=Math.imul(h,16777619)>>>0;h^=c.charCodeAt(0)}return h>>>0}
function eventMedia(name){const queue=[hash(name)],seen=new Set();for(let i=0;i<queue.length&&i<1000;i++){const id=queue[i];if(seen.has(id))continue;seen.add(id);const object=objects.get(id);if(!object)continue;for(let p=0;p+4<=object.data.length;p++){const ref=object.data.readUInt32LE(p);if(media.has(ref)&&object.type===2)return media.get(ref);if(objects.has(ref)&&!seen.has(ref))queue.push(ref)}}return null}
function extract(entry){const file=path.join(temp,entry.id+'.wem');if(!fs.existsSync(file))fs.writeFileSync(file,slice(entry.fd,entry.start,entry.size));return file}
function info(entry){try{const result=execFileSync(decoder,['-I','-m',extract(entry)],{encoding:'utf8',windowsHide:true});return JSON.parse(result)}catch{return null}}
const manifest={source:'Local AoE2DE Wwise archives',files:{}};
function convert(entry,name,maxSeconds=90){
 const decoded=path.join(temp,name+'.wav');execFileSync(decoder,['-i','-o',decoded,extract(entry)],{stdio:'ignore',windowsHide:true});const b=fs.readFileSync(decoded);let fmt=null,data=null;
 for(let p=12;p+8<=b.length;){const n=b.readUInt32LE(p+4),tag=b.toString('ascii',p,p+4);if(tag==='fmt ')fmt=b.subarray(p+8,p+8+n);if(tag==='data')data=b.subarray(p+8,p+8+n);p+=8+n+(n%2)}
 if(!fmt||!data||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(14)!==16)throw Error('Expected PCM16 output');
 const channels=fmt.readUInt16LE(2),rate=fmt.readUInt32LE(4),duration=data.length/channels/2/rate,outRate=24000,samples=Math.floor(Math.min(duration,maxSeconds)*outRate),pcm=Buffer.alloc(samples*2);
 for(let i=0;i<samples;i++){const input=Math.min(Math.floor(i*rate/outRate),Math.floor(data.length/(channels*2))-1);let value=0;for(let c=0;c<channels;c++)value+=data.readInt16LE((input*channels+c)*2)/channels;const fade=name==='music'?Math.min(1,i/outRate/2,(samples-i)/outRate/3):1;pcm.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(value*fade))),i*2)}
 const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(outRate,24);wav.writeUInt32LE(outRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);fs.writeFileSync(path.join(output,name+'.wav'),Buffer.concat([wav,pcm]));manifest.files[name]={source:entry.file,id:entry.id,seconds:samples/outRate};console.log(name,entry.id,(samples/outRate).toFixed(2)+'s');
}
for(const[name,event]of Object.entries({ui:'Play_Button_Select',research:'Play_Technology_Researched',victory:'Play_Victory'})){const entry=eventMedia(event);if(entry)convert(entry,name,name==='ui'?1:8);else console.log('No event match:',event)}
// The longest streamed stereo media in the base package are score segments.
const largest=[...media.values()].filter(m=>m.size>1500000).sort((a,b)=>b.size-a.size).slice(0,12);
for(const entry of largest){const meta=info(entry);console.log('Candidate',entry.id,JSON.stringify(meta).slice(0,550));if(!manifest.files.music&&meta){convert(entry,'music',100);break}}
// Select short embedded non-speech effects; event matches remain preferred.
const short=[...media.values()].filter(m=>m.size>4000&&m.size<15000);let effects=0;
for(const entry of short.slice(0,100)){if(effects>=2)break;try{convert(entry,effects?'impact':'arrow',.7);effects++}catch{}}
if(!manifest.files.music)throw Error('No music candidate could be decoded');
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));for(const fd of packages)fs.closeSync(fd);
