const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createWorkbench,validateAnalysis}=require('./server.cjs');
const ready={状态:'可生成',任务类型:'模特上身图',待确认问题:[],生成指令:'单人正面米白针织上衣，浅灰背景。',需求摘要:'内部整理记录不应整段发送生图'};
test('整理结果需匹配类别，待确认不能混入生成指令',()=>{
 assert.equal(validateAnalysis(ready,'model'),'ready');
 assert.throws(()=>validateAnalysis({...ready,任务类型:'单品展示图'},'model'));
 assert.throws(()=>validateAnalysis({...ready,待确认问题:[{问题:'领口？'}]},'model'));
 assert.equal(validateAnalysis({...ready,状态:'待确认',生成指令:'',待确认问题:[{问题:'领口？'}]},'model'),'waiting');
});
test('真实服务接口：密钥不外泄、模板独立、等待阻断、同一请求不重复',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'fabric-'));
 let imageCalls=0;
 const app=await createWorkbench({dataDir,provider:{understand:async()=>({...ready,状态:'待确认',生成指令:'',待确认问题:[{问题:'请确认领型'}]}),generate:async()=>{imageCalls++;}}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.server.address().port;
 const call=async(url,body)=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-workbench':'1'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}};
 await call('/api/config',{apiKey:'test-secret-not-returned'});
 assert.equal(JSON.stringify((await call('/api/config')).data).includes('test-secret'),false);
 assert.equal((await fetch(base+'/.local/config.json')).status,404);
 assert.equal((await fetch(base+'/api/config',{headers:{Origin:'https://evil.example'}})).status,403);
 const before=(await call('/api/templates')).data;
 await call('/api/templates',{category:'model',stage:'understand',value:'模型独立提示词'});
 const after=(await call('/api/templates')).data;
 assert.equal(after.model.understand,'模型独立提示词');assert.equal(after.product.understand,before.product.understand);
 const body={requestId:'test-request',request:{type:'model',note:'仅文字生成'},assets:[]};
 const one=(await call('/api/jobs',body)).data;
 const two=(await call('/api/jobs',body)).data;
 assert.equal(one.id,two.id);
 await app.idle();
 const job=(await call('/api/jobs/'+one.id)).data;
 assert.equal(job.status,'waiting');assert.equal(imageCalls,0);
 assert.equal(job.templates.understand,'模型独立提示词');
 assert.equal(JSON.parse(await fs.readFile(path.join(dataDir,'jobs',one.id+'.json'),'utf8')).status,'waiting');
});
test('两阶段使用同一组原图和类别模板，真实图片持久化',async t=>{
 const sharp=require('sharp');const png=await sharp({create:{width:30,height:40,channels:3,background:'#eee'}}).png().toBuffer();
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'fabric-success-'));let count=0;
 const app=await createWorkbench({dataDir,provider:{understand:async({job,images})=>{assert.equal(images.length,1);assert.match(images[0],/^data:image\/jpeg;base64,/);assert.match(job.templates.understand,/模特上身图/);return ready;},generate:async({job,images})=>{count++;assert.equal(images.length,1);assert.ok(job.imagePrompt.includes(job.templates.generate));assert.ok(job.imagePrompt.includes(ready.生成指令));assert.ok(!job.imagePrompt.includes(ready.需求摘要));return {buffer:png};}}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(url,payload)=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json','x-workbench':'1'},body:JSON.stringify(payload)});assert.ok(r.ok);return r.json();};
 await post('/api/config',{apiKey:'test-secret-value'});const upload=await post('/api/uploads',{data:'data:image/png;base64,'+png.toString('base64')});
 const job=await post('/api/jobs',{requestId:'test-success',request:{type:'model'},assets:[{id:'ref-1',url:upload.url,role:'上衣基础图'}]});await app.idle();const reviewed=await (await fetch(base+'/api/jobs/'+job.id)).json();await post('/api/jobs/'+job.id+'/generate',{prompt:reviewed.imagePrompt});await app.idle();const finished=await (await fetch(base+'/api/jobs/'+job.id)).json();assert.equal(finished.status,'complete');assert.equal(count,1);assert.equal(finished.result.width,30);const r=await fetch(base+finished.result.url);assert.equal(r.headers.get('content-type'),'image/png');assert.ok((await r.arrayBuffer()).byteLength>0);
});
test('尺寸不得由模型改写、遗漏或添加',()=>{const {validateDimensions}=require('./server.cjs');const r={type:'size',size:{values:{胸围:'92'}}};assert.throws(()=>validateDimensions({尺寸清单:[{部位:'胸围',原始值:'46',单位:'cm'}]},r));assert.throws(()=>validateDimensions({尺寸清单:[]},r));assert.doesNotThrow(()=>validateDimensions({尺寸清单:[{部位:'胸围',原始值:'92',单位:'cm'}]},r));});
test('方舟适配关闭长思考并保留用量；截断输出不得进入生图',async()=>{
 const {provider}=require('./server.cjs');const original=global.fetch;
 const job={templates:{understand:'只输出JSON'},request:{type:'model'},assets:[],answers:[]};
 try{
 global.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.thinking.type,'disabled');assert.equal(body.text.format.type,'json_object');return new Response(JSON.stringify({status:'completed',id:'resp-test',usage:{output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(ready)}]}]}));};
 const result=await provider.understand({job,images:[],config:{apiKey:'test-secret',understandModel:'test-model'}});assert.deepEqual(result.analysis,ready);assert.equal(job.understandUsage.output_tokens,100);
 global.fetch=async()=>new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]}));
 await assert.rejects(()=>provider.understand({job,images:[],config:{}}),/未完成/);
 }finally{global.fetch=original;}
});
test('同请求编号并发提交参考图只创建一个付费任务',async t=>{
 const sharp=require('sharp');const png=await sharp({create:{width:10,height:10,channels:3,background:'#eee'}}).png().toBuffer();let count=0;
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'fabric-concurrent-'));const app=await createWorkbench({dataDir,provider:{understand:async()=>ready,generate:async()=>{count++;return {buffer:png};}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.idle();await new Promise(r=>app.server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(url,payload)=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json','x-workbench':'1'},body:JSON.stringify(payload)});return r.json();};await post('/api/config',{apiKey:'test-secret-concurrent'});const upload=await post('/api/uploads',{data:'data:image/png;base64,'+png.toString('base64')});const payload={requestId:'same-concurrent-request',request:{type:'model'},assets:[{id:'ref-1',url:upload.url,role:'基础图'}]};const results=await Promise.all(Array.from({length:8},()=>post('/api/jobs',payload)));await app.idle();assert.equal(new Set(results.map(x=>x.id)).size,1);assert.equal(count,0);const reviewed=await (await fetch(base+'/api/jobs/'+results[0].id)).json();await post('/api/jobs/'+reviewed.id+'/generate',{prompt:reviewed.imagePrompt});await app.idle();assert.equal(count,1);
});
test('两家密钥独立且不返回网页，等待任务不随服务切换而串用',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'fabric-providers-'));const seen=[];const png=await require('sharp')({create:{width:10,height:10,channels:3,background:'#eee'}}).png().toBuffer();const app=await createWorkbench({dataDir,provider:{understand:async({job,config})=>{seen.push({provider:config.providerId,key:config.apiKey,model:config.understandModel});return job.answers.length?ready:{...ready,状态:'待确认',生成指令:'',待确认问题:[{问题:'确认？'}]};},generate:async({config})=>{assert.equal(config.providerId,'openai');assert.equal(config.apiKey,'openai-private-secret');return {buffer:png};}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.idle();await new Promise(r=>app.server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(url,payload)=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json','x-workbench':'1'},body:JSON.stringify(payload)});assert.ok(r.ok);return r.json();};await post('/api/config',{providerId:'ark',apiKey:'ark-private-secret'});const saved=await post('/api/config',{providerId:'openai',apiKey:'openai-private-secret'});assert.equal(saved.providerId,'openai');assert.equal(saved.understandModel,'gpt-4.1');assert.equal(JSON.stringify(saved).includes('private-secret'),false);assert.equal(saved.providers.every(x=>x.keyPresent),true);
 const job=await post('/api/jobs',{requestId:'openai-isolation-test',request:{type:'model'},assets:[]});await app.idle();await post('/api/config',{providerId:'ark'});await post('/api/jobs/'+job.id+'/answer',{answer:'确认'});await app.idle();const reviewed=await (await fetch(base+'/api/jobs/'+job.id)).json();assert.equal(reviewed.status,'ready');await post('/api/jobs/'+job.id+'/generate',{prompt:reviewed.imagePrompt});await app.idle();assert.equal(seen.length,2);assert.ok(seen.every(x=>x.provider==='openai'&&x.key==='openai-private-secret'&&x.model==='gpt-4.1'));const now=await (await fetch(base+'/api/config')).json();assert.equal(now.providerId,'ark');assert.equal(now.keyPresent,true);
});
test('服务在另一标签页切换后，旧页面不得向新服务提交素材',async t=>{const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'fabric-provider-change-'));let calls=0;const app=await createWorkbench({dataDir,provider:{understand:async()=>{calls++;return ready;}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.idle();await new Promise(r=>app.server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;const post=(url,payload)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json','x-workbench':'1'},body:JSON.stringify(payload)});await post('/api/config',{providerId:'openai',apiKey:'test-private-openai'});const r=await post('/api/jobs',{requestId:'outdated-provider-test',expectedProvider:'ark',request:{type:'model'},assets:[]});assert.equal(r.status,409);await app.idle();assert.equal(calls,0);});
test('人工审阅流程暂停生图，编辑指令原样传入，重复点击只生成一次',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'fabric-review-'));let calls=0;
 const png=await require('sharp')({create:{width:10,height:10,channels:3,background:'#eee'}}).png().toBuffer();
 const app=await createWorkbench({dataDir,provider:{understand:async({job})=>{assert.equal(job.request.原始汇总,'人工原稿');return ready;},generate:async({job})=>{calls++;assert.equal(job.imagePrompt,'人工优化指令');return {buffer:png};}}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.idle();await new Promise(r=>app.server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 const post=(url,data)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json','x-workbench':'1'},body:JSON.stringify(data)});
 await post('/api/config',{apiKey:'test-review-key'});const job=await (await post('/api/jobs',{requestId:'review-stage-test',reviewBeforeGenerate:true,request:{type:'model',原始汇总:'人工原稿'},assets:[]})).json();await app.idle();let saved=await (await fetch(base+'/api/jobs/'+job.id)).json();assert.equal(saved.status,'ready');assert.equal(calls,0);assert.ok(saved.aiImagePrompt.includes(ready.生成指令));assert.equal((await post('/api/jobs/'+job.id+'/generate',{prompt:''})).status,400);
 await Promise.all(Array.from({length:5},()=>post('/api/jobs/'+job.id+'/generate',{prompt:'人工优化指令'})));await app.idle();assert.equal(calls,1);saved=await (await fetch(base+'/api/jobs/'+job.id)).json();assert.equal(saved.status,'complete');assert.equal(saved.imagePrompt,'人工优化指令');
});
test('尺寸模型漏填单位时沿用页面 cm，原始数值和错误单位仍严格校验',()=>{
 const {validateDimensions}=require('./server.cjs');const request={type:'size',size:{values:{衣长:'122',胸围:'92.0'}}};
 const analysis={尺寸清单:[{部位:'衣长',原始值:'122',单位:'',显示文本:'衣长122'},{部位:'胸围',原始值:'92.0'}]};
 assert.doesNotThrow(()=>validateDimensions(analysis,request));assert.deepEqual(analysis.尺寸清单.map(x=>x.单位),['cm','cm']);assert.equal(analysis.尺寸清单[1].原始值,'92.0');assert.equal(analysis.尺寸清单[0].显示文本,'衣长122 cm');
 for(const unit of ['mm','inch'])assert.throws(()=>validateDimensions({尺寸清单:[{部位:'衣长',原始值:'122',单位:unit}]},{type:'size',size:{values:{衣长:'122'}}}));
 assert.throws(()=>validateDimensions({尺寸清单:[{部位:'衣长',原始值:'61',单位:''}]},{type:'size',size:{values:{衣长:'122'}}}));
});
test('尺寸保留区间和逐项单位，倍率不被改成 cm',()=>{
 const {validateDimensions}=require('./server.cjs');
 const r={type:'size',size:{values:{腰围:'66（拉伸至78）',拼接褶量:'1.8',说明:'保持原款'},units:{腰围:'cm',拼接褶量:'倍',说明:''}}};
 const a={尺寸清单:[{部位:'腰围',原始值:'66（拉伸至78）',单位:'cm'},{部位:'拼接褶量',原始值:'1.8',单位:'倍'},{部位:'说明',原始值:'保持原款',单位:''}]};
 assert.doesNotThrow(()=>validateDimensions(a,r));assert.equal(a.尺寸清单[2].单位,'');
 a.尺寸清单[1].单位='cm';assert.throws(()=>validateDimensions(a,r));
});
test('成图微调使用父图、独立版本，并发提交不重复生成',async t=>{
 const png=await require('sharp')({create:{width:20,height:30,channels:3,background:'#ddd'}}).png().toBuffer();const dir=await fs.mkdtemp(path.join(os.tmpdir(),'refine-test-'));let count=0;
 const app=await createWorkbench({dataDir:dir,provider:{understand:async()=>ready,generate:async({job,images})=>{count++;if(job.parentId){assert.equal(images.length,2);assert.match(job.assets[0].url,/\/media\/results\//);assert.match(job.imagePrompt,/当前选中的成图/);assert.match(job.imagePrompt,/嘴唇自然闭合/);assert.match(job.imagePrompt,/双肩和骨盆水平/);assert.match(job.imagePrompt,/双脚平行朝前/);assert.match(job.imagePrompt,/纠正/);assert.match(job.imagePrompt,/面容与服装同时清晰对焦/);assert.doesNotMatch(job.imagePrompt,/保留未要求修改的人物身份、站姿/);}return {buffer:png};}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.idle();await new Promise(r=>app.server.close(r));await fs.rm(dir,{recursive:true,force:true});});const b='http://127.0.0.1:'+app.server.address().port;
 const post=async(url,data)=>{const r=await fetch(b+url,{method:'POST',headers:{'X-Workbench':'1','Content-Type':'application/json'},body:JSON.stringify(data)});assert.ok(r.ok,await r.clone().text());return r.json();};
 await post('/api/config',{apiKey:'mock-key-refine'});const upload=await post('/api/uploads',{data:'data:image/png;base64,'+png.toString('base64')});const j=await post('/api/jobs',{requestId:'refine-parent',request:{type:'model'},assets:[]});await app.idle();const r=await(await fetch(b+'/api/jobs/'+j.id)).json();await post('/api/jobs/'+j.id+'/generate',{prompt:r.imagePrompt});await app.idle();
 const data={requestId:'refine-child-same',note:'仅把纽扣改成深棕色',references:[{url:upload.url,role:'纽扣颜色'}]};const kids=await Promise.all([post('/api/jobs/'+j.id+'/refine',data),post('/api/jobs/'+j.id+'/refine',data)]);assert.equal(kids[0].id,kids[1].id);await app.idle();assert.equal(count,2);const child=await(await fetch(b+'/api/jobs/'+kids[0].id)).json();assert.equal(child.status,'complete');assert.equal(child.parentId,j.id);assert.notEqual(child.result.url,(await(await fetch(b+'/api/jobs/'+j.id)).json()).result.url);
 await post('/api/jobs/'+child.id+'/refine',{...data,requestId:'refine-grandchild'});await app.idle();assert.equal(count,3);
});
test('审核失败详情持久保存且不会自动重试',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moderation-job-'));let calls=0;const details={code:'moderation_blocked',stage:'output',categories:['sexual']};
 const app=await createWorkbench({dataDir:dir,provider:{understand:async()=>ready,generate:async()=>{calls++;throw Object.assign(new Error('OpenAI 内容审核未通过：生成结果审核未通过，本次未返回图片。'),{status:502,moderationDetails:details});}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.idle();await new Promise(r=>app.server.close(r));await fs.rm(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(url,data)=>{const r=await fetch(base+url,{method:'POST',headers:{'X-Workbench':'1','Content-Type':'application/json'},body:JSON.stringify(data)});assert.ok(r.ok);return r.json();};
 await post('/api/config',{apiKey:'mock-key-only'});const created=await post('/api/jobs',{requestId:'moderation-test',request:{type:'model'},assets:[]});await app.idle();const readyJob=await(await fetch(base+'/api/jobs/'+created.id)).json();await post('/api/jobs/'+created.id+'/generate',{prompt:readyJob.imagePrompt});await app.idle();const failed=await(await fetch(base+'/api/jobs/'+created.id)).json();assert.equal(failed.status,'failed');assert.deepEqual(failed.moderationDetails,details);assert.match(failed.error,/内容审核未通过/);assert.equal(calls,1);const saved=JSON.parse(await fs.readFile(path.join(dir,'jobs',created.id+'.json'),'utf8'));assert.deepEqual(saved.moderationDetails,details);
});
test('单品任务按上衣、裤子和连衣裙自动附加对应模板，两阶段原图一致且只生成一次',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'product-layout-'));const png=await require('sharp')({create:{width:20,height:20,channels:3,background:'#eee'}}).png().toBuffer();const seen=new Map();let calls=0;
 const app=await createWorkbench({dataDir:dir,provider:{understand:async({job,images})=>{const kind=job.request.product.garment==='上衣'?'top':job.request.product.subtype==='裤子'?'pants':job.request.product.garment==='连衣裙'?'dress':null;assert.equal(images.length,kind?2:1);if(kind){assert.equal(job.assets[1].url,'assets/product-layout-'+kind+'.png');assert.equal(job.request.product.layoutReference,job.assets[1].id);assert.match(job.assets[1].role,/不得借用服装设计/);}seen.set(job.id,images);return {状态:'可生成',任务类型:'单品展示图',待确认问题:[],生成指令:'同款正背面与所选细节拼接'};},generate:async({job,images})=>{calls++;assert.deepEqual(images,seen.get(job.id));return {buffer:png};}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.idle();await new Promise(r=>app.server.close(r));await fs.rm(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(url,data)=>{const r=await fetch(base+url,{method:'POST',headers:{'X-Workbench':'1','Content-Type':'application/json'},body:JSON.stringify(data)});assert.ok(r.ok,await r.clone().text());return r.json();};await post('/api/config',{apiKey:'mock-product-key'});const uploaded=await post('/api/uploads',{data:'data:image/png;base64,'+png.toString('base64')});
 for(const [index,product]of [{garment:'上衣'},{garment:'下装',subtype:'裤子'},{garment:'下装',subtype:'半身裙'},{garment:'连衣裙'}].entries()){const j=await post('/api/jobs',{requestId:'product-layout-'+index,request:{type:'product',product},assets:[{id:'ref-1',url:uploaded.url,role:'已确认设计图'}]});await app.idle();const readyJob=await(await fetch(base+'/api/jobs/'+j.id)).json();assert.equal(readyJob.status,'ready');assert.equal(calls,index);await post('/api/jobs/'+j.id+'/generate',{prompt:readyJob.imagePrompt});await app.idle();assert.equal((await(await fetch(base+'/api/jobs/'+j.id)).json()).status,'complete');}assert.equal(calls,4);
});
