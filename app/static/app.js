let me=null, selectedAvatar=null, editingId=null, attachQueue=[], currentUpload=null, failedBatch=null, uploadQueueLabel=''; let pendingAvatarBlob=null, pendingAvatarUrl=null; const expandedMessages=new Set(); const messageStore=new Map(); const fileStore=new Map();
let chatMode=(localStorage.getItem('lanchat_mode')==='private')?'private':'public';
function isPrivateMode(){return chatMode==='private'}
function msgInCurrentView(m){ if(!m) return false; if(chatMode==='private') return !!m.private && me && m.user_id===me.id; return !m.private; }
function updateModeUI(){ const priv=isPrivateMode(); document.querySelectorAll('[data-mode-label]').forEach(el=>el.textContent=priv?'私人模式':'群聊模式'); const badge=$('#modeBadge'); if(badge){ badge.classList.toggle('private',priv); badge.querySelector('.mode-badge-text').textContent=priv?'🔒 私人模式':'💬 群聊模式'; } const seg=$('#modeSeg'); if(seg){ seg.querySelectorAll('[data-mode-opt]').forEach(b=>b.classList.toggle('active', b.dataset.modeOpt===chatMode)); } const inp=$('#messageInput'); if(inp) inp.placeholder=priv?'输入私人消息（仅自己可见）…':'输入消息…'; document.body.classList.toggle('private-mode',priv); }
async function setChatMode(mode, opts={}){ const next=mode==='private'?'private':'public'; if(next===chatMode && !opts.force) { updateModeUI(); return; } chatMode=next; localStorage.setItem('lanchat_mode',chatMode); updateModeUI(); await loadMessages({forceScroll:true}); if(!opts.silent) toast(isPrivateMode()?'已切到私人模式：仅自己可见':'已切到群聊模式'); }
const $=s=>document.querySelector(s); const messagesEl=$('#messages');
let autoScrollGeneration=0,lastMessageScrollIntentAt=0;
function noteMessageScrollIntent(){lastMessageScrollIntentAt=Date.now();autoScrollGeneration++}
['wheel','touchmove'].forEach(ev=>messagesEl.addEventListener(ev,noteMessageScrollIntent,{passive:true}));
messagesEl.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')noteMessageScrollIntent()},{passive:true});
function toast(t){const e=$('#toast'); e.textContent=t; e.classList.remove('hidden'); setTimeout(()=>e.classList.add('hidden'),1800)}
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}); if(r.status===401){showLogin(); throw new Error('auth')}; if(!r.ok){let t=await r.text(); throw new Error(t)} return r.json()}
function errText(e){let m=e&&e.message?e.message:''; try{const j=JSON.parse(m); if(j&&j.detail) return j.detail}catch{} return m}
function showLogin(){ $('#login').classList.remove('hidden'); $('#app').classList.add('hidden') }
function showApp(){ $('#login').classList.add('hidden'); $('#app').classList.remove('hidden') }

let modalScrollY=0;
function setModalLock(){ const open=!!document.querySelector('dialog[open]'); if(open){ if(!document.body.classList.contains('modal-open')) modalScrollY=window.scrollY||document.documentElement.scrollTop||0; document.documentElement.classList.add('modal-open'); document.body.classList.add('modal-open'); document.body.style.top=`-${modalScrollY}px`; } else { document.documentElement.classList.remove('modal-open'); document.body.classList.remove('modal-open'); document.body.style.top=''; if(modalScrollY) window.scrollTo(0,modalScrollY); modalScrollY=0; } }
function showDialog(d){ if(!d) return; try{ if(d.open) d.close(); d.showModal(); }catch(e){ d.setAttribute('open',''); d.style.display='flex'; } setModalLock(); bindStableEditorScroll(d) }
function closeDialog(d){ if(!d) return; try{ d.close(); }catch(e){ d.removeAttribute('open'); d.style.display='none'; } setModalLock() }
function bindStableEditorScroll(root=document){ root.querySelectorAll?.('#textFileContent').forEach(el=>{ if(el.dataset.stableScrollBound)return; el.dataset.stableScrollBound='1'; let lastX=0,lastY=0; el.addEventListener('touchstart',e=>{lastX=e.touches[0].clientX;lastY=e.touches[0].clientY},{passive:true}); el.addEventListener('touchmove',e=>{ const t=e.touches[0], x=t.clientX, y=t.clientY, dx=x-lastX, dy=y-lastY; lastX=x; lastY=y; const horizontal=Math.abs(dx)>Math.abs(dy); const atLeft=el.scrollLeft<=0, atRight=el.scrollLeft+el.clientWidth>=el.scrollWidth-1; const atTop=el.scrollTop<=0, atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1; if(horizontal){ if((atLeft&&dx>0)||(atRight&&dx<0)) e.preventDefault(); e.stopPropagation(); return; } if((atTop&&dy>0)||(atBottom&&dy<0)) e.preventDefault(); e.stopPropagation(); },{passive:false}); el.addEventListener('wheel',e=>{ const horizontal=Math.abs(e.deltaX)>Math.abs(e.deltaY); const atLeft=el.scrollLeft<=0, atRight=el.scrollLeft+el.clientWidth>=el.scrollWidth-1; const atTop=el.scrollTop<=0, atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1; if(horizontal){ if((atLeft&&e.deltaX<0)||(atRight&&e.deltaX>0)) e.preventDefault(); e.stopPropagation(); return; } if((atTop&&e.deltaY<0)||(atBottom&&e.deltaY>0)) e.preventDefault(); e.stopPropagation(); },{passive:false}); }); }

function avatar(u){ if(!u) return '<span class="avatar">?</span>'; if(u.avatar_type==='upload'&&u.avatar_url) return `<span class="avatar"><img src="${u.avatar_url}"></span>`; return `<span class="avatar">${escapeHtml(u.avatar_value||'🙂')}</span>` }
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function pad2(n){return n<10?"0"+n:""+n}
function fmt(ts){try{let d=new Date(ts);if(isNaN(d.getTime()))return ts;return d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate()+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());}catch(e){return ts}}
function size(n){if(n==null)return''; const u=['B','KB','MB','GB','TB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++} return `${n.toFixed(i?1:0)} ${u[i]}`}
function linkify(text){
  const parts=[]; const re=/(https?:\/\/[^\s<]+|www\.[^\s<]+)/ig; let last=0,m;
  while((m=re.exec(text))){ parts.push(escapeHtml(text.slice(last,m.index))); let url=m[0]; let href=url.startsWith('www.')?'https://'+url:url; parts.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`); last=m.index+url.length }
  parts.push(escapeHtml(text.slice(last))); return parts.join('')
}
function renderMarkdown(text){
  const src=String(text||''); let out='', last=0;
  const re=/```([^\n`]*)\n?([\s\S]*?)```/g; let m;
  while((m=re.exec(src))){
    out+=linkify(src.slice(last,m.index));
    const lang=String(m[1]||'').trim().slice(0,32);
    const code=String(m[2]||'');
    out+=`<div class="code-block"><div class="code-head"><span>${lang?escapeHtml(lang):'代码'}</span><button type="button" data-code-copy>复制</button></div><pre><code>${escapeHtml(code)}</code></pre></div>`;
    last=m.index+m[0].length;
  }
  out+=linkify(src.slice(last));
  return out
}
function mediaName(f,icon){let name=escapeHtml(f.name), meta=`${escapeHtml(f.kind)} · ${size(f.size)}`;return `<button type="button" class="media-name file-name-trigger" data-file-info="${f.id}"><span class="media-icon">${icon}</span><span class="media-text"><span class="media-title">${name}</span><span class="media-sub">${meta}</span></span></button>`}
function fileBlock(f){ if(!f) return ''; let view=f.public_view_url||f.view_url||f.url, name=escapeHtml(f.name), meta=`${escapeHtml(f.kind)} · ${size(f.size)}`;
  if(f.kind==='image'){let src=f.preview_url||view; return `<div class="media-card"><div class="media"><img class="zoomable" data-full="${view}" src="${src}" alt="${name}" loading="lazy"></div>${mediaName(f,'🖼️')}</div>`}
  if(f.kind==='video') return `<div class="media-card"><div class="media"><video src="${view}" ${f.preview_url?`poster="${f.preview_url}"`:''} controls preload="metadata"></video></div>${mediaName(f,'🎬')}</div>`
  if(f.kind==='audio') return `<div class="media-card audio-card"><div class="media"><audio src="${view}" controls preload="metadata"></audio></div>${mediaName(f,'🎵')}</div>`
  if(f.kind==='text') return `<div class="file-card"><div class="file-icon">📝</div><div class="file-info"><button type="button" class="fn file-name-trigger" data-file-info="${f.id}" title="${name}">${name}</button><div class="fs">${meta}</div></div></div>`
  return `<div class="file-card"><div class="file-icon">📄</div><div class="file-info"><button type="button" class="fn file-name-trigger" data-file-info="${f.id}" title="${name}">${name}</button><div class="fs">${meta}</div></div></div>`
}
function fileMenuButtons(f){ if(!f) return ''; let url=f.public_download_url||f.url, view=f.public_view_url||f.view_url||f.url;
  if(f.kind==='image') return `<a href="${url}" download>下载</a><button data-open="${view}">大图</button>`;
  if(f.kind==='text'){let isOwn=me&&(f.user_id===me.id||f.is_owner); return `<button data-text-file="${f.id}">${isOwn?'编辑':'查看'}</button><a href="${url}" download>下载</a>`;}
  return `<a href="${url}" download>下载</a>`;
}
function renderMessage(m){
  const mine=me&&m.user_id===me.id;
  const lock=m.private?'<span class="msg-lock" title="私人消息，仅自己可见">🔒</span>':'';
  let content=m.withdrawn?`<div class="withdrawn">${escapeHtml(m.user?.nickname||'有人')}撤回了一条消息</div>`:`<div class="content">${renderMarkdown(m.content||'')}</div>${fileBlock(m.file)}`;
  const visBtn=mine&&!m.withdrawn?(m.private?`<button data-makepublic="${m.id}">设为公开</button>`:`<button data-makeprivate="${m.id}">设为私人</button>`):'';
  const fileItems=!m.withdrawn?fileMenuButtons(m.file):'';
  const ownItems=mine&&!m.withdrawn?`<button data-edit="${m.id}">编辑</button>${visBtn}<button data-withdraw="${m.id}">撤回</button>`:'';
  const menuItems=fileItems+ownItems;
  const more=menuItems?`<button class="msg-more-btn" data-menu="${m.id}" title="更多" aria-label="更多">⋯</button>`:'';
  const menuRow=menuItems?`<div class="msg-menu" data-menu-for="${m.id}" hidden>${menuItems}</div>`:'';
  const actions=m._pending?'':(m.withdrawn?(mine?`<div class="actions"><button data-restore="${m.id}">恢复</button></div>`:''):`<div class="actions"><button data-copy="${m.id}">复制</button><button data-toggle="${m.id}">展开</button>${more}</div>${menuRow}`);
  return `<article id="m-${m.id}" data-user-id="${escapeHtml(m.user_id)}" class="msg ${mine?'mine':''} ${m.private?'msg-private':''} ${m._pending?'_pending':''}"><button class="avatar-btn" data-user-info="${escapeHtml(m.user_id)}" title="查看用户资料">${avatar(m.user)}</button><div class="bubble"><div class="meta"><span class="name">${escapeHtml(m.user?.nickname||'未知')}</span><span class="msg-time">${m._pending?'发送中…':fmt(m.edited&&m.updated_at?m.updated_at:m.created_at)}</span>${m.edited?'<span>已编辑</span>':''}${lock}</div>${content}${actions}</div></article>`
}
function nearBottom(){return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120}
function scrollBottomSoon(){const gen=autoScrollGeneration;const go=()=>{if(gen!==autoScrollGeneration||Date.now()-lastMessageScrollIntentAt<900)return;messagesEl.scrollTop=messagesEl.scrollHeight};go();requestAnimationFrame(go);[80,260,700,1200].forEach(t=>setTimeout(go,t))}
function syncMediaCardWidths(){messagesEl.querySelectorAll('.media-card:not(.audio-card)').forEach(card=>{const media=card.querySelector('.media img,.media video'); if(!media)return; const renderedW=Math.ceil(media.getBoundingClientRect().width); const intrinsicW=media.tagName==='VIDEO'?(media.videoWidth||0):(media.naturalWidth||0); const tinyIntrinsic=intrinsicW>0&&intrinsicW<=220; const fallback=tinyIntrinsic||renderedW<=180||card.classList.contains('media-card-fallback')&&intrinsicW===0; const target=fallback?220:renderedW; card.style.width=target+'px'; card.classList.toggle('media-card-fallback',fallback);})}
function bindMediaSettleScroll(){messagesEl.querySelectorAll('img,video').forEach(el=>{if(el.dataset.scrollBound)return;el.dataset.scrollBound='1';['load','loadedmetadata','loadeddata'].forEach(ev=>el.addEventListener(ev,()=>{syncMediaCardWidths(); if(nearBottom())scrollBottomSoon()},{once:true}))}); syncMediaCardWidths()}
function rememberFile(f){if(f&&f.id) fileStore.set(f.id,f); return f}
function upsertMessage(m, opts={}){ if(m&&m.id) messageStore.set(m.id,m); if(m&&m.file) rememberFile(m.file); let stick=opts.forceScroll || nearBottom(); let old=$(`#m-${CSS.escape(m.id)}`); if(m.deleted){old?.remove(); messageStore.delete(m.id); return} if(!msgInCurrentView(m)){ old?.remove(); return } const html=renderMessage(m); if(old) old.outerHTML=html; else messagesEl.insertAdjacentHTML('beforeend',html); collapseLong(); bindMediaSettleScroll(); refreshDateDividers(); if(stick) scrollBottomSoon(); else { if(!old && typeof bumpNewCount==='function') bumpNewCount(); } }
function collapseLong(){document.querySelectorAll('.content').forEach(e=>{ const article=e.closest('.msg'); const id=article?.id?.replace(/^m-/,''); const btn=article?.querySelector('[data-toggle]'); e.classList.remove('collapsed'); e.dataset.manual=''; const isLong=e.scrollHeight>340; if(btn) btn.style.display=isLong?'inline-flex':'none'; if(isLong && !expandedMessages.has(id)) e.classList.add('collapsed'); if(expandedMessages.has(id)) e.dataset.manual='1'; if(btn) btn.textContent=e.classList.contains('collapsed')?'展开':'收起'; })}
function dayKey(ts){const d=new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`}
function dayLabel(ts){const d=new Date(ts); const now=new Date(); const t0=new Date(now.getFullYear(),now.getMonth(),now.getDate()); const md=new Date(d.getFullYear(),d.getMonth(),d.getDate()); const diff=Math.round((t0-md)/86400000); if(diff===0) return '今天'; if(diff===1) return '昨天'; if(diff===2) return '前天'; const wk=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][d.getDay()]; const sameYear=d.getFullYear()===now.getFullYear(); const dateStr=sameYear?`${d.getMonth()+1}月${d.getDate()}日`:`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; return diff>=3&&diff<=6?`${dateStr} ${wk}`:dateStr}
function refreshDateDividers(){
  // 移除旧分割线
  messagesEl.querySelectorAll('.date-divider').forEach(x=>x.remove());
  const arts=[...messagesEl.querySelectorAll('.msg')]; let prevKey=null;
  for(const art of arts){
    const id=art.id?.replace(/^m-/,''); const m=messageStore.get(id); if(!m||!m.created_at) continue;
    const k=dayKey(m.created_at);
    if(k!==prevKey){ const div=document.createElement('div'); div.className='date-divider'; div.innerHTML=`<span>${escapeHtml(dayLabel(m.created_at))}</span>`; art.parentNode.insertBefore(div,art); prevKey=k; }
  }
}
let hasMoreOlder=true, loadingOlder=false, oldestId=null;
async function loadMessages(opts={}){let stick=opts.forceScroll || nearBottom() || messagesEl.childElementCount===0; const prevTop=messagesEl.scrollTop, prevH=messagesEl.scrollHeight; const d=await api(`/api/messages?limit=120&scope=${chatMode}`); messagesEl.innerHTML=''; messageStore.clear(); d.messages.forEach(m=>{ if(m&&m.id) messageStore.set(m.id,m); if(m&&m.file) rememberFile(m.file); messagesEl.insertAdjacentHTML('beforeend',renderMessage(m)) }); hasMoreOlder=d.messages.length>=120; oldestId=d.messages.length?d.messages[0].id:null; collapseLong(); bindMediaSettleScroll(); refreshDateDividers(); if(stick) scrollBottomSoon(); else if(opts.keepView){messagesEl.scrollTop=prevTop+(messagesEl.scrollHeight-prevH)} if(typeof updateChatFab==='function')setTimeout(updateChatFab,60)}
async function loadOlder(){
  if(loadingOlder||!hasMoreOlder||!oldestId) return;
  loadingOlder=true; const loader=document.createElement('div'); loader.className='older-loader'; loader.textContent='加载更早的消息…'; messagesEl.prepend(loader);
  const prevH=messagesEl.scrollHeight, prevTop=messagesEl.scrollTop;
  try{
    const d=await api(`/api/messages?before=${encodeURIComponent(oldestId)}&limit=30&scope=${chatMode}`);
    loader.remove();
    if(d.messages.length){
      const frag=document.createDocumentFragment();
      d.messages.forEach(m=>{ if(m&&m.id) messageStore.set(m.id,m); if(m&&m.file) rememberFile(m.file); const tmp=document.createElement('template'); tmp.innerHTML=renderMessage(m); frag.appendChild(tmp.content.firstElementChild); });
      messagesEl.prepend(frag);
      oldestId=d.messages[0].id; hasMoreOlder=d.messages.length>=30;
      collapseLong(); refreshDateDividers();
      messagesEl.scrollTop=prevTop+(messagesEl.scrollHeight-prevH); // 保持视觉位置不跳
    } else { hasMoreOlder=false; }
  }catch{ loader.remove(); }
  finally{ loadingOlder=false; }
}
messagesEl.addEventListener('scroll',onChatScroll,{passive:true});
// 一键到底浮动按钮：两种触发——①手指从下往上滑（朝最新）；②翻历史时来新消息（显示 +N 累加）。均不常驻，停 2 秒淡出。
const _chatFab=$('#chatScrollBottom'); const _fabDot=_chatFab?_chatFab.querySelector('.fab-dot'):null;
let _lastTop=messagesEl.scrollTop, _fabHideTimer=null, _newCount=0;
function chatAtBottom(){return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120}
function hideChatFab(){ if(_chatFab) _chatFab.classList.remove('show'); }
function showChatFab(){ if(!_chatFab)return; _chatFab.classList.add('show'); clearTimeout(_fabHideTimer); _fabHideTimer=setTimeout(hideChatFab,2000); }
function clearNewCount(){ _newCount=0; if(_chatFab) _chatFab.classList.remove('has-new'); if(_fabDot) _fabDot.textContent=''; }
function bumpNewCount(){ if(!_chatFab)return; _newCount++; _chatFab.classList.add('has-new'); if(_fabDot){ _fabDot.textContent='+'+(_newCount>99?'99':_newCount); _fabDot.classList.remove('bump'); void _fabDot.offsetWidth; _fabDot.classList.add('bump'); } showChatFab(); }
function updateChatFab(){ if(!_chatFab)return; if(chatAtBottom()){ hideChatFab(); clearNewCount(); } }
function onChatScroll(){
  const top=messagesEl.scrollTop; const delta=top-_lastTop; _lastTop=top;
  if(top<80 && hasMoreOlder && !loadingOlder) loadOlder();
  if(chatAtBottom()){ hideChatFab(); clearNewCount(); return; }
  if(delta>2) showChatFab();        // 手指下→上（scrollTop 增大，朝底滚）→ 浮现
  else if(delta<-2) hideChatFab();  // 手指上→下（朝历史滚）→ 隐藏
}
// 模拟人手快速滑到底的缓动动画
function flickScroll(el, target, dur){ dur=dur||520; const start=el.scrollTop, dist=target-start, t0=performance.now(); function step(now){ let p=Math.min(1,(now-t0)/dur); p=1-Math.pow(1-p,3); el.scrollTop=start+dist*p; if(p<1) requestAnimationFrame(step); } requestAnimationFrame(step); }
if(_chatFab){ _chatFab.onclick=()=>{ flickScroll(messagesEl, messagesEl.scrollHeight); clearNewCount(); hideChatFab(); }; }
async function init(){const c=await api('/api/config').catch(()=>null); if(!c)return; document.title=c.title||'LAN Chat'; $('#siteTitle').textContent=c.title; $('#loginTitle').textContent=c.title; if(c.authed){me=c.user; showApp(); updateModeUI(); await loadMessages({forceScroll:true}); connectWs()}else showLogin()}
$('#loginForm').onsubmit=async e=>{e.preventDefault(); $('#loginError').textContent=''; try{const d=await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#password').value})}); me=d.user; showApp(); updateModeUI(); await loadMessages({forceScroll:true}); connectWs()}catch(err){$('#loginError').textContent='密码不对'}}
$('#sendBtn').onclick=send;
$('#messageInput').addEventListener('input', autoGrowComposer);
$('#messageInput').addEventListener('focus', autoGrowComposer);
$('#messageInput').addEventListener('blur', autoGrowComposer);
window.addEventListener('resize', ()=>{autoGrowComposer(); autoGrowTextarea($('#editText')); syncMediaCardWidths()});
setTimeout(autoGrowComposer,0);
function clearAttach(){attachQueue=[]; $('#fileInput').value=''; renderAttachPreview()}
function renderAttachPreview(){const el=$('#attachPreview'); if(!el)return; if(!attachQueue.length){el.classList.add('hidden'); el.innerHTML=''; return} el.classList.remove('hidden'); const head=attachQueue.length===1?`将上传：${escapeHtml(attachQueue[0].name)} (${size(attachQueue[0].size)})`:`将上传 ${attachQueue.length} 个文件`; const list=attachQueue.length>1?`<div class="attach-list">${attachQueue.map((f,i)=>`<span class="attach-chip">${escapeHtml(f.name)} (${size(f.size)})<button type="button" class="attach-chip-x" data-attach-rm="${i}" title="移除">×</button></span>`).join('')}</div>`:''; el.innerHTML=`<div class="attach-head"><span>${head}</span><button type="button" class="attach-cancel" id="cancelAttach">清空</button></div>${list}`}
/* ===== 📎 附件二级菜单：上传文件 / P2P 直传 ===== */
const attachMenu=$('#attachMenu'), attachBtn=$('#attachBtn');
$('#attachUpload').onclick=()=>{ attachMenu.hidden=true; $('#fileInput').click() };
$('#attachP2p').onclick=e=>{ e.stopPropagation(); renderP2pUserList() };
function closeAttachMenu(e){ if(attachMenu.hidden) return; if(!e.target.closest('.attach-wrap')) attachMenu.hidden=true }
document.addEventListener('click', closeAttachMenu);
attachBtn.onclick=e=>{ e.stopPropagation(); attachMenu.hidden=!attachMenu.hidden; const pop=document.getElementById('p2pUserPop'); if(pop) pop.remove(); };
/* P2P：拉在线用户渲染到菜单下方弹层 */
async function renderP2pUserList(){
  let d;
  try{ d=await api('/api/users/online') }catch(err){ toast('获取在线用户失败'); return }
  const users=(d&&d.users)||[];
  let box=document.getElementById('p2pUserPop');
  if(box) box.remove();
  if(!users.length){ toast('当前没有其他在线用户'); return }
  box=document.createElement('div');
  box.id='p2pUserPop'; box.className='attach-menu p2p-user-pop';
  box.innerHTML='<div class="p2p-pop-title">选择在线用户</div>'+users.map(u=>`<button type="button" data-p2p-uid="${u.id}"><span class="p2p-ava">${u.avatar_type==='upload'&&u.avatar_url?`<img src="${u.avatar_url}" onerror="this.parentNode.textContent='🙂'">`:escapeHtml(u.avatar_value||'🙂')}</span><span class="p2p-nick">${escapeHtml(u.nickname||'用户')}</span></button>`).join('');
  document.querySelector('.attach-wrap').appendChild(box);
  box.onclick=e=>{
    const b=e.target.closest('[data-p2p-uid]');
    if(!b) return;
    box.remove(); attachMenu.hidden=true;
    p2pStartSend(b.dataset.p2pUid);
  };
  setTimeout(()=>{
    const h=e=>{ if(!e.target.closest('#p2pUserPop')&&!e.target.closest('#attachBtn')){ box.remove(); document.removeEventListener('click',h) } };
    document.addEventListener('click',h);
  },0);
}
$('#fileInput').onchange=e=>{const fs=Array.from(e.target.files||[]); if(fs.length){attachQueue=attachQueue.concat(fs)} renderAttachPreview()}
$('#attachPreview').onclick=e=>{const rm=e.target.closest('[data-attach-rm]'); if(rm){const i=+rm.dataset.attachRm; attachQueue.splice(i,1); renderAttachPreview(); return} if(e.target.closest('#cancelAttach')){ if(currentUpload) cancelUpload(); else clearAttach() }}
function autoGrowTextarea(el){ if(!el) return; el.style.height='auto'; const max=Math.floor(window.innerHeight*0.72); el.style.height=Math.min(el.scrollHeight+8,max)+'px'; el.style.overflowY=el.scrollHeight>max?'auto':'hidden' }
function autoGrowComposer(){ const el=$('#messageInput'); if(!el) return; var savedTop=el.scrollTop; el.style.height='auto'; var maxH=Math.max(160, Math.floor((window.innerHeight||700)*0.7)); var h=Math.min(maxH, Math.max(44, el.scrollHeight)); el.style.height=h+'px'; el.style.overflowY=(el.scrollHeight>maxH+2)?'auto':'hidden'; el.scrollTop=savedTop }
function fmtSpeed(n){return `${size(n)}/s`}
function setUploadProgress(state){
  let el=$('#uploadProgress'); if(!el)return;
  if(!state){el.classList.add('hidden'); el.innerHTML=''; return}
  const pct=state.total?Math.max(0,Math.min(100,state.loaded/state.total*100)):0;
  const phase=state.phase?`${escapeHtml(state.phase)} · `:'';
  const qlabel=uploadQueueLabel?`<span class="upload-q">${escapeHtml(uploadQueueLabel)}</span> `:'';
  const paused=state.status==='paused', uploading=state.status==='uploading'||state.status==='preparing';
  el.classList.remove('hidden');
  el.innerHTML=`<div class="upload-row"><span>${qlabel}${escapeHtml(state.name||'上传中')}</span><b>${pct.toFixed(0)}%</b></div><div class="upload-bar"><i style="width:${pct}%"></i></div><div class="upload-meta">${phase}${size(state.loaded||0)} / ${state.total?size(state.total):'未知'} · ${fmtSpeed(state.speed||0)}</div><div class="upload-controls">${uploading?'<button type="button" data-upload-pause>停止</button>':''}${paused?'<button type="button" data-upload-resume>继续</button>':''}<button type="button" class="danger-mini" data-upload-cancel>取消</button></div>`;
}
// 视频预览图统一由后端 ffmpeg 生成（前端 canvas 抓帧在部分视频/WebView 下会得到黑帧，已废弃）。
function xhrJson(method,url,body,onProgress){
  return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest(); xhr.open(method,url); xhr.upload.onprogress=onProgress||null; xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){try{resolve(JSON.parse(xhr.responseText||'{}'))}catch(e){reject(e)}}else reject(new Error(xhr.responseText||'request failed'))}; xhr.onerror=()=>reject(new Error('network failed')); xhr.onabort=()=>reject(Object.assign(new Error('aborted'),{aborted:true})); xhr.send(body); if(currentUpload) currentUpload.xhr=xhr;})
}
async function startChunkUpload(file, content, priv){
  const chunkSize=4*1024*1024, totalChunks=Math.max(1,Math.ceil(file.size/chunkSize));
  currentUpload={file,content,priv:!!priv,chunkSize,totalChunks,uploadId:null,index:0,loadedBytes:0,status:'preparing',xhr:null,canceled:false,startedAt:performance.now(),lastTime:performance.now(),lastLoaded:0};
  setUploadProgress({name:file.name,loaded:0,total:file.size,phase:'准备上传',speed:0,status:'preparing'});
  if(currentUpload.canceled) throw Object.assign(new Error('canceled'),{canceled:true});
  const created=await api('/api/upload-session',{method:'POST',body:JSON.stringify({name:file.name,size:file.size,mime:file.type||'application/octet-stream',content,private:!!priv,chunk_size:chunkSize})});
  currentUpload.uploadId=created.upload_id;
  return runUploadLoop();
}
async function runUploadLoop(){
  const u=currentUpload; if(!u) throw new Error('no upload'); u.status='uploading'; $('#sendBtn').disabled=true;
  while(u.index<u.totalChunks){
    if(u.canceled) throw Object.assign(new Error('canceled'),{canceled:true});
    if(u.status==='paused'){setUploadProgress({name:u.file.name,loaded:u.loadedBytes,total:u.file.size,phase:'已停止',speed:0,status:'paused'}); return null}
    const start=u.index*u.chunkSize, end=Math.min(u.file.size,start+u.chunkSize), blob=u.file.slice(start,end), fd=new FormData(); fd.append('index',String(u.index)); fd.append('chunk',blob,u.file.name+'.part');
    u.lastTime=performance.now(); u.lastLoaded=0;
    await xhrJson('POST',`/api/upload-session/${u.uploadId}/chunk`,fd,e=>{const now=performance.now(), dt=Math.max(.05,(now-u.lastTime)/1000), delta=e.loaded-u.lastLoaded, speed=delta/dt; u.lastTime=now; u.lastLoaded=e.loaded; setUploadProgress({name:u.file.name,loaded:u.loadedBytes+e.loaded,total:u.file.size,phase:'上传中',speed,status:'uploading'})});
    u.loadedBytes=end; u.index++;
  }
  setUploadProgress({name:u.file.name,loaded:u.file.size,total:u.file.size,phase:'处理中',speed:0,status:'uploading'});
  const d=await api(`/api/upload-session/${u.uploadId}/complete`,{method:'POST',body:'{}'});
  setUploadProgress(null); currentUpload=null; return d;
}
async function pauseUpload(){if(!currentUpload)return; currentUpload.status='pausing'; currentUpload.xhr?.abort(); setUploadProgress({name:currentUpload.file.name,loaded:currentUpload.loadedBytes,total:currentUpload.file.size,phase:'正在停止',speed:0,status:'uploading'}); $('#sendBtn').disabled=false}
async function resumeUpload(){if(!currentUpload||currentUpload.status!=='paused')return; currentUpload.status='uploading'; $('#sendBtn').disabled=true; try{const d=await runUploadLoop(); if(d&&d.message){upsertMessage(d.message,{forceScroll:true}); $('#messageInput').value=''; autoGrowComposer()}}catch(e){if(e.aborted&&currentUpload&&currentUpload.status==='pausing'){currentUpload.status='paused'; setUploadProgress({name:currentUpload.file.name,loaded:currentUpload.loadedBytes,total:currentUpload.file.size,phase:'已停止',speed:0,status:'paused'}); $('#sendBtn').disabled=false}else if(!e.canceled){toast('继续上传失败'); $('#sendBtn').disabled=false}}}
async function cancelUpload(){const u=currentUpload; if(!u){clearAttach(); setUploadProgress(null); return} u.canceled=true; u.status='canceled'; u.xhr?.abort(); if(u.uploadId){try{await api(`/api/upload-session/${u.uploadId}/cancel`,{method:'POST',body:'{}'})}catch{}} currentUpload=null; clearAttach(); setUploadProgress(null); $('#sendBtn').disabled=false; toast('已取消上传')}
$('#uploadProgress').onclick=e=>{if(e.target.closest('[data-upload-pause]')) pauseUpload(); if(e.target.closest('[data-upload-resume]')) resumeUpload(); if(e.target.closest('[data-upload-cancel]')) cancelUpload(); if(e.target.closest('[data-upload-retry]')) retryFailed(); if(e.target.closest('[data-upload-dismiss]')){failedBatch=null; setUploadProgress(null);}};
async function runUploadQueue(files, text, priv){
  // 串行排队：逐个上传，文字只跟第一个。失败跳过继续，收集失败项。
  const failed=[]; let okCount=0;
  for(let i=0;i<files.length;i++){
    const f=files[i]; uploadQueueLabel=files.length>1?`${i+1}/${files.length}`:'';
    const content=i===0?text:'';
    try{
      const d=await startChunkUpload(f,content,priv);
      if(d&&d.message){upsertMessage(d.message,{forceScroll:true}); okCount++;}
    }catch(e){
      if(e&&e.canceled){throw e;} // 取消整批中断
      if(e&&e.aborted&&currentUpload&&currentUpload.status==='pausing'){throw e;} // 暂停交由外层处理
      let emsg='上传失败'; try{const m=JSON.parse(e.message||'{}'); if(m.detail) emsg=m.detail}catch{};
      failed.push({file:f, content, error:emsg});
    }
  }
  uploadQueueLabel='';
  if(okCount){$('#messageInput').value=''; autoGrowComposer();}
  return {failed, okCount};
}
function showFailedBanner(){
  if(!failedBatch||!failedBatch.length){setUploadProgress(null); return}
  const el=$('#uploadProgress'); if(!el)return; el.classList.remove('hidden');
  el.innerHTML=`<div class="upload-row"><span>⚠️ ${failedBatch.length} 个文件上传失败</span></div><div class="upload-fail-list">${failedBatch.map(x=>`${escapeHtml(x.file.name)}${x.error?`（${escapeHtml(x.error)}）`:''}`).join('、')}</div><div class="upload-controls"><button type="button" class="primary-mini" data-upload-retry>重试失败项</button><button type="button" class="danger-mini" data-upload-dismiss>关闭</button></div>`;
}
async function retryFailed(){
  if(!failedBatch||!failedBatch.length)return; const items=failedBatch; failedBatch=null;
  const priv=isPrivateMode(); $('#sendBtn').disabled=true;
  try{
    const files=items.map(x=>x.file); const text=items[0]?.content||'';
    const {failed}=await runUploadQueue(files, text, priv);
    failedBatch=failed.length?failed:null;
    if(failedBatch){showFailedBanner(); toast(`还有 ${failedBatch.length} 个失败`);}else{setUploadProgress(null); clearAttach(); toast('重试完成');}
  }catch(e){if(!e.canceled&&!e.aborted){toast('重试出错');}}
  finally{$('#sendBtn').disabled=false}
}
async function send(){const text=$('#messageInput').value; if(!text&&!attachQueue.length)return; if(currentUpload&&currentUpload.status==='paused'){await resumeUpload(); return} const priv=isPrivateMode(); $('#sendBtn').disabled=true;
  try{
    if(attachQueue.length){
      const files=attachQueue.slice();
      const {failed,okCount}=await runUploadQueue(files, text, priv);
      attachQueue=[]; $('#fileInput').value=''; renderAttachPreview();
      failedBatch=failed.length?failed:null;
      if(failedBatch){showFailedBanner(); toast(`${okCount} 个成功，${failedBatch.length} 个失败`);}
    } else {
      // 乐观渲染：点发送瞬间先出气泡，不等网络（绕开 Chrome 后台回来 socket 假死的 ~2s 延迟）
      const tempId='temp-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
      const tempMsg={id:tempId, user_id:me?.id, user:me, content:text, private:priv, created_at:new Date().toISOString(), _pending:true};
      messageStore.set(tempId,tempMsg); messagesEl.insertAdjacentHTML('beforeend',renderMessage(tempMsg)); collapseLong(); scrollBottomSoon();
      $('#messageInput').value=''; autoGrowComposer();
      try{
        const d=await api('/api/messages',{method:'POST',body:JSON.stringify({content:text,private:priv})});
        $(`#m-${CSS.escape(tempId)}`)?.remove(); messageStore.delete(tempId);
        if(d&&d.admin_redirect){toast('正在进入管理后台…'); setTimeout(()=>{location.href='/admin'},400); return}
        if(d&&d.message){upsertMessage(d.message,{forceScroll:true})}
      }catch(err){
        const node=$(`#m-${CSS.escape(tempId)}`); if(node){node.classList.add('msg-failed'); const tm=messageStore.get(tempId); if(tm){tm._failed=true;}} 
        $('#messageInput').value=text; autoGrowComposer(); toast('发送失败，请重试'); throw Object.assign(new Error('send failed'),{_handled:true});
      }
    }
  }catch(e){if(e&&e._handled){/* 已处理 */}else if(e.aborted&&currentUpload&&currentUpload.status==='pausing'){currentUpload.status='paused'; setUploadProgress({name:currentUpload.file.name,loaded:currentUpload.loadedBytes,total:currentUpload.file.size,phase:'已停止',speed:0,status:'paused'}); $('#sendBtn').disabled=false}else if(!e.canceled){setUploadProgress(null); let msg='发送失败'; try{const m=JSON.parse(e.message||'{}'); if(m.detail) msg=m.detail}catch{}; if(e.message&&e.message.includes('超过限制')) msg=e.message; toast(msg)}}finally{if(!currentUpload||currentUpload.status!=='uploading') $('#sendBtn').disabled=false}}
function compactContent(m){ if(m.withdrawn) return '（已撤回）'; let text=(m.content||'').trim(); if(m.file) text += (text?'\n':'') + `[${m.file.kind}] ${m.file.name}`; return text || '（空消息）' }
function infoFileName(f, icon){
  const name=escapeHtml(f.name||'文件');
  return `<button type="button" class="info-file-name" data-file-info="${escapeHtml(f.id)}" title="查看文件详情">${icon} <span>${name}</span></button>`;
}
function infoMedia(m){
  if(!m.file || m.withdrawn) return '';
  const f=m.file, view=f.view_url||f.url, name=escapeHtml(f.name||'文件');
  if(f.kind==='image') return `<div class="info-media"><img class="zoomable" data-full="${view}" src="${f.preview_url||view}" alt="${name}" loading="lazy"></div>${infoFileName(f,'🖼️')}`;
  if(f.kind==='video') return `<div class="info-media"><video src="${view}" ${f.preview_url?`poster="${f.preview_url}"`:''} controls preload="metadata"></video></div>${infoFileName(f,'🎬')}`;
  if(f.kind==='audio') return `<div class="info-media audio"><audio src="${view}" controls preload="metadata"></audio></div>${infoFileName(f,'🎵')}`;
  if(f.kind==='text') return infoFileName(f,'📝'); return infoFileName(f,'📄');
}
async function openUserInfo(uid){
  try{
    const d=await api(`/api/users/${uid}/profile`); const u=d.user; const msgs=d.messages||[];
    $('#infoAvatar').innerHTML=u.avatar_type==='upload'&&u.avatar_url?`<img class="zoomable profile-avatar-img" data-full="${u.avatar_url}" src="${u.avatar_url}" alt="${escapeHtml(u.nickname||'头像')}">`:escapeHtml(u.avatar_value||'🙂');
    $('#infoAvatar').classList.toggle('zoomable-avatar', !!(u.avatar_type==='upload'&&u.avatar_url));
    $('#infoName').textContent=u.nickname||'未知用户'; $('#infoSub').textContent=`共 ${msgs.length} 条最近记录`;
    const countEl=$('#infoCount'); if(countEl) countEl.textContent=`${msgs.length} 条`;
    const dOnly=t=>{try{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}catch{return t||'无'}}; $('#infoFields').innerHTML=`<div class="ui-mini"><i>加入 ${dOnly(u.created_at)}</i></div><div class="ui-mini"><i>活跃 ${dOnly(u.last_seen_at)}</i></div>${u.last_ip&&u.last_ip!=='无'?`<div class="ui-mini"><i>IP ${escapeHtml(u.last_ip)}</i></div>`:''}`;
    const mineProfile=me&&u.id===me.id;
    const p2pBtn=$('#p2pSendBtn');
    if(p2pBtn){
      if(mineProfile){ p2pBtn.style.display='none'; }
      else if(!u.online){ p2pBtn.style.display=''; p2pBtn.disabled=true; p2pBtn.textContent='📡 对方离线'; p2pBtn.classList.add('disabled'); p2pBtn.onclick=()=>toast('对方不在线，无法直传'); }
      else{ p2pBtn.style.display=''; p2pBtn.disabled=false; p2pBtn.textContent='📡 直传文件'; p2pBtn.classList.remove('disabled'); p2pBtn.onclick=()=>p2pStartSend(uid); }
    }
    $('#infoMessages').innerHTML=msgs.map(m=>{
      if(m.withdrawn){
        const restore=mineProfile?`<button type="button" data-info-restore="${m.id}">恢复</button>`:'';
        return `<div class="info-msg info-msg-withdrawn"><div class="info-msg-time">${fmt(m.created_at)}</div><pre>（已撤回）${m.file?' '+escapeHtml('['+m.file.kind+'] '+m.file.name):''}</pre><div class="actions">${restore}</div></div>`;
      }
      return `<div class="info-msg"><div class="info-msg-time">${fmt(m.edited&&m.updated_at?m.updated_at:m.created_at)}${m.edited?' · 已编辑':''}</div>${infoMedia(m)}<pre>${escapeHtml(compactContent(m))}</pre><div class="actions"><button type="button" data-info-copy="${m.id}">复制</button>${m.file&&m.file.kind==='text'?`<button type="button" data-text-file="${m.file.id}">${(me&&(m.file.user_id===me.id||m.user_id===me.id))?'编辑':'查看'}</button>`:''}${m.file?`<a href="${m.file.url}" download>下载</a>`:''}${mineProfile&&!m.withdrawn?`<button type="button" class="danger" data-info-withdraw="${m.id}">撤回</button>`:''}</div></div>`;
    }).join('')||'<div class="empty-note">暂无聊天记录</div>';
    const uiDlg=$('#userInfoDialog'); if(uiDlg) uiDlg.dataset.uid=uid;
    showDialog(uiDlg);
  }catch(e){toast('用户资料读取失败')}
}

function openCopyPanel(txt){ const ta=$('#copyTextArea'); ta.value=String(txt||''); showDialog($('#copyDialog')); setTimeout(()=>{ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length)},0) }
function setTextFileMode(mode){
  const dlg=$('#textFileDialog'), ta=$('#textFileContent'); if(!dlg||!ta)return;
  const edit=mode==='edit'; dlg.dataset.mode=edit?'edit':'view'; ta.readOnly=!edit; ta.classList.toggle('readonly',!edit); $('#textFileTitle')?.classList.toggle('editing-title',edit);
  document.querySelectorAll('[data-text-view]').forEach(x=>{if(x.id==='editTextFile'&&dlg.dataset.isOwner==='0'){x.classList.add('hidden')}else{x.classList.toggle('hidden',edit)}});
  document.querySelectorAll('[data-text-edit]').forEach(x=>x.classList.toggle('hidden',!edit));
  // 不自动聚焦，避免移动端键盘/视口导致文本编辑页上下跳动。
}
async function openTextFile(fid){
  try{ const d=await api(`/api/file/${fid}/text`); const dlg=$('#textFileDialog'), ta=$('#textFileContent'); dlg.dataset.fid=fid; dlg.dataset.isOwner=d.is_owner?'1':'0'; dlg.dataset.original=d.content; $('#textFileTitle').textContent=d.name; $('#textFileMeta').textContent=`${size(d.size)} · ${d.encoding}`; ta.value=d.content; setTextFileMode('view'); showDialog(dlg) }catch(e){toast('文本文件打开失败')}
}
function fileKindIcon(kind){return kind==='image'?'🖼️':kind==='video'?'🎬':kind==='audio'?'🎵':kind==='text'?'📝':'📄'}
function fileInfoMarkup(f, rows, openUrl, downUrl, escFn=escapeHtml){
  const kv=rows.map(([k,v])=>`<div class="info-row"><span>${escFn(k)}</span><code>${escFn(v||'')}</code></div>`).join('');
  return `<form method="dialog" class="dialog-card wide file-info-card" onsubmit="event.preventDefault()">
    <div class="file-info-head"><div class="file-info-badge">${fileKindIcon(f.kind)}</div><div class="file-info-title"><h2>${escFn(f.name||'文件详情')}</h2><p>${escFn(f.kind||'file')} · ${size(f.size||0)} · ${escFn(f.uploader||'未知用户')}</p></div></div>
    <div class="file-info-scroll"><div class="file-info-grid">${kv}</div></div>
    <div class="dialog-actions"><button value="cancel" class="ghost">关闭</button><a class="ghost" href="${openUrl}" target="_blank" rel="noopener">打开</a><a class="primary" href="${downUrl}" download>下载</a></div>
  </form>`;
}
function bindContainedScroll(el){ if(!el||el.dataset.containedScrollBound)return; el.dataset.containedScrollBound='1'; let lastY=0; el.addEventListener('touchstart',e=>{lastY=e.touches[0].clientY},{passive:true}); el.addEventListener('touchmove',e=>{const y=e.touches[0].clientY,dy=y-lastY;lastY=y;const atTop=el.scrollTop<=0,atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1;if((atTop&&dy>0)||(atBottom&&dy<0))e.preventDefault();e.stopPropagation()},{passive:false}); el.addEventListener('wheel',e=>{const atTop=el.scrollTop<=0,atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1;if((atTop&&e.deltaY<0)||(atBottom&&e.deltaY>0))e.preventDefault();e.stopPropagation()},{passive:false}); }
async function openFileInfo(fid){
  const f=fileStore.get(fid); if(!f){toast('文件信息读取失败'); return}
  const rows=[['文件名',f.name],['类型',f.kind],['大小',size(f.size||0)],['MIME',f.mime||'未知'],['上传时间',f.created_at?fmt(f.created_at):'未知'],['上传者',f.uploader||'未知用户'],['文件ID',f.id],['public_name',f.public_name||''],['外链/打开',location.origin+(f.public_view_url||f.public_url||f.page_url||'')],['下载地址',location.origin+(f.public_download_url||f.url||'')]];
  if(f.public_preview_url||f.preview_url) rows.push(['预览地址',location.origin+(f.public_preview_url||f.preview_url)]);
  let old=document.querySelector('#fileInfoDialog'); old?.remove();
  const dlg=document.createElement('dialog'); dlg.id='fileInfoDialog'; dlg.className='dialog file-info-dialog';
  const openUrl=f.public_view_url||f.public_url||f.page_url||f.view_url||f.url, downUrl=f.public_download_url||f.url;
  dlg.innerHTML=fileInfoMarkup(f, rows, openUrl, downUrl, escapeHtml);
  document.body.appendChild(dlg); dlg.querySelector('[value="cancel"]').onclick=e=>{e.preventDefault();closeDialog(dlg)}; dlg.addEventListener('close',()=>{setModalLock();dlg.remove()}); bindContainedScroll(dlg.querySelector('.file-info-scroll')); showDialog(dlg);
}

function handleInfoCopy(e){
  const b=e.target.closest?.('[data-info-copy]'); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const card=b.closest('.info-msg'); const pre=card?.querySelector('pre'); const txt=pre?.innerText||'';
  openCopyPanel(txt); toast('已打开复制面板')
}
document.addEventListener('pointerdown', handleInfoCopy, true);
document.addEventListener('click', e=>{
  const infoBox=e.target.closest('#infoMessages'); if(!infoBox) return;
  const img=e.target.closest('img.zoomable'); if(img){e.preventDefault(); openLightbox(img.dataset.full||img.src, document.querySelector('#userInfoDialog')); return}
  if(e.target.closest('[data-info-copy]')){ e.preventDefault(); e.stopPropagation(); }
}, true);
document.querySelector('#userInfoDialog')?.addEventListener('click',async e=>{
  const restoreBtn=e.target.closest('[data-info-restore]');
  if(restoreBtn){ e.preventDefault(); e.stopPropagation(); const id=restoreBtn.dataset.infoRestore; try{await api(`/api/messages/${id}/restore`,{method:'POST'}); toast('已恢复'); const uid=document.querySelector('#userInfoDialog')?.dataset.uid; if(uid) openUserInfo(uid);}catch(err){toast('恢复失败')} return; }
  const withdrawBtn=e.target.closest('[data-info-withdraw]');
  if(withdrawBtn){ e.preventDefault(); e.stopPropagation(); const id=withdrawBtn.dataset.infoWithdraw; if(confirm('确定撤回？')){ try{await api(`/api/messages/${id}/withdraw`,{method:'POST'}); toast('已撤回'); const uid=document.querySelector('#userInfoDialog')?.dataset.uid; if(uid) openUserInfo(uid);}catch(err){toast('撤回失败')} } return; }
  const fileBtn=e.target.closest('[data-file-info]');
  if(fileBtn){ e.preventDefault(); e.stopPropagation(); openFileInfo(fileBtn.dataset.fileInfo); return; }
  const img=e.target.closest('img.zoomable');
  if(img){ e.preventDefault(); e.stopPropagation(); openLightbox(img.dataset.full||img.src, document.querySelector('#userInfoDialog'), img.classList.contains('profile-avatar-img')); }
}, true);
function el_menu(id){return document.querySelector(`.msg-menu[data-menu-for="${CSS.escape(id)}"]`)}
function unlockBubbles(except){document.querySelectorAll('.bubble[data-wlock]').forEach(bb=>{if(bb!==except){bb.style.width='';bb.removeAttribute('data-wlock')}})}
function closeMsgMenus(){document.querySelectorAll('.msg-menu').forEach(mm=>mm.hidden=true);document.querySelectorAll('.msg-more-btn.on').forEach(b=>b.classList.remove('on'));unlockBubbles(null)}
document.addEventListener('click',e=>{if(!e.target.closest('.msg-menu')&&!e.target.closest('.msg-more-btn'))closeMsgMenus()});
messagesEl.onclick=async e=>{let fi=e.target.closest('[data-file-info]'); if(fi){e.preventDefault(); e.stopPropagation(); openFileInfo(fi.dataset.fileInfo); return} let ub=e.target.closest('[data-user-info]'); if(ub){openUserInfo(ub.dataset.userInfo); return} let img=e.target.closest('img.zoomable'); if(img){openLightboxFromImg(img, messagesEl); return} let b=e.target.closest('button'); if(!b)return; if('codeCopy' in b.dataset){const code=b.closest('.code-block')?.querySelector('code')?.textContent||''; try{await copyText(code); toast('代码已复制')}catch{toast('复制失败，已尝试选中文本')} return} if(b.dataset.menu){e.stopPropagation(); const menu=el_menu(b.dataset.menu); const bubble=b.closest('.bubble'); document.querySelectorAll('.msg-menu').forEach(mm=>{if(mm!==menu)mm.hidden=true}); document.querySelectorAll('.msg-more-btn.on').forEach(x=>{if(x!==b)x.classList.remove('on')}); unlockBubbles(bubble); if(menu){const willOpen=menu.hidden; if(willOpen){ if(bubble){bubble.style.width=Math.max(Math.ceil(bubble.getBoundingClientRect().width),120)+'px'; bubble.setAttribute('data-wlock','1');} menu.hidden=false; b.classList.add('on'); requestAnimationFrame(()=>menu.scrollIntoView({block:'nearest',behavior:'smooth'})); } else { menu.hidden=true; b.classList.remove('on'); if(bubble){bubble.style.width='';bubble.removeAttribute('data-wlock');} } } return} if(b.dataset.open){openLightbox(b.dataset.open); return} if(b.dataset.textFile){openTextFile(b.dataset.textFile); return} let id=b.dataset.copy||b.dataset.toggle||b.dataset.edit||b.dataset.withdraw||b.dataset.restore||b.dataset.makeprivate||b.dataset.makepublic; let el=$(`#m-${CSS.escape(id)}`); if(b.dataset.copy){let txt=messageStore.get(id)?.content ?? el?.querySelector('.content')?.innerText ?? ''; try{await copyText(txt); toast('已复制整条消息')}catch{toast('复制失败，已尝试选中文本')}} if(b.dataset.toggle){let c=el?.querySelector('.content'); if(c){if(c.classList.contains('collapsed')){c.classList.remove('collapsed'); expandedMessages.add(id); c.dataset.manual='1'; b.textContent='收起'}else{c.classList.add('collapsed'); expandedMessages.delete(id); c.dataset.manual=''; b.textContent='展开'}}} if(b.dataset.edit){closeMsgMenus(); editingId=id; const ed=$('#editText'); ed.value=messageStore.get(id)?.content ?? el?.querySelector('.content')?.innerText ?? ''; showDialog($('#editDialog')); setTimeout(()=>{autoGrowTextarea(ed); ed.focus()},0)} if(b.dataset.withdraw){if(confirm('确定撤回？')){await api(`/api/messages/${id}/withdraw`,{method:'POST'}); toast('已撤回')}} if(b.dataset.restore){await api(`/api/messages/${id}/restore`,{method:'POST'}); toast('已恢复')} if(b.dataset.makeprivate){if(confirm('设为私人消息？设后仅你自己可见。')){try{await api(`/api/messages/${id}/visibility`,{method:'POST',body:JSON.stringify({private:true})}); toast('已设为私人')}catch{toast('操作失败')}}} if(b.dataset.makepublic){if(confirm('❗ 设为公开后，群聊里所有人都能看到这条消息。确定公开？')){try{await api(`/api/messages/${id}/visibility`,{method:'POST',body:JSON.stringify({private:false})}); toast('已设为公开')}catch{toast('操作失败')}}}}
$('#saveEdit').onclick=async e=>{e.preventDefault(); await api(`/api/messages/${editingId}`,{method:'PATCH',body:JSON.stringify({content:$('#editText').value})}); closeDialog($('#editDialog'))}
document.querySelectorAll('.dialog button[value="cancel"]').forEach(btn=>{btn.addEventListener('click',e=>{e.preventDefault(); closeDialog(btn.closest('dialog'));});});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',setModalLock));
$('#tryCopyText') && ($('#tryCopyText').onclick=()=>{const ta=$('#copyTextArea'); ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); if(copyTextSync(ta.value)) toast('已尝试复制，请检查剪贴板'); else toast('复制被浏览器拦截，请手动复制')});
$('#selectCopyText') && ($('#selectCopyText').onclick=()=>{const ta=$('#copyTextArea'); ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length)});
$('#closeTextFile') && ($('#closeTextFile').onclick=()=>closeDialog($('#textFileDialog')));
$('#editTextFile') && ($('#editTextFile').onclick=()=>setTextFileMode('edit'));
$('#cancelTextFile') && ($('#cancelTextFile').onclick=()=>{const dlg=$('#textFileDialog'), ta=$('#textFileContent'); if(!confirm('确定放弃本次修改？'))return; ta.value=dlg.dataset.original||''; setTextFileMode('view')});
$('#saveTextFile') && ($('#saveTextFile').onclick=async()=>{if(!confirm('确定保存修改？'))return; const dlg=$('#textFileDialog'), fid=dlg.dataset.fid, ta=$('#textFileContent'); await api(`/api/file/${fid}/text`,{method:'PATCH',body:JSON.stringify({content:ta.value})}); dlg.dataset.original=ta.value; toast('文本文件已保存'); setTextFileMode('view'); loadMessages({forceScroll:false}).catch(()=>{})});
$('#editText').addEventListener('input', e=>autoGrowTextarea(e.target));
async function openProfile(){selectedAvatar=null; if(pendingAvatarUrl){URL.revokeObjectURL(pendingAvatarUrl);} pendingAvatarBlob=null; pendingAvatarUrl=null; const p=await api('/api/presets'); $('#nicknameInput').value=me.nickname; $('#profileName').innerHTML=`${escapeHtml(me.nickname)} <span class="profile-ip">IP · ${escapeHtml(me.last_ip||'未知')}</span>`; const av=$('#profileAvatar'); if(me.avatar_type==='upload'){av.innerHTML=`<img src="${me.avatar_url}">`; av.dataset.full=me.avatar_url}else{av.innerHTML=escapeHtml(me.avatar_value); av.dataset.full=''} av.classList.toggle('avatar-zoomable', me.avatar_type==='upload'); $('#presetAvatars').innerHTML=p.avatars.map(a=>`<button class="avatar-choice" data-av="${a}">${a}</button>`).join(''); updateModeUI(); showDialog($('#profileDialog')); loadIdentity(); {const _ne=$('#nicknameError'); if(_ne){_ne.hidden=true;_ne.textContent='';}} const sc=$('#profileDialog').querySelector('.profile-scroll'); if(sc){sc.scrollTop=0; requestAnimationFrame(()=>{sc.scrollTop=0})}}

let identityState={id_code:'',has_secret:false};
async function loadIdentity(){try{const d=await api('/api/identity'); identityState=d; const cv=$('#idCodeView'); if(cv) cv.textContent=d.id_code||'-'; const st=$('#idSecretState'); if(st){st.textContent=d.has_secret?'🔑 已设密码':'⚠️ 未设密码'; st.classList.toggle('ok',d.has_secret)}}catch(e){}}
function openIdentityDialog(){const has=identityState.has_secret; const codeIsCustom = identityState.id_code && !/^[2-9A-HJ-NP-Z]{6}$/.test(identityState.id_code); $('#identityTitle').textContent=has?'修改身份码·密码':'设置身份码·密码'; $('#identityHint').textContent=has?'随机身份码可修改，支持中文；修改身份码必须同时设置新密码（至少4位），改密码需验证原密码。':'随机身份码可修改，支持中文。设置/修改身份码必须同时设置密码（至少4位）；身份码即凭证，避免被他人凭码认领。'; $('#identityHint').className='mode-tip identity-warn'; $('#idCodeInput').value=identityState.id_code||''; $('#oldSecretInput').value=''; $('#newSecretInput').value=''; $('#identityError').textContent=''; $('#oldSecretWrap').classList.toggle('hidden',!has); showDialog($('#identityDialog'))}
$('#manageIdentityBtn') && ($('#manageIdentityBtn').onclick=openIdentityDialog);
$('#recoverIdentityBtn') && ($('#recoverIdentityBtn').onclick=()=>{$('#recoverCodeInput').value=''; $('#recoverSecretInput').value=''; $('#recoverError').textContent=''; showDialog($('#recoverDialog'))});
$('#saveIdentityBtn') && ($('#saveIdentityBtn').onclick=async()=>{const newCode=$('#idCodeInput').value.trim(), newSecret=$('#newSecretInput').value; const codeChanged=newCode!==identityState.id_code; if(codeChanged && !newSecret){$('#identityError').textContent='修改身份码必须同时设置新密码（至少4位）'; return} const body={id_code:newCode,old_secret:$('#oldSecretInput').value,new_secret:newSecret}; $('#identityError').textContent=''; try{const d=await api('/api/identity/save',{method:'POST',body:JSON.stringify(body)}); identityState={id_code:d.id_code,has_secret:d.has_secret}; closeDialog($('#identityDialog')); loadIdentity(); toast('身份码已保存')}catch(e){$('#identityError').textContent=errText(e)||'保存失败'}});
$('#doRecoverBtn') && ($('#doRecoverBtn').onclick=async()=>{if(!confirm('恢复后，当前设备现有身份发过的消息/文件会合并到该身份码名下，当前临时身份会被删除。继续？')) return; const body={id_code:$('#recoverCodeInput').value.trim(),secret:$('#recoverSecretInput').value}; $('#recoverError').textContent=''; try{const d=await api('/api/identity/recover',{method:'POST',body:JSON.stringify(body)}); me=d.user; closeDialog($('#recoverDialog')); closeDialog($('#profileDialog')); toast('已恢复身份'); await loadMessages({forceScroll:true})}catch(e){$('#recoverError').textContent=errText(e)||'恢复失败'}});
$('#profileAvatar') && ($('#profileAvatar').onclick=()=>{const f=$('#profileAvatar').dataset.full; if(f) openLightbox(f, $('#profileDialog'), true)});
$('#profileBtn') && ($('#profileBtn').onclick=openProfile);
$('#profileBtnBottom') && ($('#profileBtnBottom').onclick=openProfile)

// ===== 聊天室搜索 =====
let searchTimer=null, searchSeq=0, lastSearchQuery='';
function highlightText(text, q){ const t=escapeHtml(text||''); if(!q) return t; try{ const re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'); return t.replace(re,'<mark>$1</mark>'); }catch{ return t } }
function searchSnippet(content, q){ const text=(content||'').replace(/\s+/g,' ').trim(); if(!text) return '（空消息）'; const i=q?text.toLowerCase().indexOf(q.toLowerCase()):-1; if(i<0) return highlightText(text.slice(0,120)+(text.length>120?'…':''),q); const start=Math.max(0,i-30), end=Math.min(text.length,i+q.length+70); return (start>0?'…':'')+highlightText(text.slice(start,end),q)+(end<text.length?'…':''); }
function searchFileIcon(kind){return kind==='image'?'🖼️':kind==='video'?'🎬':kind==='audio'?'🎵':kind==='text'?'📝':'📄'}
async function runSearch(q){
  q=(q||'').trim(); const box=$('#searchResults'); const seq=++searchSeq; lastSearchQuery=q;
  if(!q){ box.innerHTML='<div class="empty-note">输入关键词开始搜索</div>'; return }
  box.innerHTML='<div class="empty-note">搜索中…</div>';
  try{
    const d=await api(`/api/search?q=${encodeURIComponent(q)}&scope=${chatMode}`);
    if(seq!==searchSeq) return;
    const msgs=d.messages||[], files=d.files||[];
    msgs.forEach(m=>{ if(m&&m.id) messageStore.set(m.id,m); if(m&&m.file) rememberFile(m.file) });
    files.forEach(f=>rememberFile(f));
    let html='';
    if(!msgs.length && !files.length){ box.innerHTML='<div class="empty-note">没有找到匹配结果</div>'; return }
    if(files.length){
      html+=`<div class="search-group-title">文件 · ${files.length}</div>`;
      html+=files.map(f=>`<button type="button" class="search-item search-file" data-search-file="${escapeHtml(f.id)}"><span class="search-file-icon">${searchFileIcon(f.kind)}</span><span class="search-file-main"><span class="search-file-name">${highlightText(f.name,q)}</span><span class="search-file-sub">${escapeHtml(f.kind||'file')} · ${size(f.size||0)} · ${escapeHtml(f.uploader||'未知')}</span></span></button>`).join('');
    }
    if(msgs.length){
      html+=`<div class="search-group-title">聊天消息 · ${msgs.length}</div>`;
      html+=msgs.map(m=>`<button type="button" class="search-item search-msg" data-search-msg="${escapeHtml(m.id)}"><span class="search-msg-head"><span class="search-msg-name">${escapeHtml(m.user?.nickname||'未知')}</span><span class="search-msg-time">${fmt(m.created_at)}</span></span><span class="search-msg-snippet">${searchSnippet(m.content,q)}${m.file?` <span class="search-msg-file">📎 ${highlightText(m.file.name,q)}</span>`:''}</span></button>`).join('');
    }
    box.innerHTML=html;
  }catch(e){ if(seq===searchSeq) box.innerHTML='<div class="empty-note">搜索失败</div>'; }
}
function openSearch(){ const dlg=$('#searchDialog'); if(!dlg) return; const inp=$('#searchInput'); showDialog(dlg); setTimeout(()=>{inp&&inp.focus()},60); if(inp&&inp.value.trim()) runSearch(inp.value); }
$('#searchFab') && ($('#searchFab').onclick=openSearch);
$('#modeSeg') && $('#modeSeg').addEventListener('click',e=>{const b=e.target.closest('[data-mode-opt]'); if(!b)return; e.preventDefault(); setChatMode(b.dataset.modeOpt);});
$('#searchBtn') && ($('#searchBtn').onclick=openSearch);
$('#searchInput') && $('#searchInput').addEventListener('input',e=>{ clearTimeout(searchTimer); const v=e.target.value; searchTimer=setTimeout(()=>runSearch(v),280); });
function clearKwHits(){ document.querySelectorAll('mark.kw-hit').forEach(m=>{ const p=m.parentNode; if(!p)return; p.replaceChild(document.createTextNode(m.textContent),m); p.normalize(); }); }
function highlightKeywordIn(container, q){
  // 用 TreeWalker 只在文本节点里包 <mark>，不破坏 markdown/链接等 HTML 结构。返回第一个命中的 mark。
  if(!q||!container) return null;
  const ql=q.toLowerCase(); let first=null;
  const walker=document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {acceptNode(n){ if(!n.nodeValue||!n.nodeValue.toLowerCase().includes(ql)) return NodeFilter.FILTER_REJECT; if(n.parentNode&&n.parentNode.closest&&n.parentNode.closest('mark.kw-hit')) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; }});
  const targets=[]; let node; while(node=walker.nextNode()) targets.push(node);
  for(const t of targets){
    const text=t.nodeValue; const frag=document.createDocumentFragment(); let i=0, low=text.toLowerCase(), idx;
    while((idx=low.indexOf(ql,i))>=0){ if(idx>i) frag.appendChild(document.createTextNode(text.slice(i,idx))); const mk=document.createElement('mark'); mk.className='kw-hit'; mk.textContent=text.slice(idx,idx+q.length); frag.appendChild(mk); if(!first) first=mk; i=idx+q.length; }
    if(i<text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    t.parentNode.replaceChild(frag,t);
  }
  return first;
}
async function locateMessage(id){
  let el=$(`#m-${CSS.escape(id)}`);
  if(!el){
    // 不在已渲染范围：以该消息为中心加载一段上下文
    try{
      const d=await api(`/api/messages?around=${encodeURIComponent(id)}&limit=50&scope=${chatMode}`);
      if(d.messages&&d.messages.length){
        messagesEl.innerHTML=''; messageStore.clear();
        d.messages.forEach(m=>{ if(m&&m.id) messageStore.set(m.id,m); if(m&&m.file) rememberFile(m.file); messagesEl.insertAdjacentHTML('beforeend',renderMessage(m)); });
        oldestId=d.messages[0].id; hasMoreOlder=true;
        collapseLong(); bindMediaSettleScroll(); refreshDateDividers();
        el=$(`#m-${CSS.escape(id)}`);
      }
    }catch{}
  }
  if(!el) return false;
  closeDialog($('#searchDialog'));
  clearKwHits();
  const content=el.querySelector('.content');
  if(content&&content.classList.contains('collapsed')){ content.classList.remove('collapsed'); expandedMessages.add(id); content.dataset.manual='1'; const tb=el.querySelector('[data-toggle]'); if(tb) tb.textContent='收起'; }
  el.classList.add('msg-hit'); setTimeout(()=>el.classList.remove('msg-hit'),2200);
  let firstMark=null;
  if(lastSearchQuery&&content){ try{ firstMark=highlightKeywordIn(content,lastSearchQuery); }catch{} }
  requestAnimationFrame(()=>{ (firstMark||el).scrollIntoView({behavior:'smooth',block:'center'}); });
  setTimeout(clearKwHits,4000);
  return true;
}
$('#searchResults') && $('#searchResults').addEventListener('click',async e=>{
  const fb=e.target.closest('[data-search-file]'); if(fb){ e.preventDefault(); closeDialog($('#searchDialog')); openFileInfo(fb.dataset.searchFile); return; }
  const mb=e.target.closest('[data-search-msg]'); if(mb){ e.preventDefault(); const id=mb.dataset.searchMsg; const ok=await locateMessage(id); if(!ok){ const m=messageStore.get(id); openCopyPanel(m?`[${m.user?.nickname||'未知'} · ${fmt(m.created_at)}]\n${m.content||''}`:'未找到该消息'); toast('未能定位该消息'); } return; }
});
$('#presetAvatars').onclick=e=>{let b=e.target.closest('[data-av]'); if(b){selectedAvatar=b.dataset.av; $('#profileAvatar').textContent=selectedAvatar}}
$('#avatarUpload').onchange=async e=>{const f=e.target.files[0]; e.target.value=''; if(!f)return; openAvatarCropper(f)};

/* ===== 搜索弹窗 Tab 切换 ===== */
document.querySelectorAll('.search-tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.search-tab').forEach(x=>x.classList.toggle('on',x===t));
  const tab=t.dataset.stab;
  document.querySelectorAll('.search-pane').forEach(p=>p.classList.toggle('hidden',p.dataset.spane!==tab));
  if(tab==='time'){ const inp=null; } else { const inp=$('#searchInput'); setTimeout(()=>inp&&inp.focus(),50); }
});

/* ===== 自定义范围日历 ===== */
let calRange={start:null,end:null}; // Date 对象（只到天）
let calView=new Date(); calView.setDate(1);
function ymd(d){return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:''}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function dayMs(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()}
function renderCal(){
  $('#calTitle').textContent=`${calView.getFullYear()}年 ${calView.getMonth()+1}月`;
  const first=new Date(calView.getFullYear(),calView.getMonth(),1);
  const startWd=first.getDay(); const days=new Date(calView.getFullYear(),calView.getMonth()+1,0).getDate();
  const today=new Date();
  let html='';
  for(let i=0;i<startWd;i++) html+='<span class="cal-cell empty"></span>';
  for(let d=1;d<=days;d++){
    const cur=new Date(calView.getFullYear(),calView.getMonth(),d);
    const cls=['cal-cell','day']; const t=dayMs(cur);
    const future=t>dayMs(today);
    if(future) cls.push('disabled');
    if(sameDay(cur,today)) cls.push('today');
    if(calRange.start&&sameDay(cur,calRange.start)) cls.push('sel','sel-start');
    if(calRange.end&&sameDay(cur,calRange.end)) cls.push('sel','sel-end');
    if(calRange.start&&calRange.end&&t>dayMs(calRange.start)&&t<dayMs(calRange.end)) cls.push('in-range');
    html+=`<button type="button" class="${cls.join(' ')}" data-day="${d}"${future?' disabled':''}>${d}</button>`;
  }
  $('#calGrid').innerHTML=html;
  // 不能翻到未来月份
  const nextBtn=$('#calNext'); if(nextBtn){ const atCur=calView.getFullYear()===today.getFullYear()&&calView.getMonth()===today.getMonth(); nextBtn.disabled=atCur; nextBtn.style.opacity=atCur?'.35':''; nextBtn.style.cursor=atCur?'not-allowed':''; }
  const h=$('#calHint');
  if(!calRange.start) h.textContent='点选开始日期';
  else if(!calRange.end) h.textContent=`开始 ${ymd(calRange.start)}，再点选结束日期`;
  else h.textContent=`${ymd(calRange.start)} → ${ymd(calRange.end)}`;
}
function openCal(){ calView=new Date((calRange.start||new Date())); calView.setDate(1); renderCal(); $('#calPop').classList.remove('hidden'); }
function closeCal(){ $('#calPop').classList.add('hidden'); }
$('#calPrev')&&($('#calPrev').onclick=e=>{e.stopPropagation();calView.setMonth(calView.getMonth()-1);renderCal()});
$('#calNext')&&($('#calNext').onclick=e=>{e.stopPropagation(); if(e.currentTarget.disabled)return; calView.setMonth(calView.getMonth()+1);renderCal()});
$('#calGrid')&&($('#calGrid').onclick=e=>{ e.stopPropagation(); const b=e.target.closest('[data-day]'); if(!b||b.disabled)return; const d=new Date(calView.getFullYear(),calView.getMonth(),+b.dataset.day);
  if(!calRange.start||calRange.end){ calRange.start=d; calRange.end=null; } // 开始新选择
  else { if(dayMs(d)<dayMs(calRange.start)){ calRange.end=calRange.start; calRange.start=d; } else calRange.end=d; }
  renderCal();
});
$('#calClear')&&($('#calClear').onclick=e=>{e.stopPropagation();calRange={start:null,end:null}; renderCal(); updateTimeFields();});
$('#calDone')&&($('#calDone').onclick=e=>{e.stopPropagation(); if(calRange.start&&!calRange.end) calRange.end=calRange.start; closeCal(); updateTimeFields(); });
function updateTimeFields(){ const v=!calRange.start?'点此打开日历':(calRange.end&&calRange.end.getTime()!==calRange.start.getTime())?`${ymd(calRange.start)} → ${ymd(calRange.end)}`:ymd(calRange.start); $('#timeRangeVal').textContent=v; }
$('#timeRangeBtn')&&($('#timeRangeBtn').onclick=e=>{e.stopPropagation();openCal()});
// 点日历外部关闭
document.addEventListener('click',e=>{ const pop=$('#calPop'); if(pop&&!pop.classList.contains('hidden')&&!e.target.closest('.cal-pop-inner')&&!e.target.closest('.time-field')) closeCal(); });
// 快捷按钮
document.querySelectorAll('.time-quick [data-quick]').forEach(b=>b.onclick=()=>{
  const now=new Date(); const end=new Date(now); let start=new Date(now);
  const k=b.dataset.quick;
  if(k==='today'){}
  else if(k==='yesterday'){ start.setDate(now.getDate()-1); end.setDate(now.getDate()-1); }
  else if(k==='7d'){ start.setDate(now.getDate()-6); }
  else if(k==='30d'){ start.setDate(now.getDate()-29); }
  calRange.start=new Date(start.getFullYear(),start.getMonth(),start.getDate());
  calRange.end=new Date(end.getFullYear(),end.getMonth(),end.getDate());
  updateTimeFields(); runTimeQuery();
});
$('#timeGoBtn')&&($('#timeGoBtn').onclick=()=>runTimeQuery());
async function runTimeQuery(){
  const box=$('#timeResults');
  if(!calRange.start){ box.innerHTML='<div class="empty-note">请先选择开始日期</div>'; return; }
  const s=new Date(calRange.start); s.setHours(0,0,0,0);
  const e=new Date(calRange.end||calRange.start); e.setHours(23,59,59,999);
  const startIso=ymd(s)+'T00:00:00'; const endIso=ymd(e)+'T23:59:59';
  box.innerHTML='<div class="empty-note">加载中…</div>';
  try{
    const d=await api(`/api/messages?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&limit=300&scope=${chatMode}`);
    const msgs=d.messages||[];
    if(!msgs.length){ box.innerHTML='<div class="empty-note">这段时间没有消息</div>'; return; }
    box.innerHTML=`<div class="search-group-title">${ymd(s)} → ${ymd(e)} · ${msgs.length} 条</div>`+msgs.map(m=>`<button type="button" class="search-item search-msg" data-time-msg="${escapeHtml(m.id)}"><span class="search-msg-head"><span class="search-msg-name">${escapeHtml(m.user?.nickname||'未知')}</span><span class="search-msg-time">${fmt(m.created_at)}</span></span><span class="search-msg-snippet">${searchSnippet(m.content,'')}${m.file?` <span class="search-msg-file">📎 ${escapeHtml(m.file.name)}</span>`:''}</span></button>`).join('');
  }catch{ box.innerHTML='<div class="empty-note">加载失败</div>'; }
}
$('#timeResults')&&$('#timeResults').addEventListener('click',async e=>{ const b=e.target.closest('[data-time-msg]'); if(!b)return; e.preventDefault(); lastSearchQuery=''; await locateMessage(b.dataset.timeMsg); });


/* ===== 圆形头像裁切 ===== */
let cropState=null;
function openAvatarCropper(file){
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{
    const dlg=$('#avatarCropDialog'), stage=$('#cropStage'), canvas=$('#cropCanvas');
    const size=Math.min(300, Math.floor((window.innerWidth||360)*0.78));
    stage.style.width=size+'px'; stage.style.height=size+'px';
    canvas.width=size; canvas.height=size;
    // 初始缩放：让图片“充满”圆形区（cover）
    const baseScale=Math.max(size/img.width, size/img.height);
    cropState={img,url,size,baseScale,zoom:1,minZoom:1,maxZoom:3,offX:0,offY:0,dragging:false,lastX:0,lastY:0};
    $('#cropZoom').value='1';
    clampCropOffset(); drawCrop();
    showDialog(dlg);
  };
  img.onerror=()=>{URL.revokeObjectURL(url); toast('图片读取失败')};
  img.src=url;
}
function curScale(){return cropState.baseScale*cropState.zoom}
function clampCropOffset(){
  const s=cropState, sc=curScale(); const dw=s.img.width*sc, dh=s.img.height*sc;
  const maxX=Math.max(0,(dw-s.size)/2), maxY=Math.max(0,(dh-s.size)/2);
  s.offX=Math.max(-maxX,Math.min(maxX,s.offX)); s.offY=Math.max(-maxY,Math.min(maxY,s.offY));
}
function drawCrop(){
  const s=cropState; if(!s)return; const ctx=$('#cropCanvas').getContext('2d'); const sc=curScale();
  const dw=s.img.width*sc, dh=s.img.height*sc;
  ctx.clearRect(0,0,s.size,s.size); ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,s.size,s.size);
  ctx.drawImage(s.img, s.size/2 - dw/2 + s.offX, s.size/2 - dh/2 + s.offY, dw, dh);
  updateCropMeta();
}
function updateCropMeta(){
  const s=cropState; if(!s)return; const OUT=256;
  // 圆形区（直径 s.size 显示像素）采样到的源图像素数
  const srcPx=Math.round(s.size/curScale());
  const z=$('#cropZoomVal'), q=$('#cropQuality');
  if(z)z.textContent=Math.round(s.zoom*100)+'%';
  if(!q)return;
  if(srcPx>=OUT){q.textContent='清晰 · '+srcPx+'px'; q.className='crop-q ok';}
  else if(srcPx>=OUT*0.78){q.textContent='轻微偏虚 · '+srcPx+'px'; q.className='crop-q warn';}
  else {q.textContent='偏虚 · '+srcPx+'px（建议缩小）'; q.className='crop-q bad';}
}
function bindCropDrag(){
  const stage=$('#cropStage');
  const start=(x,y)=>{cropState.dragging=true;cropState.lastX=x;cropState.lastY=y};
  const move=(x,y)=>{if(!cropState?.dragging)return;cropState.offX+=x-cropState.lastX;cropState.offY+=y-cropState.lastY;cropState.lastX=x;cropState.lastY=y;clampCropOffset();drawCrop()};
  const end=()=>{if(cropState)cropState.dragging=false};
  stage.addEventListener('mousedown',e=>{e.preventDefault();start(e.clientX,e.clientY)});
  window.addEventListener('mousemove',e=>move(e.clientX,e.clientY));
  window.addEventListener('mouseup',end);
  stage.addEventListener('touchstart',e=>{const t=e.touches[0];start(t.clientX,t.clientY)},{passive:true});
  stage.addEventListener('touchmove',e=>{const t=e.touches[0];move(t.clientX,t.clientY);e.preventDefault()},{passive:false});
  stage.addEventListener('touchend',end);
}
bindCropDrag();
$('#cropZoom').oninput=e=>{if(!cropState)return;cropState.zoom=parseFloat(e.target.value)||1;clampCropOffset();drawCrop()};
$('#cropCancel').onclick=()=>{if(cropState?.url)URL.revokeObjectURL(cropState.url);cropState=null;closeDialog($('#avatarCropDialog'))};
$('#cropConfirm').onclick=async()=>{
  if(!cropState)return; const s=cropState; const OUT=256;
  const out=document.createElement('canvas'); out.width=OUT; out.height=OUT; const ctx=out.getContext('2d');
  const sc=curScale(); const dw=s.img.width*sc, dh=s.img.height*sc; const ratio=OUT/s.size;
  // 圆形裁切
  ctx.save(); ctx.beginPath(); ctx.arc(OUT/2,OUT/2,OUT/2,0,Math.PI*2); ctx.closePath(); ctx.clip();
  ctx.drawImage(s.img,(s.size/2 - dw/2 + s.offX)*ratio,(s.size/2 - dh/2 + s.offY)*ratio,dw*ratio,dh*ratio);
  ctx.restore();
  const blob=await new Promise(res=>out.toBlob(res,'image/png',0.92));
  if(s.url)URL.revokeObjectURL(s.url); cropState=null; closeDialog($('#avatarCropDialog'));
  // 不立即上传：暂存裁切结果，本地预览，点“保存”才生效
  if(pendingAvatarUrl)URL.revokeObjectURL(pendingAvatarUrl);
  pendingAvatarBlob=blob; pendingAvatarUrl=URL.createObjectURL(blob); selectedAvatar=null;
  $('#profileAvatar').innerHTML=`<img src="${pendingAvatarUrl}">`;
  $('#profileAvatar').dataset.full=pendingAvatarUrl;
  toast('裁切完成，点“保存”生效');
};
$('#nicknameInput')&&$('#nicknameInput').addEventListener('input',()=>{const e=$('#nicknameError'); if(e&&!e.hidden){e.hidden=true;e.textContent=''}});
$('#saveProfile').onclick=async e=>{e.preventDefault();
  if(pendingAvatarBlob){
    const fd=new FormData(); fd.append('file',pendingAvatarBlob,'avatar.png');
    const r=await fetch('/api/avatar/upload',{method:'POST',body:fd});
    if(r.ok){const d=await r.json(); me.avatar_type='upload'; me.avatar_value=d.avatar_value; me.avatar_url=d.avatar_url}else{toast('头像上传失败'); return}
    if(pendingAvatarUrl)URL.revokeObjectURL(pendingAvatarUrl); pendingAvatarBlob=null; pendingAvatarUrl=null;
  }
  const body={nickname:$('#nicknameInput').value}; if(selectedAvatar){body.avatar_type='preset'; body.avatar_value=selectedAvatar}
  const errEl=$('#nicknameError'); if(errEl){errEl.hidden=true; errEl.textContent='';}
  try{ const d=await api('/api/profile',{method:'POST',body:JSON.stringify(body)}); me=d.user; selectedAvatar=null; closeDialog($('#profileDialog')); await loadMessages({forceScroll:false}); }catch(err){ const msg=errText(err)||'保存失败'; if(errEl){errEl.textContent=msg; errEl.hidden=false; const ni=$('#nicknameInput'); ni&&ni.focus(); errEl.scrollIntoView({block:'nearest'});} else toast(msg); }}
function selectElementText(el){ if(!el) return; const range=document.createRange(); range.selectNodeContents(el); const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range) }
function copyTextSync(txt){ txt=String(txt||''); const ta=document.createElement('textarea'); ta.value=txt; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.left='-9999px'; ta.style.top='0'; ta.style.fontSize='16px'; document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); let ok=false; try{ok=document.execCommand('copy')}catch(e){} ta.remove(); return ok }
async function copyText(txt){ if(copyTextSync(txt)) return; txt=String(txt||''); if(navigator.clipboard){ await navigator.clipboard.writeText(txt); return } throw new Error('copy failed') }
function highlightAndScrollTo(el){
  if(!el) return;
  const target = el.closest('.media-card, .file-item, .file-card, .bubble, .message, .admin-file-item, .admin-msg-item, tr') || el;
  requestAnimationFrame(()=>{
    target.scrollIntoView({behavior:'smooth',block:'center'});
    target.classList.remove('item-highlight-pulse');
    void target.offsetWidth;
    target.classList.add('item-highlight-pulse');
    setTimeout(()=>target.classList.remove('item-highlight-pulse'),1800);
  });
}
function openLightboxFromImg(imgEl, container){
  const sel = imgEl.hasAttribute('data-img-open') ? '[data-img-open]' : 'img.zoomable';
  const imgs=[...(container||document).querySelectorAll(sel)];
  const list=imgs.map(im=>im.dataset.imgOpen||im.dataset.full||im.src);
  let idx=imgs.indexOf(imgEl); if(idx<0) idx=0;
  openLightbox(list[idx]||imgEl.dataset.imgOpen||imgEl.dataset.full||imgEl.src, document.body, false, list, idx, imgs);
}
function openLightbox(src, mount=document.body, round=false, gallery=null, gIndex=0, imgEls=null){
  let old=document.querySelector('.lightbox'); if(old){old.remove();}
  document.documentElement.classList.add('lightbox-open'); document.body.classList.add('lightbox-open');
  
  let zoom=1, x=0, y=0, pointers=new Map(), dragStart=null, pinchStart=null, tapStart=null, clickTimer=null;
  let isSwiping=false, isTransitioning=false;
  const gList=Array.isArray(gallery)&&gallery.length?gallery:[src]; let gPos=Math.max(0,Math.min(gIndex,gList.length-1));
  const gEls=Array.isArray(imgEls)&&imgEls.length===gList.length?imgEls:null;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  let box=document.createElement('div'); box.className='lightbox'+(round?' lightbox-round':'');
  const counter=gList.length>1?`<span class="lightbox-counter-inline"><span>${gPos+1}</span>/${gList.length}</span>`:'';
  const navBtns=gList.length>1?`<button class="lightbox-nav prev" data-gprev aria-label="上一张">‹</button><button class="lightbox-nav next" data-gnext aria-label="下一张">›</button>`:'';
  const locateBtn=`<button data-glocate title="定位到原图位置">📍</button>`;

  // 3 槽平移轨道：-100vw - gap(24px) | 0 | 100vw + gap(24px)
  box.innerHTML=`<div class="lightbox-tools">${locateBtn}${counter}<button data-zout title="缩小">−</button><button data-zreset title="重置">100%</button><button data-zin title="放大">＋</button><button class="lightbox-close" title="关闭">×</button></div>${navBtns}<div class="lightbox-viewport"><div class="lightbox-track"><div class="lightbox-slot slot-prev"></div><div class="lightbox-slot slot-curr"><img class="lightbox-img" src="${src}" alt="大图"></div><div class="lightbox-slot slot-next"></div></div></div>`;

  const viewport=box.querySelector('.lightbox-viewport');
  const track=box.querySelector('.lightbox-track');
  const slotPrev=box.querySelector('.slot-prev');
  const slotCurr=box.querySelector('.slot-curr');
  const slotNext=box.querySelector('.slot-next');

  const img=()=>slotCurr.querySelector('.lightbox-img');
  
  const applyZoom=()=>{ const im=img(); if(im){ im.style.transform=`translate3d(${x}px, ${y}px, 0) scale(${zoom})`; im.style.cursor=zoom>1?'grab':'zoom-in'; } };
  const resetZoom=()=>{zoom=1;x=0;y=0;applyZoom()};
  
  const close=()=>{box.remove(); if(!document.querySelector('.lightbox')){document.documentElement.classList.remove('lightbox-open'); document.body.classList.remove('lightbox-open'); document.body.style.transform=''; document.documentElement.style.transform=''}};
  const updateCounter=()=>{ const c=box.querySelector('.lightbox-counter-inline span'); if(c) c.textContent=String(gPos+1); };

  function renderSlots(){
    // 渲染 prev
    if(gPos>0){
      slotPrev.innerHTML=`<img class="lightbox-img" src="${gList[gPos-1]}" alt="上一张">`;
    } else {
      slotPrev.innerHTML='';
    }
    // 渲染 next
    if(gPos<gList.length-1){
      slotNext.innerHTML=`<img class="lightbox-img" src="${gList[gPos+1]}" alt="下一张">`;
    } else {
      slotNext.innerHTML='';
    }
  }
  renderSlots();

  function locateCurrent(){
    const targetEl = (gEls && gEls[gPos]) || null;
    close();
    if(targetEl && targetEl.nodeType){
      highlightAndScrollTo(targetEl);
    } else {
      const match = document.querySelector(`img.zoomable[data-full="${CSS.escape(gList[gPos])}"], img.zoomable[src="${CSS.escape(gList[gPos])}"], [data-img-open="${CSS.escape(gList[gPos])}"]`);
      if(match) highlightAndScrollTo(match);
    }
  }

  // 轨道平移动画（420ms，极度平滑的自然减速曲线）
  function slideTo(targetPos, dur=420){
    if(isTransitioning) return;
    isTransitioning=true;
    const diff = targetPos - gPos; // +1: 下一张, -1: 上一张, 0: 回原位
    const slotW = window.innerWidth + 24;
    const targetTranslate = -diff * slotW;

    track.style.transition = `transform ${dur}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    track.style.transform = `translate3d(${targetTranslate}px, 0, 0)`;

    setTimeout(()=>{
      track.style.transition = 'none';
      if(diff !== 0){
        gPos = targetPos;
        slotCurr.innerHTML = `<img class="lightbox-img" src="${gList[gPos]}" alt="大图">`;
        updateCounter();
        renderSlots();
      }
      track.style.transform = 'translate3d(0, 0, 0)';
      zoom=1; x=0; y=0;
      isTransitioning=false;
      isSwiping=false;
      applyZoom();
    }, dur + 10);
  }

  function go(dir){
    if(gList.length<2 || isTransitioning) return;
    const ni=gPos+dir;
    if(ni<0 || ni>=gList.length) return;
    slideTo(ni, 420);
  }

  const dist=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  const mid=(a,b)=>({clientX:(a.clientX+b.clientX)/2,clientY:(a.clientY+b.clientY)/2});
  const zoomAt=(newZoom,cx,cy)=>{newZoom=clamp(newZoom,.5,6); const im=img(); if(!im)return; const rect=im.getBoundingClientRect(); const ox=cx-(rect.left+rect.width/2); const oy=cy-(rect.top+rect.height/2); if(zoom!==0){x-=ox*(newZoom/zoom-1); y-=oy*(newZoom/zoom-1)} zoom=newZoom; applyZoom()};

  box.onclick=e=>{
    if(e.target.closest('[data-glocate]')){locateCurrent();return}
    if(e.target.closest('[data-gprev]')){go(-1);return}
    if(e.target.closest('[data-gnext]')){go(1);return}
    if(e.target===box||e.target===viewport||e.target.closest('.lightbox-close')) close();
    if(e.target.closest('[data-zin]')) zoomAt(zoom+.25, innerWidth/2, innerHeight/2);
    if(e.target.closest('[data-zout]')) zoomAt(zoom-.25, innerWidth/2, innerHeight/2);
    if(e.target.closest('[data-zreset]')) resetZoom();
  };

  box.addEventListener('wheel',e=>{e.preventDefault(); zoomAt(zoom*(e.deltaY<0?1.12:.88), e.clientX, e.clientY)},{passive:false});
  box.addEventListener('dblclick',e=>{e.preventDefault(); clearTimeout(clickTimer); if(zoom>1.05) resetZoom(); else zoomAt(2.5,e.clientX,e.clientY)});

  box.addEventListener('pointerdown',e=>{
    if(!e.target.closest('.lightbox-img') || isTransitioning) return;
    e.preventDefault();
    pointers.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
    if(pointers.size===1){
      tapStart={x:e.clientX,y:e.clientY,t:Date.now(),moved:false};
      isSwiping=false;
      track.style.transition='none';
    }
    img()?.setPointerCapture?.(e.pointerId);
    if(pointers.size===1 && zoom>1){
      dragStart={sx:e.clientX,sy:e.clientY,bx:x,by:y};
      const im=img(); if(im)im.style.cursor='grabbing';
    }
    if(pointers.size===2){
      tapStart=null; isSwiping=false;
      track.style.transform='translate3d(0, 0, 0)';
      let ps=[...pointers.values()];
      pinchStart={d:dist(ps[0],ps[1]),z:zoom,bx:x,by:y,m:mid(ps[0],ps[1])};
    }
  },{passive:false});

  box.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId) || isTransitioning) return;
    e.preventDefault();
    pointers.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
    
    // 双指缩放
    if(pointers.size===2 && pinchStart){
      let ps=[...pointers.values()]; let m=mid(ps[0],ps[1]);
      zoom=clamp(pinchStart.z*dist(ps[0],ps[1])/Math.max(1,pinchStart.d),.5,6);
      x=pinchStart.bx+(m.clientX-pinchStart.m.clientX);
      y=pinchStart.by+(m.clientY-pinchStart.m.clientY);
      applyZoom(); return;
    }

    // 放大后单指拖拽图片自身
    if(pointers.size===1 && zoom>1.05 && dragStart){
      x=dragStart.bx+(e.clientX-dragStart.sx);
      y=dragStart.by+(e.clientY-dragStart.sy);
      applyZoom(); return;
    }

    // 1倍率下滑动整个轨道（100% 真实物理跟手）
    if(pointers.size===1 && zoom<=1.05 && tapStart){
      const dx=e.clientX-tapStart.x, dy=e.clientY-tapStart.y;
      if(Math.abs(dx)>6 || Math.abs(dy)>6) tapStart.moved=true;

      if(!isSwiping && Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)*1.2 && gList.length>1){
        isSwiping=true;
      }

      if(isSwiping){
        let moveX=dx;
        // 边界阻尼感
        if((gPos===0 && dx>0) || (gPos===gList.length-1 && dx<0)){
          moveX = dx * 0.35;
        }
        track.style.transform=`translate3d(${moveX}px, 0, 0)`;
      }
    }
  },{passive:false});

  const end=e=>{
    if(!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    
    if(isSwiping){
      const dx=e.clientX-tapStart.x;
      const dt=Date.now()-tapStart.t;
      const velocity=Math.abs(dx)/Math.max(1,dt); // 速度像素/毫秒
      
      const shouldSwitch = (Math.abs(dx) > window.innerWidth * 0.18) || (velocity > 0.45 && Math.abs(dx) > 30);
      const dir = dx < 0 ? 1 : -1;
      const nextPos = gPos + dir;

      if(shouldSwitch && nextPos >= 0 && nextPos < gList.length){
        slideTo(nextPos, 420);
      } else {
        // 弹回当前
        slideTo(gPos, 320);
      }
      tapStart=null; dragStart=null; pinchStart=null;
      return;
    }

    const wasTap = tapStart && !tapStart.moved && (Date.now()-tapStart.t<300) && pointers.size===0;
    dragStart=null; pinchStart=null;
    const im=img(); if(im)im.style.cursor=zoom>1?'grab':'zoom-in';
    if(wasTap && zoom<=1.05){
      clearTimeout(clickTimer);
      clickTimer=setTimeout(close,260);
    }
    tapStart=null;
  };

  box.addEventListener('pointerup',end);
  box.addEventListener('pointercancel',end);
  box.addEventListener('pointerleave',e=>{ if(pointers.has(e.pointerId)) end(e) });

  document.addEventListener('keydown',function esc(e){
    if(e.key==='Escape'){close(); document.removeEventListener('keydown',esc)}
    else if(e.key==='ArrowLeft'){go(-1)}
    else if(e.key==='ArrowRight'){go(1)}
  });

  (mount||document.body).appendChild(box); applyZoom();
}
let _ws=null, _wsTimer=null, _wsAlive=false;
async function connectWs(){
  if(_ws&&(_ws.readyState===WebSocket.OPEN||_ws.readyState===WebSocket.CONNECTING))return;
  let proto=location.protocol==='https:'?'wss':'ws';
  // 取 WS token（兼容 X浏览器等 WebSocket 不带 cookie 的环境）
  let wsUrl=proto+'://'+location.host+'/ws';
  try{
    let tr=await fetch('/api/ws-token'); if(tr.ok){let td=await tr.json(); if(td.token)wsUrl+='?token='+encodeURIComponent(td.token)}
  }catch(e){}
  let ws; try{ws=new WebSocket(wsUrl)}catch(e){scheduleWs();return}
  _ws=ws;
  ws.onopen=()=>{_wsAlive=true};
  ws.onmessage=e=>{let d; try{d=JSON.parse(e.data)}catch{return} if(d.type==='remove'&&d.id){$(`#m-${CSS.escape(d.id)}`)?.remove(); messageStore.delete(d.id); return} if(d.type&&d.type.indexOf('p2p_')===0){try{handleP2pSignal(d)}catch(err){console.error('p2p signal error:',err,d)} return} if(d.message)upsertMessage(d.message)};
  ws.onclose=()=>{_wsAlive=false; if(_ws===ws)_ws=null; scheduleWs()};
  ws.onerror=()=>{try{ws.close()}catch{}};
}
function scheduleWs(){if(_wsTimer)return; _wsTimer=setTimeout(()=>{_wsTimer=null; connectWs()},2000)}
// 回到页面/网络恢复时：重连 + 补拉期间错过的消息（Chrome 后台挂起 socket 假死问题）
let _resyncTimer=null;
async function resyncOnResume(){
  if(!me)return;
  if(!_ws||_ws.readyState!==WebSocket.OPEN){connectWs()}
  if(typeof scheduleMidnightRefresh==='function') scheduleMidnightRefresh(); // 重算下个午夜（防后台节流漏触）
  if(_resyncTimer)return; _resyncTimer=setTimeout(()=>_resyncTimer=null,1500);
  try{await loadMessages({forceScroll:false, keepView:true})}catch{}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resyncOnResume()});
window.addEventListener('online',resyncOnResume);
// No periodic full refresh: WebSocket + local upsert keep messages live without interrupting media playback.
// 午夜自动刷新日期分割线标签（“今天”跳转为“昨天”）
let _midnightTimer=null;
function scheduleMidnightRefresh(){
  if(_midnightTimer) clearTimeout(_midnightTimer);
  const now=new Date(); const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,30,0); // 明日 00:00:30
  _midnightTimer=setTimeout(()=>{ try{ refreshDateDividers(); }catch{} scheduleMidnightRefresh(); }, Math.max(1000,next-now));
}
scheduleMidnightRefresh();
init();

/* ========== P2P 文件直传 (WebRTC) ========== */
let _p2pPC=null, _p2pChannel=null, _p2pFile=null, _p2pTargetUid=null, _p2pRole=null, _p2pOffset=0, _p2pReader=null, _p2pIncoming=null;

function wsSend(obj){ if(_ws&&_ws.readyState===WebSocket.OPEN){ _ws.send(JSON.stringify(obj)); return true } toast('连接未就绪，请稍候'); return false }

/* 发送方：点名片页"直传文件"按钮 */
let _p2pQueue=[],_p2pQueueIdx=0;
function p2pStartSend(uid){
  if(uid===(me&&me.id)){ toast('不能给自己传'); return }
  _p2pTargetUid=uid; _p2pRole='sender';
  const inp=document.createElement('input'); inp.type='file'; inp.setAttribute('multiple',''); inp.onchange=()=>{
    if(!inp.files.length) return;
    _p2pQueue=Array.from(inp.files).filter(f=>{
      if(f.size>5*1024*1024*1024){toast(`${f.name} 超过5GB，已跳过`);return false}
      return true;
    });
    if(!_p2pQueue.length) return;
    _p2pQueueIdx=0; _p2pFile=_p2pQueue[0];
    const fl=_p2pQueue.map(f=>({name:f.name,size:f.size}));
    if(!wsSend({type:'p2p_offer',to:uid,files:fl})){return}
    const label=fl.length>1?`${fl.length} 个文件（共 ${size(fl.reduce((s,f)=>s+f.size,0))}）`:`${fl[0].name}（${size(fl[0].size)}）`;
    showP2pDialog('waiting',`等待对方接受…`,label);
  };
  inp.click();
}

/* 接收方：收到 offer 弹窗确认（一次确认所有文件） */
function p2pHandleOffer(d){
  _p2pRole='receiver'; _p2pTargetUid=d.from;
  var files=d.files||[];
  var f0=files[0]||{};
  _p2pIncoming={files:files,currentIdx:0,fileName:f0.name||'',fileSize:f0.size||0,chunks:[],received:0};
  var dlg=$('#p2pReceiveDialog');
  if(files.length===1){
    $('#p2pReceiveName').textContent=files[0].name;
    $('#p2pReceiveSize').textContent=size(files[0].size);
  }else{
    $('#p2pReceiveName').textContent=files.length+' 个文件';
    $('#p2pReceiveSize').textContent=size(files.reduce(function(s,f){return s+f.size},0));
  }
  showDialog(dlg);
}
function p2pAccept(){
  closeDialog($('#p2pReceiveDialog'));
  wsSend({type:'p2p_accept',to:_p2pTargetUid});
  // 接收方创建 RTCPeerConnection，等对方的 SDP
  _p2pPC=new RTCPeerConnection();
  // 立即显示进度弹窗，不等 onopen
  const files=_p2pIncoming.files||[];
  const label=files.length>1?`（1/${files.length}）`:'';
  showP2pDialog('receiving',`等待接收…${label}`,`${_p2pIncoming.fileName}（${size(_p2pIncoming.fileSize)}）`);
  _p2pPC.ondatachannel=e=>{ _p2pChannel=e.channel; _p2pChannel.binaryType='arraybuffer'; _p2pChannel.onmessage=p2pOnChunk; _p2pChannel.onopen=()=>{
    const f=_p2pIncoming.files||[];
    const lbl=f.length>1?`（1/${f.length}）`:'';
    showP2pDialog('receiving',`接收中…${lbl}`,`${_p2pIncoming.fileName}（${size(_p2pIncoming.fileSize)}）`);
  }; _p2pChannel.onerror=()=>{}; _p2pChannel.onclose=p2pOnClose; };
  _p2pPC.onicecandidate=e=>{ if(e.candidate) wsSend({type:'p2p_ice',to:_p2pTargetUid,candidate:e.candidate.toJSON()}); };
  _p2pPC.onconnectionstatechange=()=>{ if(_p2pPC&&(_p2pPC.connectionState==='failed'||_p2pPC.connectionState==='disconnected')){ const txt=$('#p2pProgressText'); if(txt&&!txt.textContent.includes('完成')){txt.textContent='连接失败';setTimeout(()=>closeDialog($('#p2pTransferDialog')),2000);} } };
}
function p2pReject(){
  closeDialog($('#p2pReceiveDialog'));
  wsSend({type:'p2p_reject',to:_p2pTargetUid});
  p2pReset();
}

/* 统一信令处理 */
async function handleP2pSignal(d){
  if(d.type==='p2p_offer'){ p2pHandleOffer(d); return; }
  if(d.type==='p2p_reject'){ showP2pDialog('rejected','对方拒绝了传输',''); setTimeout(()=>closeDialog($('#p2pTransferDialog')),2000); p2pReset(); return; }
  if(d.type==='p2p_accept'){
    // 发送方收到 accept，创建 PC + datachannel + offer
    _p2pPC=new RTCPeerConnection();
    _p2pChannel=_p2pPC.createDataChannel('file',{ordered:true});
    _p2pChannel.binaryType='arraybuffer';
    _p2pChannel.onopen=()=>{ const idx=_p2pQueueIdx+1,total=_p2pQueue.length; const label=total>1?`（${idx}/${total}）`:''; showP2pDialog('sending',`发送中…${label}`,`${_p2pFile.name}（${size(_p2pFile.size)}）`); p2pSendAllFiles(); };
    _p2pChannel.onclose=p2pOnClose;
    _p2pPC.onicecandidate=e=>{ if(e.candidate) wsSend({type:'p2p_ice',to:_p2pTargetUid,candidate:e.candidate.toJSON()}); };
    const offer=await _p2pPC.createOffer(); await _p2pPC.setLocalDescription(offer);
    wsSend({type:'p2p_sdp',to:_p2pTargetUid,sdp:_p2pPC.localDescription});
    return;
  }
  if(d.type==='p2p_sdp'){
    if(!_p2pPC) return;
    await _p2pPC.setRemoteDescription(new RTCSessionDescription(d.sdp));
    if(_p2pRole==='receiver'){
      const ans=await _p2pPC.createAnswer(); await _p2pPC.setLocalDescription(ans);
      wsSend({type:'p2p_sdp',to:_p2pTargetUid,sdp:_p2pPC.localDescription});
    }
    return;
  }
  if(d.type==='p2p_ice'){
    if(_p2pPC) try{ await _p2pPC.addIceCandidate(new RTCIceCandidate(d.candidate)); }catch{}
    return;
  }
  if(d.type==='p2p_cancel'){ p2pReset(); closeDialog($('#p2pTransferDialog')); closeDialog($('#p2pReceiveDialog')); toast('对方取消了传输'); return; }
}

/* 发送方：通过同一条 DataChannel 依次发送所有文件 */
function p2pSendAllFiles(){
  _p2pQueueIdx=0;
  p2pSendNextFile();
}
function p2pSendNextFile(){
  if(!_p2pChannel||_p2pChannel.readyState!=='open') return;
  if(_p2pQueueIdx>=_p2pQueue.length){
    // 全部发完
    _p2pChannel.send(JSON.stringify({allDone:true}));
    const txt=$('#p2pProgressText'); if(txt) txt.textContent='全部完成';
    const bar=$('#p2pProgressBar'); if(bar) bar.style.width='100%';
    setTimeout(()=>closeDialog($('#p2pTransferDialog')),1500);
    _p2pChannel.close();
    return;
  }
  _p2pFile=_p2pQueue[_p2pQueueIdx];
  const idx=_p2pQueueIdx+1,total=_p2pQueue.length;
  const label=total>1?`（${idx}/${total}）`:'';
  // 发送文件开始标记
  _p2pChannel.send(JSON.stringify({start:true,name:_p2pFile.name,size:_p2pFile.size,index:_p2pQueueIdx,total}));
  // 更新标题
  if(_p2pRole==='sender') showP2pDialog('sending',`发送中…${label}`,`${_p2pFile.name}（${size(_p2pFile.size)}）`);
  _p2pOffset=0; _p2pReader=new FileReader();
  const CHUNK=64*1024;
  function readChunk(){
    if(!_p2pFile||!_p2pChannel||_p2pChannel.readyState!=='open') return;
    if(_p2pOffset>=_p2pFile.size){
      // 当前文件发完，发结束标记，继续下一个
      _p2pChannel.send(JSON.stringify({done:true,name:_p2pFile.name,size:_p2pFile.size}));
      _p2pQueueIdx++;
      setTimeout(p2pSendNextFile,300);
      return;
    }
    const slice=_p2pFile.slice(_p2pOffset,_p2pOffset+CHUNK);
    _p2pReader.onload=()=>{
      if(_p2pChannel&&_p2pChannel.readyState==='open'){
        if(_p2pChannel.bufferedAmount>4*1024*1024){
          setTimeout(()=>{_p2pOffset+=CHUNK;updateP2pProgress();readChunk()},20);
        }else{
          _p2pChannel.send(_p2pReader.result);
          _p2pOffset+=CHUNK;updateP2pProgress();readChunk();
        }
      }
    };
    _p2pReader.readAsArrayBuffer(slice);
  }
  readChunk();
}
function updateP2pProgress(){
  if(!_p2pFile) return;
  const pct=Math.min(100, Math.round(_p2pOffset/_p2pFile.size*100));
  const bar=$('#p2pProgressBar'); if(bar) bar.style.width=pct+'%';
  const txt=$('#p2pProgressText');
  if(txt){
    if(_p2pRole==='sender') txt.textContent=`${pct}% · ${size(_p2pOffset)}/${size(_p2pFile.size)}`;
    else txt.textContent=pct+'% · '+size((_p2pIncoming&&_p2pIncoming.received)||0)+'/'+size((_p2pIncoming&&_p2pIncoming.fileSize)||0);
  }
}

/* 接收方：收到分片 */
function p2pOnChunk(e){
  if(typeof e.data==='string'){
    const meta=JSON.parse(e.data);
    if(meta.start){
      // 新文件开始
      _p2pIncoming.chunks=[]; _p2pIncoming.received=0;
      _p2pIncoming.fileName=meta.name; _p2pIncoming.fileSize=meta.size;
      _p2pIncoming.currentIdx=meta.index; _p2pIncoming.total=meta.total;
      const label=meta.total>1?`（${meta.index+1}/${meta.total}）`:'';
      showP2pDialog('receiving',`接收中…${label}`,`${meta.name}（${size(meta.size)}）`);
      return;
    }
    if(meta.done){
      // 单个文件接收完成，组装下载
      const blob=new Blob(_p2pIncoming.chunks);
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=_p2pIncoming.fileName; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),10000);
      toast(`已接收：${_p2pIncoming.fileName}`);
      _p2pIncoming.chunks=[]; _p2pIncoming.received=0;
      return;
    }
    if(meta.allDone){
      // 全部完成
      const bar=$('#p2pProgressBar'); if(bar) bar.style.width='100%';
      const txt=$('#p2pProgressText'); if(txt) txt.textContent='全部完成';
      setTimeout(()=>{closeDialog($('#p2pTransferDialog'));toast('全部文件接收完成');},1500);
      return;
    }
  } else {
    _p2pIncoming.chunks.push(e.data);
    _p2pIncoming.received+=e.data.byteLength;
    updateP2pProgress();
  }
}

function p2pOnClose(){
  const dlg=$('#p2pTransferDialog');
  if(dlg.open){
    const txt=$('#p2pProgressText');
    if(txt && !txt.textContent.includes('完成')){
      txt.textContent='传输中断';
      setTimeout(()=>closeDialog(dlg),2000);
    }
  }
  _p2pPC=null; _p2pChannel=null;
}

function p2pCancel(){
  wsSend({type:'p2p_cancel', to:_p2pTargetUid});
  if(_p2pChannel){try{_p2pChannel.close()}catch(e){}}
  if(_p2pPC){try{_p2pPC.close()}catch(e){}}
  closeDialog($('#p2pTransferDialog'));
  p2pReset();
}
function p2pReset(){
  _p2pPC=null; _p2pChannel=null; _p2pFile=null; _p2pTargetUid=null; _p2pRole=null; _p2pOffset=0; _p2pReader=null; _p2pIncoming=null; _p2pQueue=[]; _p2pQueueIdx=0;
}

/* 传输进度弹窗 */
function showP2pDialog(mode, title, subtitle){
  let dlg=$('#p2pTransferDialog');
  if(!dlg) return;
  $('#p2pTransferTitle').textContent=title;
  $('#p2pTransferSub').textContent=subtitle||'';
  const bar=$('#p2pProgressBar'); if(bar) bar.style.width='0%';
  const txt=$('#p2pProgressText'); if(txt) txt.textContent='0%';
  const cancelBtn=$('#p2pTransferCancel'); if(cancelBtn){ cancelBtn.style.display = mode==='rejected' ? 'none' : ''; cancelBtn.textContent = mode==='waiting' ? '取消等待' : '取消传输'; }
  showDialog(dlg);
}