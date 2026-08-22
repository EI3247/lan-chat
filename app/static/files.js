const $=s=>document.querySelector(s); const fileStore=new Map(); function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),1600)}
let fileMode=(localStorage.getItem('lanchat_mode')==='private')?'private':'public';
function updateFileModeUI(){const priv=fileMode==='private'; const seg=$('#fileModeSeg'); if(seg){seg.querySelectorAll('[data-mode-opt]').forEach(b=>b.classList.toggle('active',b.dataset.modeOpt===fileMode));} document.body.classList.toggle('private-mode',priv);}
function size(n){const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function preview(f){
  if(f.kind==='image') return `<div class="file-preview"><img class="zoomable" data-full="${f.public_view_url||f.view_url||f.url}" src="${f.preview_url||f.public_view_url||f.view_url||f.url}" loading="lazy" alt="${esc(f.name)}"></div>`;
  if(f.kind==='video'){const poster=f.public_preview_url||f.preview_url||'';return `<button type="button" class="file-preview video-thumb ${poster?'':'no-poster'}" data-video-open="${f.public_view_url||f.view_url||f.url}" data-poster="${poster}" aria-label="播放视频">${poster?`<img src="${poster}" alt="${esc(f.name)}" loading="lazy" onerror="this.style.display='none'">`:''}<span class="video-placeholder">🎬</span><span class="play-badge">▶</span></button>`;}
  if(f.kind==='audio') return `<div class="file-preview"><audio src="${f.public_view_url||f.view_url||f.url}" controls preload="metadata"></audio></div>`;
  if(f.kind==='text') return ''; // 文本/普通文件无预览块（非媒体类型不显示多余 emoji）
  return '';
}
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
  document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',esc)}});
  document.body.appendChild(box);
}

function fileRows(f){return [['文件名',f.name],['类型',f.kind],['大小',size(f.size||0)],['MIME',f.mime||'未知'],['上传时间',f.created_at?new Date(f.created_at).toLocaleString():'未知'],['上传者',f.uploader||'未知用户'],['文件ID',f.id],['public_name',f.public_name||''],['外链/打开',location.origin+(f.public_view_url||f.public_url||f.page_url||'')],['下载地址',location.origin+(f.public_download_url||f.url||'')]].concat((f.public_preview_url||f.preview_url)?[['预览地址',location.origin+(f.public_preview_url||f.preview_url)]]:[])}
async function copyText(txt){if(navigator.clipboard){await navigator.clipboard.writeText(String(txt||''));return}const ta=document.createElement('textarea');ta.value=String(txt||'');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.focus();ta.select();document.execCommand('copy');ta.remove()}
function fileKindIcon(kind){return kind==='image'?'🖼️':kind==='video'?'🎬':kind==='audio'?'🎵':kind==='text'?'📝':'📄'}
function fileInfoMarkup(f,rows,openUrl,downUrl){const kv=rows.map(([k,v])=>`<div class="info-row"><span>${esc(k)}</span><code>${esc(v||'')}</code></div>`).join('');return `<form method="dialog" class="dialog-card wide file-info-card" onsubmit="event.preventDefault()"><div class="file-info-head"><div class="file-info-badge">${fileKindIcon(f.kind)}</div><div class="file-info-title"><h2>${esc(f.name||'文件详情')}</h2><p>${esc(f.kind||'file')} · ${size(f.size||0)} · ${esc(f.uploader||'未知用户')}</p></div></div><div class="file-info-scroll"><div class="file-info-grid">${kv}</div></div><div class="dialog-actions"><button value="cancel" class="ghost">关闭</button><a class="ghost" href="${openUrl}" target="_blank" rel="noopener">打开</a><a class="primary" href="${downUrl}" download>下载</a></div></form>`}
function bindContainedScroll(el){if(!el||el.dataset.containedScrollBound)return;el.dataset.containedScrollBound='1';let lastY=0;el.addEventListener('touchstart',e=>{lastY=e.touches[0].clientY},{passive:true});el.addEventListener('touchmove',e=>{const y=e.touches[0].clientY,dy=y-lastY;lastY=y;const atTop=el.scrollTop<=0,atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1;if((atTop&&dy>0)||(atBottom&&dy<0))e.preventDefault();e.stopPropagation()},{passive:false});el.addEventListener('wheel',e=>{const atTop=el.scrollTop<=0,atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1;if((atTop&&e.deltaY<0)||(atBottom&&e.deltaY>0))e.preventDefault();e.stopPropagation()},{passive:false})}
function openFileInfo(fid){const f=fileStore.get(fid);if(!f){toast('文件信息读取失败');return}let old=document.querySelector('#fileInfoDialog');old?.remove();const rows=fileRows(f);const openUrl=f.public_view_url||f.public_url||f.page_url||f.view_url||f.url,downUrl=f.public_download_url||f.url;const dlg=document.createElement('dialog');dlg.id='fileInfoDialog';dlg.className='dialog file-info-dialog';dlg.innerHTML=fileInfoMarkup(f,rows,openUrl,downUrl);document.body.appendChild(dlg);dlg.querySelector('[value="cancel"]').onclick=e=>{e.preventDefault();closeDialog(dlg)};dlg.addEventListener('close',()=>{setModalLock();dlg.remove()});bindContainedScroll(dlg.querySelector('.file-info-scroll'));showDialog(dlg)}

async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}); if(r.status===401){location.href='/'; throw new Error('auth')} if(!r.ok) throw new Error(await r.text()); return r.json()}
let modalScrollY=0;
function setModalLock(){ const open=!!document.querySelector('dialog[open]'); if(open){ if(!document.body.classList.contains('modal-open')) modalScrollY=window.scrollY||document.documentElement.scrollTop||0; document.documentElement.classList.add('modal-open'); document.body.classList.add('modal-open'); document.body.style.top=`-${modalScrollY}px`; } else { document.documentElement.classList.remove('modal-open'); document.body.classList.remove('modal-open'); document.body.style.top=''; if(modalScrollY) window.scrollTo(0,modalScrollY); modalScrollY=0; } }
function showDialog(d){ if(!d) return; d.showModal(); setModalLock(); bindStableEditorScroll(d) }
function closeDialog(d){ if(!d) return; d.close(); setModalLock() }
function bindStableEditorScroll(root=document){ root.querySelectorAll?.('#textFileContent,#composeText').forEach(el=>{ if(el.dataset.stableScrollBound)return; el.dataset.stableScrollBound='1'; let lastX=0,lastY=0; el.addEventListener('touchstart',e=>{lastX=e.touches[0].clientX;lastY=e.touches[0].clientY},{passive:true}); el.addEventListener('touchmove',e=>{ const t=e.touches[0], x=t.clientX, y=t.clientY, dx=x-lastX, dy=y-lastY; lastX=x; lastY=y; const horizontal=Math.abs(dx)>Math.abs(dy); const atLeft=el.scrollLeft<=0, atRight=el.scrollLeft+el.clientWidth>=el.scrollWidth-1; const atTop=el.scrollTop<=0, atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1; if(horizontal){ if((atLeft&&dx>0)||(atRight&&dx<0)) e.preventDefault(); e.stopPropagation(); return; } if((atTop&&dy>0)||(atBottom&&dy<0)) e.preventDefault(); e.stopPropagation(); },{passive:false}); el.addEventListener('wheel',e=>{ const horizontal=Math.abs(e.deltaX)>Math.abs(e.deltaY); const atLeft=el.scrollLeft<=0, atRight=el.scrollLeft+el.clientWidth>=el.scrollWidth-1; const atTop=el.scrollTop<=0, atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-1; if(horizontal){ if((atLeft&&e.deltaX<0)||(atRight&&e.deltaX>0)) e.preventDefault(); e.stopPropagation(); return; } if((atTop&&e.deltaY<0)||(atBottom&&e.deltaY>0)) e.preventDefault(); e.stopPropagation(); },{passive:false}); }); }

function setTextFileMode(mode){const dlg=$('#textFileDialog'),ta=$('#textFileContent');if(!dlg||!ta)return;const edit=mode==='edit';dlg.dataset.mode=edit?'edit':'view';ta.readOnly=!edit;ta.classList.toggle('readonly',!edit);$('#textFileTitle')?.classList.toggle('editing-title',edit);document.querySelectorAll('[data-text-view]').forEach(x=>{if(x.id==='editTextFile'&&dlg.dataset.isOwner==='0'){x.classList.add('hidden')}else{x.classList.toggle('hidden',edit)}});document.querySelectorAll('[data-text-edit]').forEach(x=>x.classList.toggle('hidden',!edit));/* 不自动聚焦，避免移动端键盘/视口导致文本编辑页上下跳动 */}
async function openTextFile(fid){try{const d=await api(`/api/file/${fid}/text`);const dlg=$('#textFileDialog'),ta=$('#textFileContent');dlg.dataset.fid=fid;dlg.dataset.isOwner=d.is_owner?'1':'0';dlg.dataset.original=d.content;$('#textFileTitle').textContent=d.name;$('#textFileMeta').textContent=`${size(d.size)} · ${d.encoding}`;ta.value=d.content;setTextFileMode('view');showDialog(dlg)}catch(e){toast('文本文件打开失败')}}
function bindTextFileDialog(afterSave){document.querySelectorAll('.dialog button[value="cancel"]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();closeDialog(btn.closest('dialog'))}));document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',setModalLock));$('#closeTextFile')&&($('#closeTextFile').onclick=()=>closeDialog($('#textFileDialog')));$('#editTextFile')&&($('#editTextFile').onclick=()=>setTextFileMode('edit'));$('#cancelTextFile')&&($('#cancelTextFile').onclick=()=>{const dlg=$('#textFileDialog'),ta=$('#textFileContent');if(!confirm('确定放弃本次修改？'))return;ta.value=dlg.dataset.original||'';setTextFileMode('view')});$('#saveTextFile')&&($('#saveTextFile').onclick=async()=>{if(!confirm('确定保存修改？'))return;const dlg=$('#textFileDialog'),fid=dlg.dataset.fid,ta=$('#textFileContent');await api(`/api/file/${fid}/text`,{method:'PATCH',body:JSON.stringify({content:ta.value})});dlg.dataset.original=ta.value;toast('文本文件已保存');setTextFileMode('view');afterSave&&afterSave()})}

async function load(){let q=encodeURIComponent($('#q').value), kind=encodeURIComponent($('#kind').value); let r=await fetch(`/api/files?q=${q}&kind=${kind}&scope=${fileMode}`); if(r.status===401){location.href='/';return} let d=await r.json(); fileStore.clear(); (d.files||[]).forEach(f=>fileStore.set(f.id,f)); $('#files').innerHTML=d.files.map(f=>{let own=f.is_owner&&f.msg_id;let more=own?(fileMode==='private'?'<button data-fset-public="'+f.msg_id+'">设为公开</button>':'<button data-fset-private="'+f.msg_id+'">设为私人</button><button class="danger" data-fwithdraw="'+f.msg_id+'">撤回</button>'):'';let moreBtn=own?'<button class="ghost file-more-btn" data-file-menu="'+f.id+'">⋯</button>':'';let moreMenu=own?'<div class="file-menu" hidden data-menu-for="'+f.id+'">'+more+'</div>':'';return `<div class="file-item">${preview(f)}<div class="file-card"><div class="file-icon">${f.kind==='image'?'🖼️':f.kind==='video'?'🎬':f.kind==='audio'?'🎵':f.kind==='text'?'📝':'📄'}</div><div class="file-info"><button type="button" class="fn file-name-trigger" data-file-info="${f.id}" title="${esc(f.name)}">${esc(f.name)}</button><div class="fs">${esc(f.kind)} · ${size(f.size)} · ${esc(f.uploader||'')}</div><div class="fs">${new Date(f.created_at).toLocaleString()}</div></div></div><div class="actions"><a href="${f.public_download_url||f.url}" download>下载</a><a href="${f.page_url||f.view_url||f.url}" target="_blank" rel="noopener">打开</a>${(!f.quickdrop&&f.kind==='text')?`<button data-text-file="${f.id}">${f.is_owner?'在线编辑':'在线查看'}</button>`:''}${moreBtn}</div>${moreMenu}</div>`}).join('')||(fileMode==='private'?'<div class="panel glass">私人网盘暂无文件（只有你在私人模式下上传的文件才会出现在这里）</div>':'<div class="panel glass">暂无文件</div>')}
$('#files').onclick=e=>{let fi=e.target.closest('[data-file-info]');if(fi){openFileInfo(fi.dataset.fileInfo);return}let v=e.target.closest('[data-video-open]'); if(v){openVideoBox(v.dataset.videoOpen,v.dataset.poster||''); return} let img=e.target.closest('img.zoomable'); if(img){openLightboxFromImg(img, $('#files')); return} let fm=e.target.closest('[data-file-menu]'); if(fm){e.stopPropagation(); const m=document.querySelector(`.file-menu[data-menu-for="${fm.dataset.fileMenu}"]`); if(m){const willOpen=m.hidden; document.querySelectorAll('.file-menu').forEach(mm=>{if(mm!==m)mm.hidden=true}); m.hidden=!willOpen} return} let tf=e.target.closest('[data-text-file]'); if(tf){openTextFile(tf.dataset.textFile); return} let fw=e.target.closest('[data-fwithdraw]'); if(fw){if(!confirm('确定撤回？该文件将从网盘和聊天室移除。'))return; api(`/api/messages/${fw.dataset.fwithdraw}/withdraw`,{method:'POST'}).then(()=>{toast('已撤回');load()}).catch(()=>toast('撤回失败')); return} let fp=e.target.closest('[data-fset-private]'); if(fp){if(!confirm('设为私人后仅自己可见，确定？'))return; api(`/api/messages/${fp.dataset.fsetPrivate}/visibility`,{method:'POST',body:JSON.stringify({private:true})}).then(()=>{toast('已设为私人');load()}).catch(()=>toast('操作失败')); return} let fpub=e.target.closest('[data-fset-public]'); if(fpub){if(!confirm('设为公开后所有人可见，确定？'))return; api(`/api/messages/${fpub.dataset.fsetPublic}/visibility`,{method:'POST',body:JSON.stringify({private:false})}).then(()=>{toast('已设为公开');load()}).catch(()=>toast('操作失败')); return}};
$('#refresh').onclick=load; $('#q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(window.t);load()}}); $('#q').oninput=()=>clearTimeout(window.t)&& (window.t=setTimeout(load,300)); $('#kind').onchange=load;
$('#fileModeSeg') && $('#fileModeSeg').addEventListener('click',e=>{const b=e.target.closest('[data-mode-opt]'); if(!b)return; e.preventDefault(); fileMode=b.dataset.modeOpt==='private'?'private':'public'; localStorage.setItem('lanchat_mode',fileMode); updateFileModeUI(); load();});
updateFileModeUI(); load();
document.addEventListener('click',e=>{if(!e.target.closest('.file-more-btn')&&!e.target.closest('.file-menu'))document.querySelectorAll('.file-menu').forEach(m=>m.hidden=true)});
bindTextFileDialog(()=>load());

// 一键到底浮动按钮（文件页：window 滚动）：手指下→上（朝底滑）才渐变出现，上→下不出；不常驻，停一会自动淡出。点击模拟手快速滑到底。
(function(){const fab=document.querySelector('#filesScrollBottom');if(!fab)return;
  let lastY=window.scrollY, hideT=null;
  function atBottom(){return window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-140}
  function canScroll(){return document.documentElement.scrollHeight>window.innerHeight+40}
  function hide(){fab.classList.remove('show')}
  function show(){fab.classList.add('show');clearTimeout(hideT);hideT=setTimeout(hide,2000)}
  function onScroll(){const y=window.scrollY,d=y-lastY;lastY=y; if(atBottom()||!canScroll()){hide();return} if(d>2)show(); else if(d<-2)hide();}
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',()=>{if(atBottom()||!canScroll())hide()});
  function flick(){const start=window.scrollY,target=document.documentElement.scrollHeight,dist=target-start,t0=performance.now(),dur=520;function step(now){let p=Math.min(1,(now-t0)/dur);p=1-Math.pow(1-p,3);window.scrollTo(0,start+dist*p);if(p<1)requestAnimationFrame(step);}requestAnimationFrame(step);}
  fab.onclick=()=>{flick();hide();};
})();
