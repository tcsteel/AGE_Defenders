/* Native WebGPU sprite/geometry renderer. Canvas 2D is used only to rasterize
   small text textures and as a compatibility backend, not as a GPU framebuffer. */
(() => {
 const defaults={renderer:'auto',resolution:1,shadows:true,particles:true,details:true,lighting:true,grid:'subtle',frameLimit:60,master:.7,music:.45,sfx:.75,mute:false};
 function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
 const settings={...defaults,...read('castlehold.settings.v1',{})};
 const colorCache=new Map();
 function color(value,alpha=1){
  let c=colorCache.get(value);if(!c){const hex=String(value).replace('#','');if(/^[\da-f]+$/i.test(hex)&&[3,4,6,8].includes(hex.length)){const h=hex.length<5?[...hex].map(x=>x+x).join(''):hex;c=[parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255,h.length===8?parseInt(h.slice(6,8),16)/255:1]}else c=value==='white'?[1,1,1,1]:[0,0,0,1];colorCache.set(value,c)}return[c[0],c[1],c[2],c[3]*alpha];
 }
 class GPUSurface {
  constructor(canvas){
   this.canvas=canvas;this.matrix=[1,0,0,1,0,0];this.stack=[];this.fillStyle='#ffffff';this.strokeStyle='#ffffff';this.globalAlpha=1;this.lineWidth=1;this.font='12px sans-serif';this.textAlign='left';this.shadowBlur=0;this.shadowColor='#000000';this.vertices=[];this.batches=[];this.images=new WeakMap();this.texts=new Map();this.path=[];this.retired=[];
   this.measureCanvas=document.createElement('canvas');this.measure=this.measureCanvas.getContext('2d');
   this.layer=document.createElement('canvas');this.layer.className='gpu-layer';this.layer.setAttribute('aria-hidden','true');canvas.before(this.layer);this.layer.style.cssText='position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:0';
   this.imageTint=[1,1,1,1];this.ready=this.init();
  }
  async init(){
   try{
    if(settings.renderer==='canvas')throw Error('Canvas compatibility mode selected');
    if(!navigator.gpu)throw Error('WebGPU is unavailable in this browser');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'})??await navigator.gpu.requestAdapter({forceFallbackAdapter:true});if(!adapter)throw Error('No WebGPU adapter available');
    this.device=await adapter.requestDevice();this.context=this.layer.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});
    const code=`struct VOut{@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) tint:vec4f};
    @vertex fn vs(@location(0) p:vec2f,@location(1) uv:vec2f,@location(2) tint:vec4f)->VOut{var o:VOut;o.pos=vec4f(p,0,1);o.uv=uv;o.tint=tint;return o;}
    @group(0) @binding(0) var samp:sampler;@group(0) @binding(1) var tex:texture_2d<f32>;
    @fragment fn fs(i:VOut)->@location(0) vec4f{let c=textureSample(tex,samp,i.uv)*i.tint;return c;}`;
    const module=this.device.createShaderModule({code});
    this.pipeline=this.device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs',buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x2'},{shaderLocation:2,offset:16,format:'float32x4'}]}]},fragment:{module,entryPoint:'fs',targets:[{format:this.format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
    this.sampler=this.device.createSampler({magFilter:'linear',minFilter:'linear'});
    const white=new Uint8Array([255,255,255,255]);this.white=this.makeTexture(1,1);this.device.queue.writeTexture({texture:this.white.texture},white,{bytesPerRow:4},{width:1,height:1});
    this.active=true;canvasHidden(this.canvas,true);CastleEngine.status='WebGPU · native sprite rendering';
    this.device.lost.then(info=>{this.lost=true;if(this.active)this.fallback('WebGPU device lost: '+info.message)});
    this.device.addEventListener('uncapturederror',e=>{console.error('WebGPU:',e.error);this.fallback('WebGPU rendering error; compatibility mode active')});
   }catch(error){this.fallback(error.message)}
   CastleEngine.onStatus?.(CastleEngine.status);return this;
  }
  fallback(reason){this.active=false;this.layer.style.display='none';canvasHidden(this.canvas,false);this.fallbackContext=this.canvas.getContext('2d');CastleEngine.status='Canvas 2D · '+reason;CastleEngine.onStatus?.(CastleEngine.status)}
  async switchBackend(mode){if(mode==='canvas'){this.fallback('Compatibility mode selected');return}if(this.device&&!this.lost){this.active=true;this.layer.style.display='block';canvasHidden(this.canvas,true);CastleEngine.status='WebGPU · native sprite rendering';CastleEngine.onStatus?.(CastleEngine.status)}else await this.init()}
  makeTexture(width,height){const texture=this.device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return{texture,group:this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.sampler},{binding:1,resource:texture.createView()}]}),width,height}}
  imageTexture(img){let value=this.images.get(img);if(!value){const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;if(!width||!height)return null;value=this.makeTexture(width,height);this.device.queue.copyExternalImageToTexture({source:img},{texture:value.texture,premultipliedAlpha:false},{width,height});this.images.set(img,value)}return value}
  point(x,y){const m=this.matrix;return[(m[0]*x+m[2]*y+m[4])/this.canvas.width*2-1,1-(m[1]*x+m[3]*y+m[5])/this.canvas.height*2]}
  quad(tex,x,y,w,h,uv=[0,0,1,1],tint=[1,1,1,1]){
   if(!this.active||!tex)return;const corners=[[x,y,uv[0],uv[1]],[x+w,y,uv[2],uv[1]],[x,y+h,uv[0],uv[3]],[x+w,y+h,uv[2],uv[3]]],start=this.vertices.length/8;
   for(const index of [0,1,2,2,1,3]){const c=corners[index],p=this.point(c[0],c[1]);this.vertices.push(p[0],p[1],c[2],c[3],...tint)}
   const last=this.batches.at(-1);if(last?.tex===tex)last.count+=6;else this.batches.push({tex,start,count:6});
  }
  setTransform(a,b,c,d,e,f){this.vertices=[];this.batches=[];this.matrix=[a,b,c,d,e,f];if(this.active){if(this.layer.width!==this.canvas.width)this.layer.width=this.canvas.width;if(this.layer.height!==this.canvas.height)this.layer.height=this.canvas.height;this.layer.style.height=this.canvas.getBoundingClientRect().height+'px'}else this.fallbackContext?.setTransform(a,b,c,d,e,f)}
  transform(a,b,c,d,e,f){if(!this.active){this.fallbackContext?.transform(a,b,c,d,e,f);return}const m=this.matrix;this.matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]]}
  translate(x,y){this.transform(1,0,0,1,x,y)}scale(x,y){this.transform(x,0,0,y,0,0)}
  save(){this.stack.push({matrix:[...this.matrix],fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,globalAlpha:this.globalAlpha,lineWidth:this.lineWidth,font:this.font,textAlign:this.textAlign,shadowBlur:this.shadowBlur,shadowColor:this.shadowColor,imageTint:[...this.imageTint]});if(!this.active)this.fallbackContext?.save()}
  restore(){if(!this.active)this.fallbackContext?.restore();const value=this.stack.pop();if(value)Object.assign(this,value)}
  sync(){const c=this.fallbackContext;if(c){for(const k of ['fillStyle','strokeStyle','globalAlpha','lineWidth','font','textAlign','shadowBlur','shadowColor'])c[k]=this[k];c.filter=this.imageTint[0]===0?'brightness(0)':'none'}}
  fillRect(x,y,w,h){if(!this.active){this.sync();this.fallbackContext?.fillRect(x,y,w,h);return}this.quad(this.white,x,y,w,h,[0,0,1,1],color(this.fillStyle,this.globalAlpha))}
  strokeRect(x,y,w,h){if(!this.active){this.sync();this.fallbackContext?.strokeRect(x,y,w,h);return}const old=this.fillStyle;this.fillStyle=this.strokeStyle;const n=this.lineWidth;this.fillRect(x,y,w,n);this.fillRect(x,y+h-n,w,n);this.fillRect(x,y,n,h);this.fillRect(x+w-n,y,n,h);this.fillStyle=old}
  drawImage(img,...args){if(!this.active){this.sync();this.fallbackContext?.drawImage(img,...args);return}const tex=this.imageTexture(img);if(!tex)return;let x,y,w,h,uv=[0,0,1,1];if(args.length===8){const[sx,sy,sw,sh,dx,dy,dw,dh]=args;[x,y,w,h]=[dx,dy,dw,dh];uv=[sx/tex.width,sy/tex.height,(sx+sw)/tex.width,(sy+sh)/tex.height]}else if(args.length===4)[x,y,w,h]=args;else[x,y,w,h]=[args[0],args[1],tex.width,tex.height];this.quad(tex,x,y,w,h,uv,[this.imageTint[0],this.imageTint[1],this.imageTint[2],this.globalAlpha*this.imageTint[3]])}
  measureText(text){this.measure.font=this.font;return this.measure.measureText(text)}
  fillText(text,x,y){
   if(!this.active){this.sync();this.fallbackContext?.fillText(text,x,y);return}
   const key=[text,this.font,this.fillStyle,this.shadowBlur,this.shadowColor].join('|');let entry=this.texts.get(key);
   if(!entry){const size=Number(this.font.match(/([\d.]+)px/)?.[1]||12),width=Math.ceil(this.measureText(text).width),height=Math.ceil(size*1.8+12),c=document.createElement('canvas');c.width=(width+16)*2;c.height=height*2;const t=c.getContext('2d');t.scale(2,2);t.font=this.font;t.fillStyle=this.fillStyle;t.shadowColor=this.shadowColor;t.shadowBlur=this.shadowBlur;t.fillText(text,8,size+6);entry={tex:this.imageTexture(c),width,height,size};this.texts.set(key,entry);if(this.texts.size>700){const first=this.texts.keys().next().value;this.retired.push(this.texts.get(first).tex.texture);this.texts.delete(first)}}
   const shift=this.textAlign==='center'?entry.width/2:this.textAlign==='right'?entry.width:0;this.quad(entry.tex,x-shift-8,y-entry.size-6,entry.width+16,entry.height,[0,0,1,1],[1,1,1,this.globalAlpha]);
  }
  beginPath(){this.path=[];if(!this.active)this.fallbackContext?.beginPath()}moveTo(x,y){this.path.push({x,y,move:true});if(!this.active)this.fallbackContext?.moveTo(x,y)}lineTo(x,y){this.path.push({x,y});if(!this.active)this.fallbackContext?.lineTo(x,y)}
  stroke(){if(!this.active){this.sync();this.fallbackContext?.stroke();return}let previous=null;const old=this.fillStyle;this.fillStyle=this.strokeStyle;for(const p of this.path){if(previous&&!p.move){const dx=p.x-previous.x,dy=p.y-previous.y,length=Math.hypot(dx,dy);if(length){this.save();this.transform(dx/length,dy/length,-dy/length,dx/length,previous.x,previous.y);this.fillRect(0,-this.lineWidth/2,length,this.lineWidth);this.restore()}}previous=p}this.fillStyle=old}
  present(){
   if(!this.active||!this.vertices.length)return;
   try{const data=new Float32Array(this.vertices);if(!this.buffer||this.buffer.size<data.byteLength){this.buffer?.destroy();this.buffer=this.device.createBuffer({size:Math.max(65536,2**Math.ceil(Math.log2(data.byteLength))),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})}this.device.queue.writeBuffer(this.buffer,0,data);const encoder=this.device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.08,g:.1,b:.07,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(this.pipeline);pass.setVertexBuffer(0,this.buffer);for(const batch of this.batches){pass.setBindGroup(0,batch.tex.group);pass.draw(batch.count,1,batch.start)}pass.end();this.device.queue.submit([encoder.finish()]);for(const texture of this.retired)texture.destroy();this.retired=[]}catch(e){console.error(e);this.fallback(e.message)}
  }
 }
 function canvasHidden(canvas,hidden){canvas.style.opacity=hidden?'0':'1';canvas.style.position='relative';canvas.style.zIndex='1'}
 window.CastleEngine={settings,defaults,read,status:'Initializing renderer…',createSurface:canvas=>(CastleEngine.surface=new GPUSurface(canvas)),saveSettings(){try{localStorage.setItem('castlehold.settings.v1',JSON.stringify(settings))}catch{}},GPUSurface};
})();
