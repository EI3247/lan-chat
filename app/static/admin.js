const $=s=>document.querySelector(s);const fileStore=new Map();function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),1600)}
async function api(u,o={}){const r=await fetch(u,{headers:{'Content-Type':'application/json',...(o.headers||{})},...o});if(r.status===401){showLogin();throw Error('auth')}if(!r.ok)throw Error(await r.text());return r.json()}
function showLogin(){$('#adminLogin').classList.remove('hidden');$('#adminApp').classList.add('hidden')}function showApp(){$('#adminLogin').classList.add('hidden');$('#adminApp').classList.remove('hidden')}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
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
function openVideoBox(src,poster=''){
  let old=document.querySelector('.video-lightbox'); old?.remove();
  document.documentElement.classList.add('lightbox-open'); document.body.classList.add('lightbox-open');
  const box=document.createElement('div'); box.className='lightbox video-lightbox';
  box.innerHTML=`<button class="lightbox-close" type="button">×</button><video src="${src}" ${poster?`poster="${poster}"`:''} controls autoplay preload="metadata"></video>`;
  const close=()=>{box.remove(); document.documentElement.classList.remove('lightbox-open'); document.body.classList.remove('lightbox-open')};
  box.onclick=e=>{if(e.target===box||e.target.closest('.lightbox-close')) close()};
  document.addEventListener('keydown',function escKey(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',escKey)}});
  document.body.appendChild(box);
}

function size(n){const u=['B','KB','MB','GB','TB'];let i=0;n=Number(n||0);while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`}
async function copyText(txt){if(navigator.clipboard){await navigator.clipboard.writeText(String(txt||''));return}const ta=document.createElement('textarea');ta.value=String(txt||'');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.focus();ta.select();document.execCommand('copy');ta.remove()}
function fileKindIcon(kind){return kind==='image'?'🖼️':kind==='video'?'🎬':kind==='audio'?'🎵':kind==='text'?'📝':'📄'}
function fileInfoMarkup(f,rows,openUrl,downUrl){const kv=rows.map(([k,v])=>`<div class="info-row"><span>${esc(k)}</span><code>${esc(v||'')}</code></div>`).join('');return `<form method="dialog" class="dialog-card wide file-info-card" onsubmit="event.preventDefault()"><div class="file-info-head"><div class="file-info-badge">${fileKindIcon(f.kind)}</div><div class="file-info-title"><h2>${esc(f.name||'文件详情')}</h2><p>${esc(f.kind||'file')} · ${size(f.size||0)} · ${esc(f.uploader||'未知用户')}</p></div></div><div class="file-info-scroll"><div class="file-info-grid">${kv}</div></div><div class="dialog-actions"><button value="cancel" class="ghost">关闭</button><a class="ghost" href="${openUrl}" target="_blank" rel="noopener">打开</a><a class="primary" href="${downUrl}" download>下载</a></div></form>`}
function bindContainedScroll(el){if(!el||el.dataset.containedScrollBound)return;el.dataset.containedScrollBound='1';let lastY=0;el.addEventListener('touchstart',e=>{lastY=e.touches[0].clientY},{passive:true});el.addEventListener('touchmove',e=>{const y=e.touches[0].clientY,dy=y-lastY;lastY=y;const atTop=el.scrollTop<=0,atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1;if((atTop&&dy>0)||(atBottom&&dy<0))e.preventDefault();e.stopPropagation()},{passive:false});el.addEventListener('wheel',e=>{const atTop=el.scrollTop<=0,atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1;if((atTop&&e.deltaY<0)||(atBottom&&e.deltaY>0))e.preventDefault();e.stopPropagation()},{passive:false})}
function openFileInfo(fid){const f=fileStore.get(fid);if(!f){toast('文件信息读取失败');return}let old=document.querySelector('#fileInfoDialog');old?.remove();const rows=[['文件名',f.name],['类型',f.kind],['大小',size(f.size||0)],['MIME',f.mime||'未知'],['上传时间',f.created_at?new Date(f.created_at).toLocaleString():'未知'],['上传者',f.uploader||'未知用户'],['用户ID',f.user_id||''],['文件ID',f.id],['public_name',f.public_name||''],['外链/打开',location.origin+(f.public_view_url||f.public_url||f.page_url||'')],['下载地址',location.origin+(f.public_download_url||f.url||'')]].concat((f.public_preview_url||f.preview_url)?[['预览地址',location.origin+(f.public_preview_url||f.preview_url)]]:[]);const openUrl=f.admin_view_url||f.public_view_url||f.public_url||f.page_url||f.view_url||f.url,downUrl=f.admin_download_url||f.public_download_url||f.url;const dlg=document.createElement('dialog');dlg.id='fileInfoDialog';dlg.className='dialog file-info-dialog';dlg.innerHTML=fileInfoMarkup(f,rows,openUrl,downUrl);document.body.appendChild(dlg);dlg.querySelector('[value="cancel"]').onclick=e=>{e.preventDefault();closeDialog(dlg)};dlg.addEventListener('close',()=>{setModalLock();dlg.remove()});bindContainedScroll(dlg.querySelector('.file-info-scroll'));showDialog(dlg)}

async function init(){let s=await fetch('/api/admin/state').then(r=>r.json()); if(s.admin){showApp();loadAll()}else showLogin()}
$('#adminLoginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:$('#adminPassword').value})});showApp();loadAll()}catch{$('#adminError').textContent='密码不对'}}
$('#logoutAdmin').onclick=async()=>{await api('/api/admin/logout',{method:'POST'});showLogin()}
async function loadConfig(){try{const c=await api('/api/admin/settings');$('#newTitle').value=c.site_title||'';$('#newFilesTitle').value=c.files_title||'';$('#newMagic').value=c.admin_magic_code||'';$('#newUploadLimit').value=c.upload_size_limit||''}catch(e){}}
async function loadAll(){loadUsers(1);loadMsgs(1);loadFiles(1);loadConfig()}
function pagerHTML(prefix,total,page,per_page){const pages=Math.ceil(total/per_page)||1;return `<div class="pager"><button class="ghost pager-prev" data-pager-prefix="${prefix}" ${page<=1?'disabled':''}>上一页</button><span class="pager-info">${page}/${pages}页 · 共${total}条</span><button class="ghost pager-next" data-pager-prefix="${prefix}" ${page>=pages?'disabled':''}>下一页</button></div>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-pager-prefix]');if(!b||b.disabled)return;const p=b.dataset.pagerPrefix;if(b.classList.contains('pager-prev'))pageState[p]--;else if(b.classList.contains('pager-next'))pageState[p]++;if(p==='users')loadUsers(pageState.users);else if(p==='msgs')loadMsgs(pageState.msgs);else if(p==='files')loadFiles(pageState.files)});
let pageState={users:1,msgs:1,files:1};
let allUsers=[];
function renderUsers(list){return list.map(u=>`<div class="admin-row user-admin-row">
  <b>${esc(u.nickname)}</b>
  <div class="user-fields">
    <div><span>用户ID：</span><code>${esc(u.id)}</code></div>
    <div><span>身份码：</span><code>${esc(u.id_code||'无')}</code></div>
    <div><span>密码：</span><code>${u.has_secret?'🔑 已设':'— 未设'}</code></div>
    <div><span>最近 IP：</span><code>${esc(u.last_ip||'无')}</code></div>
    <div><span>创建时间：</span><code>${u.created_at?new Date(u.created_at).toLocaleString():'无'}</code></div>
    <div><span>最后活跃：</span><code>${u.last_seen_at?new Date(u.last_seen_at).toLocaleString():'无'}</code></div>
    <div><span>头像类型：</span><code>${esc(u.avatar_type||'')}</code></div>
    <div><span>头像值：</span><code>${esc(u.avatar_value||'')}</code></div>
  </div>
  <label>昵称：<input data-unick="${u.id}" value="${esc(u.nickname)}"></label>
  <div class="admin-actions"><button data-usave="${u.id}" class="ghost">保存昵称</button>${u.has_secret?`<button data-ureset="${u.id}" class="ghost">重置密码</button>`:''}<button data-udel="${u.id}" class="danger">删除用户</button></div>
</div>`).join('')||'<div class="admin-row">暂无用户</div>'}
function filterUsers(){loadUsers(1)}
async function loadUsers(page){page=page||pageState.users||1;pageState.users=page;let q=encodeURIComponent($('#userQ')?.value||'');let d=await api(`/api/admin/users?page=${page}&per_page=20${q?`&q=${q}`:''}`);allUsers=d.users||[];let html=renderUsers(allUsers);html+=pagerHTML('users',d.total||0,page,20);$('#users').innerHTML=html}
$('#userQ') && ($('#userQ').oninput=()=>{clearTimeout(window.userT);window.userT=setTimeout(filterUsers,200)});
$('#users').onclick=async e=>{let b=e.target.closest('button');if(!b)return;let id=b.dataset.usave||b.dataset.udel||b.dataset.ureset;if(b.dataset.usave){let nick=document.querySelector(`[data-unick="${id}"]`).value;await api(`/api/admin/users/${id}`,{method:'PATCH',body:JSON.stringify({nickname:nick})});toast('已保存')}if(b.dataset.ureset){if(confirm('重置该用户密码？重置后变为无密码，且无法在其它设备恢复（需先重新设置密码）。')){await api(`/api/admin/users/${id}/reset-secret`,{method:'POST'});toast('密码已重置');loadUsers(pageState.users)}}if(b.dataset.udel){if(confirm('确定删除这个用户身份？历史消息会保留，但显示为未知用户。')){await api(`/api/admin/users/${id}`,{method:'DELETE'});toast('用户已删除');loadUsers(pageState.users)}}}
function statusLabel(m){
  const vis = m.private ? '<span class="status-badge priv">🔒 私人</span>' : '<span class="status-badge grp">💬 群聊</span>';
  if(m.deleted) return vis + ' <span class="status-badge del">已删除</span>';
  if(m.withdrawn) return vis + ' <span class="status-badge wdn">已撤回</span>';
  return vis + ' <span class="status-badge ok">正常</span>';
}
function actionButtons(m){
  const save = `<button type="button" data-msave="${m.id}" class="btn-msg-act save">保存修改</button>`;
  const del = `<button type="button" data-mdel="${m.id}" class="btn-msg-act del">删除</button>`;
  if(m.deleted) return `<button type="button" data-mrestore="${m.id}" class="btn-msg-act restore">恢复显示</button>`;
  if(m.withdrawn) return `${save}<button type="button" data-mrestore="${m.id}" class="btn-msg-act restore">恢复显示</button>${del}`;
  return `${save}<button type="button" data-mwithdraw="${m.id}" class="btn-msg-act withdraw">撤回</button>${del}`;
}
function fileHint(m){
  if(!m.file) return '';
  let f=m.file; fileStore.set(f.id,f);
  const view=f.admin_view_url||f.public_view_url||f.view_url||f.url;
  const poster=f.admin_preview_url||f.public_preview_url||f.preview_url||'';
  const down=f.admin_download_url||f.public_download_url||f.url;
  
  let mediaHtml = '';
  if(f.kind==='image'){
    mediaHtml = `<div class="msg-file-thumb" data-img-open="${view}"><img src="${view}" alt="${esc(f.name)}" loading="lazy"><span class="zoom-tag">🔍</span></div>`;
  } else if(f.kind==='video'){
    mediaHtml = `<div class="msg-file-thumb video-thumb" data-video-open="${view}" data-poster="${poster}">${poster?`<img src="${poster}" alt="${esc(f.name)}" loading="lazy" onerror="this.style.display='none'">`:''}<span class="play-badge-mini">▶</span></div>`;
  } else if(f.kind==='audio'){
    mediaHtml = `<div class="msg-file-audio"><audio src="${view}" controls preload="metadata"></audio></div>`;
  }

  return `<div class="msg-file-card">
    <div class="msg-file-main">
      ${mediaHtml}
      <div class="msg-file-meta">
        <button type="button" class="file-name-trigger msg-file-name" data-file-info="${f.id}" title="${esc(f.name)}">${esc(f.name)}</button>
        <div class="msg-file-sub">${esc(f.kind||'file')} · ${size(f.size||0)}</div>
      </div>
    </div>
    <div class="msg-file-actions">
      <a href="${view}" target="_blank" rel="noopener" class="file-link-btn">查看</a>
      <a href="${down}" download class="file-link-btn">下载</a>
      ${f.kind==='text'?`<button type="button" data-text-file="${f.id}" class="file-link-btn text-edit">编辑文本</button>`:''}
    </div>
  </div>`;
}
function renderSingleMsg(m){
  const timeStr = m.created_at ? new Date(m.created_at).toLocaleString([], {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '未知时间';
  const isDeleted = !!m.deleted;
  const isWithdrawn = !!m.withdrawn;
  const cardCls = 'msg-admin-card' + (isDeleted ? ' is-deleted' : '') + (isWithdrawn ? ' is-withdrawn' : '');

  return `<div class="${cardCls}" data-row="${m.id}">
    <div class="msg-card-header">
      <div class="msg-card-user">
        <label class="msg-checkbox-label">
          <input type="checkbox" class="msgSelect" value="${m.id}">
          <span class="custom-checkbox"></span>
        </label>
        <span class="msg-author-name">${esc(m.user?.nickname || '未知用户')}</span>
        <div class="msg-status-group">${statusLabel(m)}</div>
      </div>
      <div class="msg-card-time">${esc(timeStr)}</div>
    </div>
    <div class="msg-card-body">
      ${m.content ? `<textarea class="msg-content-textarea" data-mtext="${m.id}" placeholder="消息内容">${esc(m.content)}</textarea>` : `<textarea class="msg-content-textarea empty" data-mtext="${m.id}" placeholder="（纯文件无文字，可输入内容后保存）"></textarea>`}
      ${fileHint(m)}
    </div>
    <div class="msg-card-footer">
      <div class="msg-id-tag">ID: <code>${m.id.slice(0,8)}</code></div>
      <div class="msg-action-btns">${actionButtons(m)}</div>
    </div>
  </div>`;
}
async function loadMsgs(page){
  page=page||pageState.msgs||1;
  pageState.msgs=page;
  let q=encodeURIComponent($('#msgQ')?.value||'');
  let t=encodeURIComponent($('#msgType')?.value||'');
  let d=await api(`/api/admin/messages?q=${q}&type=${t}&page=${page}&per_page=30`);
  const msgs = d.messages || [];
  const listHtml = msgs.length ? msgs.map(renderSingleMsg).join('') : '<div class="admin-empty-state">💬 暂无符合条件的消息</div>';
  $('#adminMessages').innerHTML = `<div class="admin-batch msg-batch-bar">
    <div class="batch-left">
      <label class="batch-select-all"><input id="selectAllMsgs" type="checkbox"> 全选本页</label>
      <span class="batch-count-tag" id="msgSelCount"></span>
    </div>
    <div class="batch-right">
      <button data-batch="withdraw" class="batch-btn ghost">批量撤回</button>
      <button data-batch="restore" class="batch-btn ghost">批量恢复</button>
      <button data-batch="delete" class="batch-btn danger">批量删除</button>
    </div>
  </div>` + listHtml + pagerHTML('msgs', d.total || 0, page, 30);
  updateMsgSelCount();
}
function updateMsgSelCount(){
  const n = selectedIds().length;
  const el = $('#msgSelCount');
  if(el) el.textContent = n ? `已选 ${n} 条` : '';
}
$('#loadMessages').onclick=()=>loadMsgs(1);
$('#msgType') && ($('#msgType').onchange=()=>loadMsgs(1));
$('#msgQ') && ($('#msgQ').oninput=()=>{clearTimeout(window.msgT);window.msgT=setTimeout(()=>loadMsgs(1),300)});
function selectedIds(){return [...document.querySelectorAll('.msgSelect:checked')].map(x=>x.value)}
$('#adminMessages').onclick=async e=>{
  if(e.target?.id==='selectAllMsgs'){
    document.querySelectorAll('.msgSelect').forEach(x=>{
      x.checked=e.target.checked;
      x.closest('.msg-admin-card')?.classList.toggle('msg-selected', e.target.checked);
    });
    updateMsgSelCount();
    return;
  }
  if(e.target?.classList?.contains('msgSelect')){
    e.target.closest('.msg-admin-card')?.classList.toggle('msg-selected', e.target.checked);
    updateMsgSelCount();
    return;
  }if(e.target?.id==='selectAllMsgs'){document.querySelectorAll('.msgSelect').forEach(x=>x.checked=e.target.checked);return} let b=e.target.closest('button'); if(!b)return; if(b.dataset.batch){let ids=selectedIds(); if(!ids.length){toast('先勾选消息');return} if(b.dataset.batch==='delete'&&!confirm(`确定删除选中的 ${ids.length} 条消息？`))return; await api('/api/admin/messages/batch',{method:'POST',body:JSON.stringify({ids,action:b.dataset.batch})}); toast('批量操作完成'); loadMsgs(pageState.msgs); return} let id=b.dataset.msave||b.dataset.mwithdraw||b.dataset.mrestore||b.dataset.mdel; if(b.dataset.msave){await api(`/api/admin/messages/${id}`,{method:'PATCH',body:JSON.stringify({content:document.querySelector(`[data-mtext="${id}"]`).value})}); toast('已保存')} if(b.dataset.mwithdraw){await api(`/api/admin/messages/${id}`,{method:'PATCH',body:JSON.stringify({withdrawn:1})}); toast('已撤回')} if(b.dataset.mrestore){await api(`/api/admin/messages/${id}`,{method:'PATCH',body:JSON.stringify({withdrawn:0,deleted:0})}); toast('已恢复显示')} if(b.dataset.mdel&&confirm('确定删除这条消息？删除后普通聊天不显示。')){await api(`/api/admin/messages/${id}`,{method:'PATCH',body:JSON.stringify({deleted:1})}); toast('已删除')} loadMsgs(pageState.msgs)}
$('#saveSettings').onclick=async()=>{await api('/api/admin/settings',{method:'PATCH',body:JSON.stringify({access_password:$('#newAccess').value,admin_password:$('#newAdmin').value,site_title:$('#newTitle').value,files_title:$('#newFilesTitle').value,admin_magic_code:$('#newMagic').value,upload_size_limit:$('#newUploadLimit').value})});toast('配置已保存，密码变更会让旧登录失效');loadConfig()}
$('#clearMessages').onclick=async()=>{if(confirm('确定清空聊天记录？')){await api('/api/admin/clear-messages',{method:'POST'});toast('已清空');loadMsgs(1)}}
init();

function fileIcon(k){return k==='image'?'🖼️':k==='video'?'🎬':k==='audio'?'🎵':k==='text'?'📝':'📄'}
function filePreview(f){const view=f.admin_view_url||f.public_view_url||f.view_url||f.url, poster=f.admin_preview_url||f.public_preview_url||f.preview_url||'';if(f.kind==='image')return `<button type="button" class="admin-media-preview preview-btn" data-img-open="${view}"><img src="${view}" loading="lazy"></button>`;if(f.kind==='video')return `<button type="button" class="admin-media-preview preview-btn video-thumb ${poster?'':'no-poster'}" data-video-open="${view}" data-poster="${poster}">${poster?`<img src="${poster}" alt="${esc(f.name)}" loading="lazy" onerror="this.style.display='none'">`:''}<span class="video-placeholder">🎬</span><span class="play-badge">▶</span></button>`;if(f.kind==='audio')return `<div class="admin-media-preview audio"><audio src="${view}" controls preload="metadata"></audio></div>`;if(f.kind==='text')return `<div class="admin-media-preview text-preview">📝</div>`;return ''}
let modalScrollY=0;
function setModalLock(){ const open=!!document.querySelector('dialog[open]'); if(open){ if(!document.body.classList.contains('modal-open')) modalScrollY=window.scrollY||document.documentElement.scrollTop||0; document.documentElement.classList.add('modal-open'); document.body.classList.add('modal-open'); document.body.style.top=`-${modalScrollY}px`; } else { document.documentElement.classList.remove('modal-open'); document.body.classList.remove('modal-open'); document.body.style.top=''; if(modalScrollY) window.scrollTo(0,modalScrollY); modalScrollY=0; } }
function showDialog(d){ if(!d) return; d.showModal(); setModalLock(); bindStableEditorScroll(d) }
function closeDialog(d){ if(!d) return; d.close(); setModalLock() }
function bindStableEditorScroll(root=document){ root.querySelectorAll?.('#textFileContent,#composeText').forEach(el=>{ if(el.dataset.stableScrollBound)return; el.dataset.stableScrollBound='1'; let lastX=0,lastY=0; el.addEventListener('touchstart',e=>{lastX=e.touches[0].clientX;lastY=e.touches[0].clientY},{passive:true}); el.addEventListener('touchmove',e=>{ const t=e.touches[0], x=t.clientX, y=t.clientY, dx=x-lastX, dy=y-lastY; lastX=x; lastY=y; const horizontal=Math.abs(dx)>Math.abs(dy); const atLeft=el.scrollLeft<=0, atRight=el.scrollLeft+el.clientWidth>=el.scrollWidth-1; const atTop=el.scrollTop<=0, atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1; if(horizontal){ if((atLeft&&dx>0)||(atRight&&dx<0)) e.preventDefault(); e.stopPropagation(); return; } if((atTop&&dy>0)||(atBottom&&dy<0)) e.preventDefault(); e.stopPropagation(); },{passive:false}); el.addEventListener('wheel',e=>{ const horizontal=Math.abs(e.deltaX)>Math.abs(e.deltaY); const atLeft=el.scrollLeft<=0, atRight=el.scrollLeft+el.clientWidth>=el.scrollWidth-1; const atTop=el.scrollTop<=0, atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1; if(horizontal){ if((atLeft&&e.deltaX<0)||(atRight&&e.deltaX>0)) e.preventDefault(); e.stopPropagation(); return; } if((atTop&&e.deltaY<0)||(atBottom&&e.deltaY>0)) e.preventDefault(); e.stopPropagation(); },{passive:false}); }); }

function setTextFileMode(mode){const dlg=$('#textFileDialog'),ta=$('#textFileContent');if(!dlg||!ta)return;const edit=mode==='edit';dlg.dataset.mode=edit?'edit':'view';ta.readOnly=!edit;ta.classList.toggle('readonly',!edit);$('#textFileTitle')?.classList.toggle('editing-title',edit);document.querySelectorAll('[data-text-view]').forEach(x=>x.classList.toggle('hidden',edit));document.querySelectorAll('[data-text-edit]').forEach(x=>x.classList.toggle('hidden',!edit));/* 不自动聚焦，避免移动端键盘/视口导致文本编辑页上下跳动 */}
async function openTextFile(fid){try{const d=await api(`/api/file/${fid}/text`);const dlg=$('#textFileDialog'),ta=$('#textFileContent');dlg.dataset.fid=fid;dlg.dataset.original=d.content;$('#textFileTitle').textContent=d.name;$('#textFileMeta').textContent=`${d.size} B · ${d.encoding}`;ta.value=d.content;setTextFileMode('view');showDialog(dlg)}catch(e){toast('文本文件打开失败：可能不是文本类型')}}
function bindTextFileDialog(afterSave){document.querySelectorAll('.dialog button[value="cancel"]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();closeDialog(btn.closest('dialog'))}));document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',setModalLock));$('#closeTextFile')&&($('#closeTextFile').onclick=()=>closeDialog($('#textFileDialog')));$('#editTextFile')&&($('#editTextFile').onclick=()=>setTextFileMode('edit'));$('#cancelTextFile')&&($('#cancelTextFile').onclick=()=>{const dlg=$('#textFileDialog'),ta=$('#textFileContent');if(!confirm('确定放弃本次修改？'))return;ta.value=dlg.dataset.original||'';setTextFileMode('view')});$('#saveTextFile')&&($('#saveTextFile').onclick=async()=>{if(!confirm('确定保存修改？'))return;const dlg=$('#textFileDialog'),fid=dlg.dataset.fid,ta=$('#textFileContent');await api(`/api/file/${fid}/text`,{method:'PATCH',body:JSON.stringify({content:ta.value})});dlg.dataset.original=ta.value;toast('文本文件已保存');setTextFileMode('view');afterSave&&afterSave()})}

async function loadFiles(page){page=page||pageState.files||1;pageState.files=page;let q=encodeURIComponent($('#fileQ')?.value||''), kind=encodeURIComponent($('#fileKind')?.value||'');let d=await api(`/api/admin/files?q=${q}&kind=${kind}&page=${page}&per_page=30`);(d.files||[]).forEach(f=>fileStore.set(f.id,f));$('#adminFiles').innerHTML=`<div class="admin-batch"><label><input id="selectAllFiles" type="checkbox"> 全选</label><span class="batch-count" id="fileSelCount"></span><button data-fbatch="delete" class="danger">批量删除</button></div>`+(d.files||[]).map(f=>`<div class="file-item admin-file-item"><label class="file-check"><input type="checkbox" class="fileSelect" value="${f.id}"> 选择</label>${filePreview(f)}<div class="file-card"><div class="file-icon">${fileIcon(f.kind)}</div><div class="file-info"><button type="button" class="fn file-name-trigger" data-file-info="${f.id}" title="${esc(f.name)}">${esc(f.name)}</button><div class="fs">状态：${f.private?'<span class="status priv-text">🔒私人</span>':'<span class="status grp-text">💬群聊</span>'}</div><div class="fs">类型：${esc(f.kind)} · ${f.size} B · 上传者：${esc(f.uploader||'未知')}</div><div class="fs">时间：${new Date(f.created_at).toLocaleString()}</div><div class="fs">MIME：${esc(f.mime||'')}</div></div></div><div class="actions"><a href="${f.admin_download_url||f.public_download_url||f.url}" download>下载</a><a href="${f.admin_view_url||f.page_url||f.view_url||f.url}" target="_blank" rel="noopener">打开</a>${f.kind==='text'?`<button type="button" data-text-file="${f.id}">在线查看/编辑</button>`:''}<select data-kind="${f.id}"><option value="">改类型</option><option value="text"${f.kind==='text'?' selected':''}>文本</option><option value="image"${f.kind==='image'?' selected':''}>图片</option><option value="video"${f.kind==='video'?' selected':''}>视频</option><option value="audio"${f.kind==='audio'?' selected':''}>音频</option><option value="file"${f.kind==='file'?' selected':''}>普通文件</option></select><button class="ghost" data-kind-save="${f.id}">保存类型</button><button class="danger" data-file-del="${f.id}">删除文件</button></div></div>`).join('')+pagerHTML('files',d.total||0,page,30)}
function selectedFileIds(){return [...document.querySelectorAll('.fileSelect:checked')].map(x=>x.value)}
function updateFileSelCount(){const n=selectedFileIds().length,el=$('#fileSelCount');if(el)el.textContent=n?`已选 ${n}`:''}
$('#adminFiles').onclick=async e=>{
  if(e.target?.id==='selectAllFiles'){document.querySelectorAll('.fileSelect').forEach(x=>{x.checked=e.target.checked;x.closest('.admin-file-item')?.classList.toggle('file-selected',e.target.checked)});updateFileSelCount();return}
  if(e.target?.classList?.contains('fileSelect')){e.target.closest('.admin-file-item')?.classList.toggle('file-selected',e.target.checked);updateFileSelCount();return}
  const fb=e.target.closest('[data-fbatch]');
  if(fb){const ids=selectedFileIds();if(!ids.length){toast('先勾选文件');return}const total=document.querySelectorAll('.fileSelect').length;const allSel=ids.length>=total&&total>0;const word=allSel?'全部删除':'删除';const ans=prompt(`即将删除 ${ids.length} 个文件及对应消息${allSel?'（已选中全部）':''}。\n此操作会隐藏这些文件（可在后台息复）。\n请输入“${word}”确认：`);if(ans!==word){toast('已取消');return}await api('/api/admin/files/batch-delete',{method:'POST',body:JSON.stringify({ids})});toast(`已删除 ${ids.length} 个文件`);loadFiles(pageState.files);loadMsgs(pageState.msgs);return}
  const ks=e.target.closest('[data-kind-save]');if(ks){const sel=document.querySelector(`[data-kind="${ks.dataset.kindSave}"]`);if(!sel||!sel.value){toast('先选择类型');return}await api(`/api/admin/files/${ks.dataset.kindSave}/kind`,{method:'PATCH',body:JSON.stringify({kind:sel.value})});toast('类型已保存');loadFiles(pageState.files);loadMsgs(pageState.msgs);return}
  const del=e.target.closest('[data-file-del]');if(del){if(!confirm('确定删除这个文件及对应消息？'))return;await api(`/api/admin/files/${del.dataset.fileDel}`,{method:'DELETE'});toast('文件已删除');loadFiles(pageState.files);loadMsgs(pageState.msgs);return}
}
$('#loadFiles') && ($('#loadFiles').onclick=()=>loadFiles(1));$('#fileQ') && ($('#fileQ').oninput=()=>clearTimeout(window.fileT)&&(window.fileT=setTimeout(()=>loadFiles(1),300)));$('#fileKind') && ($('#fileKind').onchange=()=>loadFiles(1));
document.addEventListener('click',async e=>{let fi=e.target.closest('[data-file-info]');if(fi){e.preventDefault();openFileInfo(fi.dataset.fileInfo);return}let img=e.target.closest('[data-img-open]');if(img){e.preventDefault();openLightboxFromImg(img, document);return}let vid=e.target.closest('[data-video-open]');if(vid){e.preventDefault();openVideoBox(vid.dataset.videoOpen,vid.dataset.poster||'');return}let tf=e.target.closest('[data-text-file]');if(tf){e.preventDefault();openTextFile(tf.dataset.textFile);return}});
bindTextFileDialog(()=>{loadFiles(pageState.files);loadMsgs(pageState.msgs)});
