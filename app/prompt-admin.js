(() => {
 const categories = { model: '模特上身图', product: '单品展示图', size: '尺寸标注图' };
 const stages = { understand: '需求理解与整理', generate: '图片生成' };
 const defaults = window.FABRIC_PIG_PROMPT_TEMPLATES.templates;
 const templateVersion = window.FABRIC_PIG_PROMPT_TEMPLATES.version;
 const key = 'fabric-pig.prompt-templates.v2';
 function load() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch { saved = null; }
  return Object.fromEntries(Object.keys(categories).map(category => [category, Object.fromEntries(Object.keys(stages).map(stage => {
   const value = saved?.[category]?.[stage];
   return [stage, typeof value === 'string' && value.trim() ? value : defaults[category][stage]];
  }))]));
 }
 const live = location.protocol !== 'file:';
 const drafts = live ? structuredClone(defaults) : load();
 let serverReady = !live;
 const messages = Object.fromEntries(Object.keys(categories).map(category => [category, { understand: '已载入当前模板', generate: '已载入当前模板' }]));
 let category = 'model', scrollY = 0;
 const style = document.createElement('style');
 style.textContent = `#open-prompt-admin{white-space:nowrap;color:#993b59;background:#fff;border:1px solid #e6d6df;border-radius:7px;padding:8px 12px;font:inherit;cursor:pointer}body.prompt-admin-open> :not(#prompt-admin){display:none!important}#prompt-admin[hidden]{display:none!important}#prompt-admin{min-height:100vh;width:100%;color:#29262c;background:#f5f4f6;font:14px/1.6 "PingFang SC",sans-serif}#prompt-admin *{box-sizing:border-box}#prompt-admin button{font:inherit;border:1px solid #e6e3e8;background:white;border-radius:7px;padding:10px 14px;cursor:pointer;color:#29262c}#prompt-admin button:focus-visible,#prompt-admin textarea:focus-visible{outline:3px solid #bc7894;outline-offset:2px}.admin-top{display:flex;justify-content:space-between;align-items:center;gap:20px;background:white;border-bottom:1px solid #e6e3e8;padding:22px 32px}.admin-top h1{font-size:23px;margin:0}.admin-note{color:#79747e;font-size:12px;margin:5px 0 0}.admin-top button{white-space:nowrap;flex-shrink:0}.admin-layout{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:calc(100vh - 100px)}.admin-nav{padding:28px 18px;border-right:1px solid #e6e3e8;background:#fff}.admin-nav p{margin:0 12px 16px;font-size:12px;color:#79747e;letter-spacing:1px}.admin-nav button{display:block;text-align:left;width:100%;margin:0 0 10px}.admin-nav button small{display:block;font-size:11px;margin-top:4px;opacity:.75}#prompt-admin .admin-nav button[aria-pressed=true]{background:#f6eaf0;color:#993b59;border-color:#e7ccda}.admin-main{padding:28px 32px;min-width:0}.admin-title-row{display:flex;gap:16px;justify-content:space-between;align-items:center;margin-bottom:20px}.admin-title-row h2{font-size:21px;margin:0}.admin-count{font-size:12px;color:#80576b;background:#f6eaf0;border-radius:20px;padding:5px 12px;white-space:nowrap}.admin-flow{font-size:12px;color:#79747e;margin-bottom:22px}.admin-editors{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px}.admin-card{background:white;border:1px solid #e6e3e8;border-radius:12px;overflow:hidden;min-width:0}.admin-card-head{padding:20px;border-bottom:1px solid #e6e3e8}.admin-card-head label{display:block;font-size:16px;font-weight:600}.admin-card textarea{display:block;width:calc(100% - 40px);height:max(390px,calc(100vh - 485px));margin:20px;padding:15px;border:1px solid #e6e3e8;border-radius:7px;background:#fdfcfd;resize:vertical;color:#29262c;font:13px/1.9 "PingFang SC",sans-serif}.admin-card-footer{padding:0 20px 20px}.admin-card-footer p{min-height:22px;font-size:12px;color:#80576b;margin:0 0 12px}.admin-actions{display:flex;justify-content:space-between;gap:12px}#prompt-admin [data-save-prompt]{background:#993b59;color:white;border-color:#993b59}.admin-boundary{margin-top:22px;font-size:12px;color:#79747e;line-height:1.8}@media(max-width:1000px){.admin-layout{grid-template-columns:180px minmax(0,1fr)}.admin-main{padding:24px 20px}.admin-editors{grid-template-columns:1fr}.admin-card textarea{height:390px}}@media(max-width:600px){.admin-top{padding:18px 16px;gap:10px}.admin-top h1{font-size:20px}.admin-top .admin-note{max-width:210px}.admin-layout{display:block}.admin-nav{padding:14px 12px;border-right:0;border-bottom:1px solid #e6e3e8;display:flex;gap:6px}.admin-nav p,.admin-nav small{display:none!important}.admin-nav button{margin:0!important;padding:9px 7px!important;text-align:center;font-size:12px!important}.admin-main{padding:20px 12px}.admin-title-row{gap:8px}.admin-title-row h2{font-size:19px}.admin-count{font-size:11px;padding:4px 8px}.admin-card-head{padding:16px}.admin-card textarea{width:calc(100% - 32px);margin:16px;padding:12px}.admin-card-footer{padding:0 16px 16px}}`;
 document.head.append(style);
 const opener = document.createElement('button');
 opener.id = 'open-prompt-admin'; opener.textContent = '管理后台';
 const header = document.querySelector('header');
 (header.querySelector('.header-right') || header).append(opener);
 const admin = document.createElement('main');
 admin.id = 'prompt-admin'; admin.hidden = true;
 admin.innerHTML = `<div class="admin-top"><div><h1>管理后台</h1><p class="admin-note">三类生图任务 · 六套独立提示词 · 内置版本 ${templateVersion}</p></div><button id="close-prompt-admin">← 返回工作台</button></div><div class="admin-layout"><nav class="admin-nav" aria-label="生图类别"><p>提示词管理</p>${Object.entries(categories).map(([name,title]) => `<button data-admin-category="${name}" aria-pressed="${name === 'model'}">${title}<small>需求整理 / 图片生成</small></button>`).join('')}</nav><section class="admin-main"><div class="admin-title-row"><div><h2 id="admin-category-title"></h2><p class="admin-note">两套提示词独立编辑、独立保存，不影响其他类别。</p></div><span class="admin-count">每类 2 套</span></div><p class="admin-flow">原始输入汇总 → ① 需求理解与整理 → ② 图片生成</p><div class="admin-editors">${Object.entries(stages).map(([name,title],index) => `<section class="admin-card"><div class="admin-card-head"><label for="admin-${name}">${index + 1 === 1 ? '①' : '②'} ${title}</label><p class="admin-note">${name === 'understand' ? '理解素材与文字，明确保留项、修改项和待确认项。' : '根据整理后的说明和原始参考图执行生成。'}</p></div><textarea id="admin-${name}" spellcheck="false"></textarea><div class="admin-card-footer"><p id="status-${name}" role="status" aria-live="polite"></p><div class="admin-actions"><button data-reset-prompt="${name}">恢复本套默认</button><button data-save-prompt="${name}">保存本套提示词</button></div></div></section>`).join('')}</div><p class="admin-boundary">内置版本 ${templateVersion}。已保存的自定义内容优先显示；如需采用新内置版本，请逐套点击“恢复本套默认”后保存。当前为本地配置演示：尚未接入需求理解或生图服务。切换类别或返回工作台会保留未保存草稿；刷新页面前请保存。尺寸数字、单位和标注线仍需后续通过程序叠加。</p></section></div>`;
 const layoutPanel=document.createElement('section');layoutPanel.id='admin-product-layouts';layoutPanel.hidden=true;layoutPanel.className='admin-card';layoutPanel.style.cssText='padding:18px;margin-bottom:22px';
 layoutPanel.innerHTML='<h3>内置拼接图模板 · 自动随单品任务发送</h3><p class="admin-note">上衣、裤子和连衣裙分别使用对应模板。只参考布局、白底、留白和摄影质感，不借用模板服装的颜色、版型、材质或图案。连衣裙采用竖向正背面加下方两排细节；半身裙使用通用拼接规则。</p><div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px"><figure style="flex:1;min-width:160px;margin:0"><a href="assets/product-layout-top.png" target="_blank" rel="noopener"><img src="assets/product-layout-top.png" alt="上衣单品展示内置模板" style="width:100%;max-height:260px;object-fit:contain"></a><figcaption>上衣：左正面、右背面，下方为所选细节</figcaption></figure><figure style="flex:1;min-width:160px;margin:0"><a href="assets/product-layout-pants.png" target="_blank" rel="noopener"><img src="assets/product-layout-pants.png" alt="裤子单品展示内置模板" style="width:100%;max-height:260px;object-fit:contain"></a><figcaption>裤子：左正面、右背面，下方为所选细节</figcaption></figure><figure style="flex:1;min-width:160px;margin:0"><a href="assets/product-layout-dress.png" target="_blank" rel="noopener"><img src="assets/product-layout-dress.png" alt="连衣裙单品展示内置模板" style="width:100%;max-height:260px;object-fit:contain"></a><figcaption>连衣裙：上方正背面，下方两排所选细节</figcaption></figure></div>';
 admin.querySelector('.admin-editors').before(layoutPanel);
 document.body.append(admin);
 if (live) {
  admin.querySelector('.admin-boundary').textContent = '提示词保存到本机服务端。新任务采用已保存版本，进行中的任务使用提交时的模板快照。尺寸数字由程序叠加。';
  const connection = document.createElement('a'); connection.href='/setup.html'; connection.textContent='模型连接设置'; connection.style.cssText='display:block;margin:20px 12px;color:#993b59'; admin.querySelector('.admin-nav').append(connection);
  fetch('/api/templates').then(r=>{if(!r.ok)throw Error();return r.json()}).then(saved=>{Object.assign(drafts,saved);serverReady=true;render();}).catch(()=>{Object.keys(stages).forEach(s=>setStatus(s,'服务端模板读取失败，请刷新后重试。'));});
 }
 const field = stage => admin.querySelector('#admin-' + stage);
 function setStatus(stage, text) { messages[category][stage] = text; admin.querySelector('#status-' + stage).textContent = text; }
 function render() {
  admin.querySelector('#admin-category-title').textContent = categories[category];
  layoutPanel.hidden=category!=='product';
  admin.querySelectorAll('[data-admin-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.adminCategory === category)));
  Object.keys(stages).forEach(stage => { field(stage).value = drafts[category][stage]; admin.querySelector('#status-' + stage).textContent = messages[category][stage]; });
 }
 opener.addEventListener('click', () => { scrollY = window.scrollY; render(); document.body.classList.add('prompt-admin-open'); admin.hidden = false; window.scrollTo(0, 0); admin.querySelector('#close-prompt-admin').focus({ preventScroll: true }); });
 admin.querySelector('#close-prompt-admin').addEventListener('click', () => { admin.hidden = true; document.body.classList.remove('prompt-admin-open'); opener.focus({ preventScroll: true }); window.scrollTo(0, scrollY); });
 admin.querySelectorAll('[data-admin-category]').forEach(button => button.addEventListener('click', () => { category = button.dataset.adminCategory; render(); }));
 Object.keys(stages).forEach(stage => {
  field(stage).addEventListener('input', () => { drafts[category][stage] = field(stage).value; setStatus(stage, '有未保存的修改'); });
  admin.querySelector(`[data-reset-prompt="${stage}"]`).addEventListener('click', () => { drafts[category][stage] = defaults[category][stage]; field(stage).value = drafts[category][stage]; setStatus(stage, '已恢复本套默认内容，点击保存后生效。'); });
  admin.querySelector(`[data-save-prompt="${stage}"]`).addEventListener('click', async () => {
   if (!serverReady) {setStatus(stage,'服务端模板尚未载入，请稍后重试。');return;}
   const selectedCategory=category;
   const value = field(stage).value.trim();
   if (!value) { setStatus(stage, '提示词不能为空，请填写内容或恢复默认。'); return; }
   if(live){
    try { const response=await fetch('/api/templates',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench':'1'},body:JSON.stringify({category:selectedCategory,stage,value})}); const result=await response.json(); if(!response.ok)throw Error(result.error);drafts[selectedCategory][stage]=value;messages[selectedCategory][stage]='已保存到本机服务端，新任务立即生效。';if(category===selectedCategory)render(); }catch(error){setStatus(stage,'保存失败：'+error.message);}return;
   }
   try { const saved = load(); saved[category][stage] = value; localStorage.setItem(key, JSON.stringify(saved)); drafts[category][stage] = value; field(stage).value = value; setStatus(stage, '本套提示词已保存到当前浏览器。'); }
   catch { setStatus(stage, '保存失败，请保留编辑内容并检查浏览器存储设置。'); }
  });
 });
})();
