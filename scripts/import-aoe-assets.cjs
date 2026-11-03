// Static sprites and short main-layer SLD animation loops. Format reference:
// https://github.com/SFTtech/openage/blob/master/doc/media/sld-files.md
// Intentionally omits shadows, damage masks, and player-color overlays.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/import-aoe-assets.cjs <AoE2DE directory>');
const output = path.resolve('public/assets/aoe');
fs.mkdirSync(output, { recursive: true });
function crc(b) { let c=0xffffffff; for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)} return (c^0xffffffff)>>>0; }
function chunk(name,data){const t=Buffer.from(name),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return b}
function png(w,h,pixels){const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;const rows=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)pixels.copy(rows,y*(w*4+1)+1,y*w*4,(y+1)*w*4);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])}
function decode(file, layer=28, previous=null){
 const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);if(b.toString('ascii',0,4)!=='SLDX'||b.readUInt16LE(4)!==4)throw new Error('Unsupported SLD');
 // File header 16 bytes, first frame header 12 bytes, then main-layer length.
 const len=b.readUInt32LE(layer),p=layer+4;
 const x=b.readUInt16LE(p),y=b.readUInt16LE(p+2),w=b.readUInt16LE(p+4)-x,h=b.readUInt16LE(p+6)-y;
 if(w<=0||h<=0||w%4||h%4||layer+len>b.length)throw new Error('Invalid main layer');
 const n=b.readUInt16LE(p+10),commands=p+12;let data=commands+n*2,block=0;const rgba=Buffer.alloc(w*h*4);
 // Delta frames reuse skipped blocks at their original canvas positions.
 if(previous&&(b[p+8]&128))for(let py=0;py<h;py++)for(let px=0;px<w;px++){
  const ox=x+px-previous.x,oy=y+py-previous.y;
  if(ox>=0&&oy>=0&&ox<previous.width&&oy<previous.height){const src=(oy*previous.width+ox)*4;previous.pixels.copy(rgba,(py*w+px)*4,src,src+4)}
 }
 const color=c=>[Math.round((c>>11)*255/31),Math.round(((c>>5)&63)*255/63),Math.round((c&31)*255/31),255];
 for(let j=0;j<n;j++){block+=b[commands+j*2];for(let k=0;k<b[commands+j*2+1];k++,block++){
  if(data+8>layer+len||block>=w*h/16)throw new Error('SLD block out of bounds');
  const c0=b.readUInt16LE(data),c1=b.readUInt16LE(data+2),colors=[color(c0),color(c1)];let bits=b.readUInt32LE(data+4);data+=8;
  if(c0>c1){colors.push(colors[0].map((c,i)=>i===3?255:Math.round((2*c+colors[1][i])/3)),colors[0].map((c,i)=>i===3?255:Math.round((c+2*colors[1][i])/3)))}else{colors.push(colors[0].map((c,i)=>i===3?255:Math.round((c+colors[1][i])/2)),[0,0,0,0])}
  const bx=(block%(w/4))*4,by=Math.floor(block/(w/4))*4;
  for(let q=0;q<16;q++){const c=colors[bits&3];bits>>>=2;const offset=((by+Math.floor(q/4))*w+bx+q%4)*4;for(let t=0;t<4;t++)rgba[offset+t]=c[t]}
 }}
 return {png:png(w,h,rgba),pixels:rgba,x,y,width:w,height:h};
}
const graphics=path.join(root,'resources/_common/drs/graphics');
const files={castle:'b_west_castle_age3_x1.sld',crossbowman:'u_arc_crossbowman_idleA_x1.sld',pikeman:'u_inf_pikeman_idleA_x1.sld',knight:'u_cav_knight_idleA_x1.sld',mill:'b_west_mill_age3_x1.sld',lumber:'b_west_lumber_camp_age2_x1.sld',mining:'b_west_mining_camp_age2_x1.sld'};
Object.assign(files,{gold:'n_mine_gold_x1.sld',stone:'n_mine_stone_x1.sld',acacia:'n_tree_acacia_x1.sld',oak:'n_tree_green_oak_x1.sld',palisade:'b_dark_wall_palisade_x1.sld',wallstone:'b_west_wall_stone_x1.sld',wallfortified:'b_west_wall_fortified_x1.sld'});
Object.assign(files,{spearman:'u_inf_spearman_idleA_x1.sld',arbalester:'u_arc_arbalest_idleA_x1.sld',halberdier:'u_inf_halberdier_idleA_x1.sld',cavalier:'u_cav_cavalier_idleA_x1.sld'});
const manifest={civilization:'Britons',format:'static main layers and 24-frame full-cycle animation loops; combat has sixteen directions',files:{}};
for(const[name,file]of Object.entries(files)){const result=decode(path.join(graphics,file));fs.writeFileSync(path.join(output,name+'.png'),result.png);manifest.files[name]={source:file,width:result.width,height:result.height};console.log(name,result.width+'x'+result.height)}
function animation(file,directional=false){
 const b=fs.readFileSync(path.join(graphics,file)),total=b.readUInt16LE(6),size=128;
 const directions=directional?16:1,stride=directional?(total%16===0?total:total-1)/16:(total-1)%16===0?(total-1)/16:total;
 if(!Number.isInteger(stride))throw Error('Unexpected direction layout: '+file);
 const frames=Math.min(24,stride),sheet=Buffer.alloc(size*frames*size*directions*4);let offset=16,previous=null;
 for(let f=0;f<(directional?stride*16:stride);f++){
  const cx=b.readInt16LE(offset+4),cy=b.readInt16LE(offset+6),flags=b[offset+8];offset+=12;
  if(!(flags&1))throw Error('Animation frame missing main layer');
  const main=decode(b,offset,previous);previous=main;
  const direction=directional?Math.floor(f/stride):0,local=Math.min(frames-1,Math.floor((f%stride)*frames/stride));
  for(let y=0;y<main.height;y++)for(let x=0;x<main.width;x++){
   const dx=64+main.x-cx+x,dy=112+main.y-cy+y;
   if(dx>=0&&dx<size&&dy>=0&&dy<size){const src=(y*main.width+x)*4;main.pixels.copy(sheet,((direction*size+dy)*size*frames+local*size+dx)*4,src,src+4)}
  }
  for(let bit=0;bit<5;bit++)if(flags&(1<<bit)){const length=b.readUInt32LE(offset);if(length<4||offset+length>b.length)throw Error('Invalid animation layer');offset+=Math.ceil(length/4)*4}
 }
 return {png:png(size*frames,size*directions,sheet),width:size*frames,height:size*directions,frames,directions};
}
const animations={farmer:'u_vil_male_farmer_taskA_x1.sld',lumberjack:'u_vil_male_lumberjack_taskA_x1.sld',goldminer:'u_vil_male_miner_gold_taskA_x1.sld',stoneminer:'u_vil_male_miner_gold_taskA_x1.sld'};
for(const[name,prefix]of Object.entries({militia:'u_inf_militia',scout:'u_cav_scout',archer:'u_arc_archer',manatarms:'u_inf_manatarms',longsword:'u_inf_longswordsman',crossbowman:'u_arc_crossbowman',pikeman:'u_inf_pikeman',knight:'u_cav_knight',spearman:'u_inf_spearman',arbalester:'u_arc_arbalest',halberdier:'u_inf_halberdier',cavalier:'u_cav_cavalier',skirmisher:'u_arc_skirmisher',eliteskirmisher:'u_arc_eliteskirmisher'})){
 animations[name+'walk']=prefix+'_walkA_x1.sld';animations[name+'attack']=prefix+'_attackA_x1.sld';
}
for(const[name,file]of Object.entries(animations)){const result=animation(file,/(walk|attack)$/.test(name));fs.writeFileSync(path.join(output,name+'.png'),result.png);manifest.files[name]={source:file,width:result.width,height:result.height,frames:result.frames,directions:result.directions};console.log(name,result.frames+' frames × '+result.directions+' directions')}
fs.copyFileSync(path.join(root,'resources/_common/wpfg/resources/civ_emblems/britons.png'),path.join(output,'britons.png'));
for(const resource of ['food','wood','gold','stone'])fs.copyFileSync(path.join(root,'resources/_common/wpfg/resources/ingame/icons','tribute_'+resource+'.png'),path.join(output,'icon-'+resource+'.png'));
// Terrain and farm artwork is stored as DDS rather than building sprites.
function decodeDDS(file){
 const b=fs.readFileSync(file),w=b.readUInt32LE(16),h=b.readUInt32LE(12);
 if(b.toString('ascii',0,4)!=='DDS '||b.toString('ascii',84,88)!=='DXT1'||w>4096||h>4096)throw Error('Unsupported terrain DDS');
 const rgba=Buffer.alloc(w*h*4);let offset=128;
 const rgb=c=>[Math.round((c>>11)*255/31),Math.round(((c>>5)&63)*255/63),Math.round((c&31)*255/31),255];
 for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){const a=b.readUInt16LE(offset),c=b.readUInt16LE(offset+2);let bits=b.readUInt32LE(offset+4);offset+=8;const colors=[rgb(a),rgb(c)];
  colors.push(colors[0].map((v,i)=>i===3?255:Math.round(a>c?(2*v+colors[1][i])/3:(v+colors[1][i])/2)),a>c?colors[0].map((v,i)=>i===3?255:Math.round((v+2*colors[1][i])/3)):[0,0,0,0]);
  for(let q=0;q<16;q++){const col=colors[bits&3];bits>>>=2;const p=((y+(q>>2))*w+x+q%4)*4;for(let k=0;k<4;k++)rgba[p+k]=col[k]}
 }
 // Browser terrain uses a small repeating tile, not the full 2K source.
 const size=1024,small=Buffer.alloc(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const src=(Math.floor(y*h/size)*w+Math.floor(x*w/size))*4;rgba.copy(small,(y*size+x)*4,src,src+4)}
 return {png:png(size,size,small),width:size,height:size};
}
for(const[name,file]of Object.entries({farm:'g_fc1.dds',dryground:'g_des.dds',drygrass:'g_gr4.dds'})){
 const result=decodeDDS(path.join(root,'resources/_common/terrain/textures/2x',file));fs.writeFileSync(path.join(output,name+'.png'),result.png);manifest.files[name]={source:file,width:result.width,height:result.height};console.log(name,result.width+'x'+result.height);
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
