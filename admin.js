// 꽁밥 운영 사이트. 공개 사이트(../kkongbap/)의 판단 로직(core.js)·목록(content.js)을 그대로 불러 쓰고,
// 행사 자료는 GitHub API로 저장소의 data/events.json을 읽고 커밋한다. 토큰은 이 브라우저에만 둔다.
const PUBLIC_BASE='../kkongbap/';
const PUBLIC='https://yu-jusang.github.io/kkongbap/';
const {DAYS,koreaDate,weekday,phase,PHASES,safeUrl,parseNotice,weekStart,addDays,weekGroups,bundleOf}=await import(PUBLIC_BASE+'core.js');
const {SOURCES,SOURCE_GROUPS,KIND_LABEL,SOURCE_LABEL,CHECK_LABEL,CATEGORY,REGISTRATION,BUNDLES,TIP_FORM}=await import(PUBLIC_BASE+'content.js?v=6');

const $=selector=>document.querySelector(selector);
let toastTimer,weekOffset=0;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){
  $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);
}
function download(name,text,mime='text/calendar;charset=utf-8'){
  const objectUrl=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a');a.href=objectUrl;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
const online=e=>!e.date&&/온라인/.test(e.location||'');
const dotDate=date=>date.slice(5).replace('-','. ');
const fmt=date=>date?`${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일 (${DAYS[weekday(date)]})`:'일정 확인 필요';
const eventTime=e=>online(e)?'기간 내 온라인 참여':e.start?e.start+(e.end?'–'+e.end:'부터'):'시간 미공지';
const when=e=>e.date?`${fmt(e.date)}${e.endDate&&e.endDate!==e.date?' ~ '+fmt(e.endDate):''} · ${eventTime(e)}`:e.deadline?`${fmt(e.deadline)} 마감${e.deadlineTime?' '+e.deadlineTime:''} · 날짜 없는 참여형`:'일정 미정';
// '선착순 여부 미기재'처럼 없다는 문장은 표시하지 않는다.
const ruleTags=e=>{const r=String(e.rule||'').split(/[·\n]/).filter(x=>!/여부|미기재/.test(x)).join(' ');return [/선착순/.test(r)&&'선착순',/추첨|lucky draw/i.test(r)&&'추첨',/전원/.test(r)&&'전원',/우승|최우수|수상/.test(r)&&'수상자'].filter(Boolean);};
const phaseClass={today:'',open:'upcoming',upcoming:'upcoming',full:'closed',tbd:'unknown',ended:'closed',cancelled:'closed'};
const pill=e=>{const p=phase(e);return `<span class="status ${phaseClass[p]}">${PHASES[p]}</span>`;};
const span=e=>e.date&&e.endDate&&e.endDate!==e.date?`${dotDate(e.date)}–${dotDate(e.endDate)}`:'';
const data=()=>doc?.events||[];

// 카드: 이번 주 · 시즌 묶음 · 행사 한 건. 같은 모델로 화면, 문구, 인스타 캡션, 대체 텍스트, 이미지를 만든다.
let cardKind='week',bundleId=BUNDLES[0].id,cardEventId='';
const md=date=>`${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일`;
const HASHTAGS=['#꽁밥','#서울대','#서울대학교','#공강','#무료간식','#캠퍼스이벤트'];
const byDate=(a,b)=>(a.date||a.deadline||'9999').localeCompare(b.date||b.deadline||'9999')||(a.start||'99').localeCompare(b.start||'99');
const live=e=>!['ended','cancelled'].includes(phase(e));
const itemMeta=e=>[span(e),e.location||'장소 미기재',...ruleTags(e),PHASES[phase(e)]].filter(Boolean).join(' · ');
const detailLink=e=>`${PUBLIC}#event/${encodeURIComponent(e.id)}`;
function dateRows(events){
  const rows=[];
  for(const e of events){
    const key=e.date||(e.deadline?'마감:'+e.deadline:'상시');
    let row=rows.find(r=>r.key===key);
    if(!row){row=e.date?{key,label:DAYS[weekday(e.date)],sub:dotDate(e.date),items:[]}:e.deadline?{key,label:'마감',sub:dotDate(e.deadline),items:[]}:{key,label:'상시',sub:'일정 미정',items:[]};rows.push(row);}
    row.items.push({time:e.date?(e.start||''):null,e});// null: 날짜 없는 행사라 시간 칸을 비운다
  }
  return rows;
}
function cardModel(){
  if(cardKind==='bundle'){
    const b=BUNDLES.find(x=>x.id===bundleId)||BUNDLES[0];
    const all=data().filter(e=>bundleOf(e,BUNDLES)===b.id).sort(byDate),now=all.filter(live),past=all.length-now.length;
    return {kind:'bundle',file:`kkongbap-${b.id}`,eyebrow:'꽁밥 · 시즌 묶음',title:b.title,desc:b.desc,count:`진행·예정 ${now.length}건${past?` · 지난 행사 ${past}건`:''}`,rows:dateRows(now),events:now,empty:'지금 진행·예정인 행사가 없습니다. 지난 행사는 행사 찾기에서 ‘지난 행사도 보기’로 볼 수 있습니다.'};
  }
  if(cardKind==='event'){
    const list=data().filter(live).sort(byDate),e=list.find(x=>x.id===cardEventId)||list[0];
    return {kind:'event',file:`kkongbap-${e?.id||'event'}`,e,list};
  }
  const start=addDays(weekStart(koreaDate()),weekOffset*7),w=weekGroups(data(),start,koreaDate());
  const rows=w.days.filter(d=>d.events.length).map(d=>({label:DAYS[weekday(d.date)],sub:dotDate(d.date),items:d.events.map(e=>({time:e.start||'',e}))}));
  if(w.deadlines.length)rows.push({label:'마감',sub:'신청',items:w.deadlines.map(e=>({time:dotDate(e.deadline),e}))});
  return {kind:'week',file:`kkongbap-week-${w.start}`,eyebrow:'꽁밥 · 주간',title:`${md(w.start)} – ${md(w.end)}`,range:`${dotDate(w.start)} – ${dotDate(w.end)}`,count:`이번 주 행사 ${w.count}건${w.deadlines.length?` · 신청 마감 ${w.deadlines.length}건`:''}`,rows,events:[...new Set(rows.flatMap(r=>r.items.map(i=>i.e)))],empty:'이 주에 날짜가 확인된 행사가 없습니다.'};
}
function listCardHTML(m){
  return `<header class="wc-head"><p class="eyebrow">${esc(m.eyebrow)}</p><h3>${esc(m.title)}</h3><p class="wc-count">${esc(m.count)}</p>${m.desc?`<p class="wc-desc">${esc(m.desc)}</p>`:''}</header>
  ${m.rows.length?m.rows.map(r=>`<div class="wc-day"><div class="wc-date"><strong>${esc(r.label)}</strong><span class="${/^\d/.test(r.sub)?'':'sans'}">${esc(r.sub)}</span></div><ul>${r.items.map(({time,e})=>`<li><a href="${esc(detailLink(e))}" target="_blank" rel="noopener"><span class="wc-time">${esc(time===null?'—':time||'미공지')}</span><span class="wc-title">${esc(e.title)}</span><span class="wc-benefit">${esc(e.benefit)}</span><span class="wc-meta">${esc(itemMeta(e))}</span></a></li>`).join('')}</ul></div>`).join(''):`<p class="tl-empty">${esc(m.empty)}</p>`}
  <footer class="wc-foot">행사별 대상·신청 방법·장소는 사이트 상세와 원문에서 확인하세요. 일정과 제공 내용은 바뀔 수 있습니다.</footer>`;
}
function eventFacts(e){
  return [['언제',online(e)?'기간 내 온라인 참여':when(e)],['어디서',e.location||'원문에 미기재'],['대상',e.eligibility||'원문에 미기재'],['받는 조건',e.rule||'원문에 미기재'],['신청',e.deadline?`${fmt(e.deadline)}${e.deadlineTime?' '+e.deadlineTime:''} 마감`:REGISTRATION[e.registration]==='필요'?'사전신청 필요 · 마감 미기재':REGISTRATION[e.registration]||'확인 필요']];
}
function eventCardHTML(e){
  if(!e)return '<p class="tl-empty">진행·예정인 행사가 없습니다.</p>';
  return `<header class="wc-head"><p class="eyebrow">꽁밥 · ${esc(CATEGORY[e.category]||'')}</p><h3>${esc(e.title)}</h3><p class="wc-count">${esc(PHASES[phase(e)])}${ruleTags(e).length?' · '+esc(ruleTags(e).join(' · ')):''}</p></header>
  <div class="ec-body"><p class="ec-benefit">${esc(e.benefit||'혜택 원문 확인 필요')}</p><dl class="ec-facts">${eventFacts(e).map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${(e.uncertain||[]).length?`<p class="ec-note">꼭 확인: ${esc(e.uncertain[0])}</p>`:''}<a class="btn btn-secondary btn-sm" href="${esc(detailLink(e))}" target="_blank" rel="noopener">꽁밥에서 보기</a></div>
  <footer class="wc-foot">출처: ${esc(SOURCE_LABEL[e.source]||'')} 원문 · 확인 ${esc(e.verifiedAt||'—')} · 일정과 제공 내용은 바뀔 수 있습니다.</footer>`;
}
function cardText(m){
  if(m.kind==='event'){const e=m.e;return e?[`[꽁밥] ${e.title}`,`혜택: ${e.benefit}`,...eventFacts(e).map(([k,v])=>`${k}: ${v}`),`원문: ${safeUrl(e.sourceUrl)||'원문 링크 없음'}`,`상세: ${detailLink(e)}`].join('\n'):'';}
  return [`[꽁밥] ${m.title} · ${m.count}`,'',...m.rows.flatMap(r=>[`${r.label} ${r.sub}`,...r.items.map(({time,e})=>`- ${time===null?'':(time||'시간 미공지')+' '}${e.title}${span(e)?` (${span(e)})`:''} · ${e.benefit} · ${e.location||'장소 미기재'}${e.rule?' · '+e.rule:''}\n  ${detailLink(e)}`)]),'','정확한 일정과 참여 조건은 원문을 확인해 주세요.'].join('\n');
}
function cardTags(events){
  const tags=[...HASHTAGS];
  if(events.some(e=>e.category==='gift'))tags.push('#기프티콘');
  if(events.some(e=>e.source==='instagram'))tags.push('#학생회');
  if(cardKind==='bundle'){const b=BUNDLES.find(x=>x.id===bundleId);if(b)tags.push('#'+b.short.replace(/[^\w가-힣]/g,''));}
  return tags.join(' ');
}
// 인스타그램 캡션은 링크가 눌리지 않으므로 행사 이름으로 찾도록 안내하고 해시태그를 붙인다.
function cardCaption(m){
  const tail=['','대상·신청 방법은 프로필 링크의 꽁밥에서 행사 이름으로 찾아보세요.','일정과 제공 내용은 바뀔 수 있으니 원문 공지를 꼭 확인해 주세요.',''];
  if(m.kind==='event'){
    const e=m.e;if(!e)return '';
    return [`[꽁밥] ${e.title}`,'',`🎁 ${e.benefit}`,...eventFacts(e).map(([k,v])=>`· ${k}: ${v}`),`· 출처: ${SOURCE_LABEL[e.source]||''} 원문 (확인 ${e.verifiedAt})`,...tail,cardTags([e])].join('\n');
  }
  return [`[꽁밥] ${m.title}`,m.count,...(m.desc?[m.desc]:[]),'',...m.rows.flatMap(r=>[`${r.label} ${r.sub}`,...r.items.map(({time,e})=>`· ${time?time+' ':''}${e.title}\n  ${e.benefit}\n  📍 ${e.location||'장소 미기재'}${ruleTags(e).length?' · '+ruleTags(e).join('·'):''}`),'']),...tail.slice(1),cardTags(m.events)].join('\n');
}
function cardAlt(m){
  if(m.kind==='event'){const e=m.e;return e?`꽁밥 행사 카드. ${e.title}. 혜택 ${e.benefit}. ${when(e)}, ${e.location||'장소 미기재'}.`:'';}
  const items=m.rows.flatMap(r=>r.items.map(({time,e})=>`${r.sub} ${time||''} ${e.title}`.replace(/\s+/g,' ').trim()));
  const s=`꽁밥 ${m.title} 카드. ${m.count}. ${items.join(', ')}.`;
  return s.length>480?s.slice(0,477)+'…':s;
}
function renderCardPicker(m){
  const p=$('#card-picker');
  if(m.kind==='week')p.innerHTML=`<div class="segments" role="group" aria-label="주 이동"><button type="button" data-week="-1"${weekOffset<0?' class="selected"':''}>← 지난주</button><button type="button" data-week="0"${weekOffset===0?' class="selected"':''}>이번 주</button><button type="button" data-week="1"${weekOffset>0?' class="selected"':''}>다음 주 →</button></div>`;
  else if(m.kind==='bundle')p.innerHTML=`<div class="segments" role="group" aria-label="시즌 묶음">${BUNDLES.map(b=>{const n=data().filter(e=>bundleOf(e,BUNDLES)===b.id&&live(e)).length;return `<button type="button" data-bundle="${b.id}" class="${b.id===bundleId?'selected':''}" aria-pressed="${b.id===bundleId}">${esc(b.short)} <span class="mono">${n}</span></button>`;}).join('')}</div>`;
  else p.innerHTML=`<label class="field inline">행사<select id="card-event">${m.list.map(e=>`<option value="${esc(e.id)}"${e.id===m.e?.id?' selected':''}>${esc((e.date?dotDate(e.date):e.deadline?'~'+dotDate(e.deadline):'미정')+' '+e.title)}</option>`).join('')}</select></label>`;
  $('#card-event')?.addEventListener('change',ev=>{cardEventId=ev.target.value;renderWeek();});
}
function renderWeek(){
  const m=cardModel();
  document.querySelectorAll('[data-kind]').forEach(b=>{b.classList.toggle('selected',b.dataset.kind===cardKind);b.setAttribute('aria-pressed',String(b.dataset.kind===cardKind));});
  $('#week-range').textContent=m.kind==='week'?m.range:m.kind==='bundle'?m.count:'';
  $('#card-note').textContent=m.kind==='bundle'?'제목으로 묶었습니다. 지난 행사는 카드에 싣지 않습니다.':m.kind==='event'?'진행·예정인 행사만 고를 수 있습니다.':'';
  renderCardPicker(m);
  $('#week-card').className='week-card'+(m.kind==='event'?' event-card':'');
  $('#week-card').innerHTML=m.kind==='event'?eventCardHTML(m.e):listCardHTML(m);
  const copy=(text,done)=>async()=>{if(!text)return toast('복사할 내용이 없습니다.');try{await navigator.clipboard.writeText(text);toast(done);}catch{toast('클립보드에 접근하지 못했습니다.');}};
  $('#copy-week').onclick=copy(cardText(m),'문구를 복사했습니다.');
  $('#copy-caption').onclick=copy(cardCaption(m),'인스타그램 캡션을 복사했습니다.');
  $('#copy-alt').onclick=copy(cardAlt(m),'대체 텍스트를 복사했습니다.');
  $('#save-week').onclick=()=>(m.kind==='event'?saveEventImage(m):saveListImage(m)).catch(()=>toast('카드 이미지를 만들지 못했습니다.'));
}

// 카드 이미지(인스타그램 세로 1080×1350)
async function cardCanvas(){
  await Promise.all(['400','500','600','700','800'].map(weight=>document.fonts.load(`${weight} 32px "Pretendard Variable"`).catch(()=>{})));
  const W=1080,H=1350,P=72,sans='"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',mono='"JetBrains Mono", Consolas, monospace';
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  const font=(size,weight=400,family=sans)=>{ctx.font=`${weight} ${size}px ${family}`;};
  const wrap=(text,width,max)=>{
    const lines=[];let line='';
    for(const ch of String(text)){
      if(ctx.measureText(line+ch).width>width){
        const cut=line.lastIndexOf(' ');
        if(cut>line.length*0.5){lines.push(line.slice(0,cut));line=line.slice(cut+1)+ch;}else{lines.push(line);line=ch.trim();}
        if(lines.length===max)break;
      }else line+=ch;
    }
    if(lines.length<max&&line)lines.push(line);
    else if(lines.length===max&&(line||lines.join('').length<String(text).length)){let last=lines[max-1];while(last&&ctx.measureText(last+'…').width>width)last=last.slice(0,-1);lines[max-1]=last+'…';}
    return lines;
  };
  const footer=()=>{
    ctx.fillStyle='rgba(255,255,255,.85)';font(26,600);ctx.fillText('yu-jusang.github.io/kkongbap',P,H-62);
    ctx.fillStyle='rgba(255,255,255,.6)';font(22,400);ctx.fillText('행사별 대상·신청 방법·장소는 원문을 확인하세요. 일정과 제공 내용은 바뀔 수 있습니다.',P,H-28);
  };
  const save=async name=>{const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error()),'image/png'));download(`${name}.png`,blob,'image/png');toast('카드 이미지를 저장했습니다.');};
  ctx.fillStyle='#2a160c';ctx.fillRect(0,0,W,H);
  return {W,H,P,sans,mono,ctx,font,wrap,footer,save};
}
async function saveListImage(m){
  const {W,H,P,sans,mono,ctx,font,wrap,footer,save}=await cardCanvas();
  ctx.fillStyle='#ffd3b4';font(28,600);ctx.fillText(m.eyebrow.replace('꽁밥 · ','꽁밥 · 서울대 무료 음식·행사 · '),P,P+20);
  font(m.title.length>16?56:68,700);const titleLines=wrap(m.title,W-2*P,2);
  ctx.fillStyle='#ffffff';titleLines.forEach((t,i)=>ctx.fillText(t,P,P+105+i*66));
  font(32,400);ctx.fillStyle='rgba(255,255,255,.82)';ctx.fillText(m.count,P,P+165+(titleLines.length-1)*66);
  // 같은 배치를 두 번 돈다: 처음엔 높이만 재고, 그 높이로 흰 상자를 그린 뒤 글자를 쓴다.
  const top=290+(titleLines.length-1)*60,bottom=H-130;
  const rows=m.rows,total=rows.reduce((n,r)=>n+r.items.length,0),left=P+20,col=left+120,textW=W-col-P-20;
  const body=draw=>{
    const put=(text,x,y,color)=>{if(draw){ctx.fillStyle=color;ctx.fillText(text,x,y);}};
    let y=top+30,shown=0;
    if(!rows.length){font(32,600);for(const [i,t] of wrap(m.empty,W-2*left,3).entries())put(t,left,y+30+i*44,'#4b4e56');return y+160;}
    const lines=total>5?1:2;// 행사가 많으면 제목·혜택을 한 줄로 줄인다.
    const measure=e=>{font(34,700);const title=wrap(e.title,textW-110,lines);font(28,500);const benefit=wrap(e.benefit||'',textW-110,lines);return {title,benefit,need:title.length*44+benefit.length*38+44};};
    outer:for(const [i,row] of rows.entries()){
      if(y+Math.max(measure(row.items[0].e).need,80)>bottom-50)break;
      font(40,700);put(row.label,left,y+34,'#17181c');
      font(22,400,/^\d/.test(row.sub)?mono:sans);put(row.sub,left,y+66,'#6f727a');
      for(const {time,e} of row.items){
        const {title,benefit,need}=measure(e);
        if(y+need>bottom-(shown+1<total?50:0))break outer;
        if(time===null){/* 날짜 없는 행사: 시간 칸 비움 */}
        else if(/^\d/.test(time)){font(26,500,mono);put(time,col,y+32,'#c2410c');}
        else{font(22,600);put('시간',col,y+28,'#6f727a');put('미공지',col,y+56,'#6f727a');}
        let ty=y+32;
        font(34,700);for(const t of title){put(t,col+110,ty,'#17181c');ty+=44;}
        font(28,500);for(const t of benefit){put(t,col+110,ty,'#17181c');ty+=38;}
        font(24,400);put(wrap(itemMeta(e),textW-110,1)[0]||'',col+110,ty,'#6f727a');
        y=ty+30;shown++;
      }
      if(i<rows.length-1){if(draw){ctx.fillStyle='#e4e4df';ctx.fillRect(left,y-8,W-2*left,2);}y+=22;}
    }
    if(shown<total){font(30,700);put(`+ ${total-shown}건 더 · 사이트에서 확인`,left,y+30,'#c2410c');y+=50;}
    return y;
  };
  const end=Math.min(body(false),bottom);
  ctx.fillStyle='#f8f8f5';ctx.beginPath();ctx.roundRect(36,top-24,W-72,end-top+40,28);ctx.fill();
  body(true);footer();
  await save(m.file);
}
async function saveEventImage(m){
  const e=m.e;if(!e)return toast('진행·예정인 행사가 없습니다.');
  const {W,H,P,mono,ctx,font,wrap,footer,save}=await cardCanvas();
  ctx.fillStyle='#ffd3b4';font(28,600);ctx.fillText(`꽁밥 · ${CATEGORY[e.category]||''} · ${PHASES[phase(e)]}`,P,P+20);
  font(60,800);const title=wrap(e.title,W-2*P,3);ctx.fillStyle='#ffffff';title.forEach((t,i)=>ctx.fillText(t,P,P+100+i*72));
  let y=P+100+title.length*72+10;
  font(40,700);const benefit=wrap(e.benefit||'혜택 원문 확인 필요',W-2*P,3);ctx.fillStyle='#ffaa75';benefit.forEach((t,i)=>ctx.fillText(t,P,y+i*52));
  y+=benefit.length*52+30;
  // 사실 항목은 흰 상자에 담는다. 높이를 먼저 잰다.
  const label=150,valueW=W-2*P-40-label,facts=eventFacts(e).map(([k,v])=>{font(30,500);return [k,wrap(v,valueW,k==='받는 조건'?3:2)];});
  font(24,400);const note=(e.uncertain||[]).length?wrap('꼭 확인: '+e.uncertain[0],W-2*P-40,2):[];
  const boxH=Math.min(H-130-y,facts.reduce((s,[,ls])=>s+ls.length*42+22,0)+note.length*34+(note.length?20:0)+40);
  ctx.fillStyle='#f8f8f5';ctx.beginPath();ctx.roundRect(36,y,W-72,boxH,28);ctx.fill();
  let fy=y+56;
  for(const [k,ls] of facts){
    if(fy+ls.length*42>y+boxH-10)break;
    ctx.fillStyle='#6f727a';font(26,600);ctx.fillText(k,P,fy);
    ctx.fillStyle='#17181c';font(30,500);ls.forEach((t,i)=>ctx.fillText(t,P+label,fy+i*42));
    fy+=ls.length*42+22;
  }
  if(note.length&&fy+note.length*34<y+boxH){ctx.fillStyle='#c2410c';font(24,500);note.forEach((t,i)=>ctx.fillText(t,P,fy+4+i*34));}
  ctx.fillStyle='rgba(255,255,255,.7)';font(22,400,mono);ctx.fillText(`확인 ${e.verifiedAt||'—'}`,W-P-180,P+20);
  footer();
  await save(m.file);
}


// ───────── 운영: GitHub 연결, 자료 불러오기·저장 ─────────
const REPO='Yu-Jusang/kkongbap',FILE='data/events.json',API='https://api.github.com';
const FORM_EDIT='https://docs.google.com/forms/d/1wbeU7xURIf6PzzJIPKGATFKmfdycDtyBAtN6diA8IEA/edit#responses';
const TOKEN_KEY='kkongbap-admin-token';
const VIEWS=['tips','events','cards','food','sources','docs','settings'];
let token=sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||'';
let doc=null,sha='',baseText='',canWrite=false,view='tips';

async function gh(path,opts={}){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(opts.headers||{})};
  if(token)headers.Authorization=`Bearer ${token}`;
  return fetch(API+path,{...opts,headers,cache:'no-store'});
}
// GitHub contents API는 base64. 한글이 깨지지 않게 UTF-8 바이트로 바꾼다.
const fromB64=b64=>new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g,'')),c=>c.charCodeAt(0)));
function toB64(text){const bytes=new TextEncoder().encode(text);let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
const docText=()=>JSON.stringify(doc,null,1)+'\n';
const isDirty=()=>!!doc&&docText()!==baseText;

async function connect(){
  canWrite=false;
  if(token){
    try{
      const r=await gh(`/repos/${REPO}`);
      if(r.ok){const j=await r.json();canWrite=!!j.permissions?.push;}
      $('#conn-status').textContent=r.ok?(canWrite?'GitHub 연결됨 · 저장 가능':'GitHub 연결됨 · 저장 권한 없음'):`토큰 확인 실패 (${r.status})`;
    }catch{$('#conn-status').textContent='GitHub에 연결하지 못했습니다';}
  }else $('#conn-status').textContent='연결 안 됨 · 읽기 전용';
  renderStatus();
}
async function loadDoc(){
  $('#data-status').textContent='자료 불러오는 중';
  try{
    const r=await gh(`/repos/${REPO}/contents/${FILE}?ref=main`);
    if(!r.ok)throw Error(r.status);
    const j=await r.json();sha=j.sha;baseText=fromB64(j.content);doc=JSON.parse(baseText);
  }catch{
    // API 한도 등으로 실패하면 공개본을 읽는다(저장은 다시 불러온 뒤에 가능)
    const r=await fetch(PUBLIC_BASE+'data/events.json',{cache:'no-store'});baseText=await r.text();doc=JSON.parse(baseText);sha='';
  }
  baseText=docText();// 들여쓰기 차이로 '변경됨'이 뜨지 않게 같은 형식으로 맞춘다
  render();
}
async function saveDoc(){
  if(!canWrite)return toast('연결 탭에서 저장 권한이 있는 토큰을 넣어 주세요.');
  if(!sha){await loadDoc();return toast('최신 자료를 다시 불러왔습니다. 고친 내용을 다시 적용해 주세요.');}
  const before=JSON.parse(baseText),changed=changeSummary(before,doc);
  doc.revision=(doc.revision||0)+1;
  doc.status={...(doc.status||{}),updatedAt:new Date().toISOString(),verifiedAt:koreaDate()};
  const text=docText();
  $('#save-all').disabled=true;$('#save-all').textContent='저장 중…';
  try{
    const r=await gh(`/repos/${REPO}/contents/${FILE}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`행사 자료 수정: ${changed||'정리'}`,content:toB64(text),sha,branch:'main'})});
    if(r.status===409||r.status===422){toast('그사이 저장소 자료가 바뀌었습니다. 다시 불러온 뒤 고쳐 주세요.');doc.revision--;return;}
    if(!r.ok)throw Error(r.status);
    const j=await r.json();sha=j.content.sha;baseText=text;
    toast('저장했습니다. 1~2분 뒤 꽁밥에 반영됩니다.');
  }catch(err){doc.revision--;toast(`저장하지 못했습니다 (${err.message}).`);}
  finally{$('#save-all').textContent='변경 저장';render();}
}
function changeSummary(a,b){
  const ids=new Set([...(a.events||[]).map(e=>e.id),...(b.events||[]).map(e=>e.id)]),out=[];
  for(const id of ids){
    const x=(a.events||[]).find(e=>e.id===id),y=(b.events||[]).find(e=>e.id===id);
    if(!x)out.push(`추가 ${y.title}`);else if(!y)out.push(`삭제 ${x.title}`);else if(JSON.stringify(x)!==JSON.stringify(y))out.push(`수정 ${y.title}`);
  }
  if(JSON.stringify(a.status?.sourceChecks)!==JSON.stringify(b.status?.sourceChecks))out.push('출처 확인');
  return out.slice(0,3).join(', ')+(out.length>3?` 외 ${out.length-3}건`:'');
}
function renderStatus(){
  const dirty=isDirty();
  $('#data-status').textContent=doc?`자료 ${doc.events.length}건 · revision ${doc.revision} · ${doc.status?.updatedAt?new Date(doc.status.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):''}`:'자료 불러오는 중';
  $('#dirty-status').hidden=!dirty;$('#dirty-status').textContent=dirty?`저장 안 한 변경: ${changeSummary(JSON.parse(baseText),doc)}`:'';
  $('#save-all').disabled=!dirty||!canWrite;$('#discard-all').hidden=!dirty;
  $('#save-all').title=canWrite?'':'연결 탭에서 토큰을 넣으면 저장할 수 있습니다';
}

// ───────── 화면 전환 ─────────
function setView(next){
  view=VIEWS.includes(next)?next:'tips';
  for(const id of VIEWS)$(`#${id}-view`).hidden=id!==view;
  document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===view)));
  if(view==='tips')loadIssues();
  if(view==='food')loadMenuInfo();
  render();
}
function render(){
  if(!doc)return;
  renderStatus();
  $('#event-count').textContent=doc.events.filter(live).length;
  if(view==='events')renderEvents();
  if(view==='cards')renderWeek();
  if(view==='sources')renderSources();
}

// ───────── 행사 관리 ─────────
function renderEvents(){
  const q=$('#ev-search').value.trim().toLowerCase(),f=$('#ev-filter').value;
  const list=doc.events.filter(e=>(!f||(f==='live'?live(e):!live(e)))&&(!q||[e.title,e.location,e.benefit].join(' ').toLowerCase().includes(q)))
    .sort((a,b)=>f==='past'?byDate(b,a):byDate(a,b));
  $('#events-aside').textContent=`${list.length}건`;
  $('#ev-rows').innerHTML=list.map(e=>`<tr data-edit="${esc(e.id)}" tabindex="0"><td class="mono">${esc(e.date?dotDate(e.date):e.deadline?'~'+dotDate(e.deadline):'미정')}</td><td><b>${esc(e.title)}</b><br><span class="muted small">${esc(e.benefit||'')}</span></td><td>${pill(e)}</td><td class="small">${esc(SOURCE_LABEL[e.source]||e.source||'')}</td><td class="mono small">${esc(e.verifiedAt||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="tl-empty">해당하는 행사가 없습니다.</td></tr>';
}
const EDIT_FIELDS=[
  ['title','행사명','text','full'],['date','행사 날짜','date'],['endDate','끝 날짜','date'],['start','시작','time'],['end','종료','time'],
  ['location','장소','text','full'],['benefit','혜택','text','full'],['category','혜택 종류','category'],['series','시즌 묶음','series'],
  ['eligibility','대상','text','full'],['rule','받는 조건','textarea','full'],['registration','사전신청','registration'],['deadline','신청 마감','date'],['deadlineTime','마감 시각','time'],
  ['registrationUrl','신청 링크','url','full'],['sourceUrl','원문 링크 (있으면)','url','full'],['source','출처 종류','source'],['verifiedAt','확인일','date'],
  ['evidence','원문 근거 (짧게 인용)','textarea','full'],['uncertain','꼭 확인할 점 (한 줄에 하나)','lines','full'],['cancelled','취소됨','check']];
let editing=null;// {id|null, event}
function openEditor(e,isNew=false){
  editing={id:isNew?null:e.id,event:{...e}};
  $('#edit-eyebrow').textContent=isNew?'새 행사':`${SOURCE_LABEL[e.source]||''} · ${e.id}`;
  $('#edit-title').textContent=isNew?'행사 추가':'행사 고치기';
  $('#edit-delete').hidden=isNew;
  const opt=(pairs,v)=>pairs.map(([k,t])=>`<option value="${esc(k)}"${k===(v??'')?' selected':''}>${esc(t)}</option>`).join('');
  $('#edit-fields').innerHTML=EDIT_FIELDS.map(([k,label,type,wide])=>{
    const v=e[k];let input;
    if(type==='textarea')input=`<textarea name="${k}" rows="3">${esc(v??'')}</textarea>`;
    else if(type==='lines')input=`<textarea name="${k}" rows="3">${esc((v||[]).join('\n'))}</textarea>`;
    else if(type==='category')input=`<select name="${k}">${opt(Object.entries(CATEGORY),v)}</select>`;
    else if(type==='registration')input=`<select name="${k}">${opt(Object.entries(REGISTRATION),v||'unknown')}</select>`;
    else if(type==='source')input=`<select name="${k}">${opt([['notice','학교 공지'],['instagram','학생회 인스타'],['tip','제보 확인']],v||'notice')}</select>`;
    else if(type==='series')input=`<select name="${k}">${opt([['','제목으로 자동'],...BUNDLES.map(b=>[b.id,b.short])],v||'')}</select>`;
    else if(type==='check')input=`<input type="checkbox" name="${k}"${v?' checked':''}>`;
    else input=`<input name="${k}" type="${type}" value="${esc(v??'')}">`;
    return type==='check'?`<label class="checkbox ${wide||''}">${input}${label}</label>`:`<label class="field ${wide||''}">${label}${input}</label>`;
  }).join('');
  $('#edit-error').textContent='';
  const src=safeUrl(e.sourceUrl||'');$('#edit-source').hidden=!src;if(src)$('#edit-source').href=src;
  $('#edit-dialog').showModal();
}
function slug(e){
  const base=(e.title||'event').normalize('NFKD').replace(/[^\w가-힣]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'event';
  return `${base}-${(e.date||e.deadline||koreaDate()).replaceAll('-','')}`;
}
function applyEditor(){
  const f=Object.fromEntries(new FormData($('#edit-form')));
  const e={...editing.event};
  for(const [k,,type] of EDIT_FIELDS){
    if(type==='check'){e[k]=!!f[k];if(!e[k])delete e[k];continue;}
    const v=String(f[k]??'').trim();
    if(type==='lines')e[k]=v.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    else e[k]=v||(['date','endDate','start','end','deadline','deadlineTime'].includes(k)?null:'');
  }
  if(!e.series)delete e.series;
  if(!e.registrationUrl)delete e.registrationUrl;
  // 원문 링크는 있으면 넣는다. 게시판 포스터·카톡 공지처럼 링크가 없으면 원문 근거(원문 일부 인용)로 대신한다.
  const err=[!e.title&&'행사명',!e.verifiedAt&&'확인일',!e.sourceUrl&&!e.evidence&&'원문 근거(링크가 없으면 원문 일부를 옮겨 적기)'].filter(Boolean);
  if(err.length)return $('#edit-error').textContent=`${err.join(', ')} 칸을 채워 주세요.`;
  if(e.sourceUrl&&!safeUrl(e.sourceUrl))return $('#edit-error').textContent='원문 링크는 https://로 시작해야 합니다.';
  if(e.start&&e.end&&e.end<=e.start)return $('#edit-error').textContent='종료시간은 시작시간 이후여야 합니다.';
  if(e.endDate&&e.date&&e.endDate<e.date)return $('#edit-error').textContent='끝 날짜는 행사 날짜 이후여야 합니다.';
  if(e.registrationUrl&&!safeUrl(e.registrationUrl))return $('#edit-error').textContent='신청 링크는 https://로 시작해야 합니다.';
  e.publicVerified=true;
  if(editing.id){doc.events=doc.events.map(x=>x.id===editing.id?e:x);}
  else{let id=slug(e);while(doc.events.some(x=>x.id===id))id+='-2';e.id=id;doc.events.push(e);}
  $('#edit-dialog').close();toast('적용했습니다. ‘변경 저장’을 누르면 꽁밥에 반영됩니다.');render();
}
// 제보 원문 → 행사 초안(공개 사이트와 같은 해석기)
function draftFromText(text,source=''){
  const d=parseNotice(text,new Date().getFullYear());
  const {links,qr,id,publicVerified,...rest}=d;
  return {...rest,source:'notice',sourceUrl:safeUrl(source)||'',verifiedAt:koreaDate(),evidence:(d.benefit||'').slice(0,120),uncertain:(d.uncertain||[]).filter(u=>!/사진에서 읽은/.test(u))};
}

// ───────── 제보함 ─────────
async function loadIssues(){
  try{
    const r=await gh(`/repos/${REPO}/issues?labels=${encodeURIComponent('제보')}&state=open&per_page=30`);
    const list=r.ok?await r.json():[];
    $('#issue-count').textContent=`열린 ${list.length}건`;
    $('#issues').innerHTML=list.length?list.map(i=>`<div class="issue"><a href="${esc(i.html_url)}" target="_blank" rel="noopener"><b>${esc(i.title)}</b></a><span class="muted small"> · ${new Date(i.created_at).toLocaleDateString('ko-KR')}</span><p class="small">${esc((i.body||'').replace(/###\s*/g,'').replace(/\s+/g,' ').slice(0,160))}</p><button type="button" class="text-button" data-issue="${i.number}">행사 초안 만들기</button></div>`).join(''):'<p class="tl-empty">열린 제보 이슈가 없습니다.</p>';
    window.__issues=list;
  }catch{$('#issues').innerHTML='<p class="tl-empty">이슈를 불러오지 못했습니다.</p>';}
}
// 이슈 양식 본문('### 원문 링크\n\n값')을 '원문 링크: 값' 줄로 바꿔 해석기에 넣는다
function issueToText(body){
  const parts=[...String(body||'').matchAll(/###\s*(.+?)\n+([\s\S]*?)(?=\n###|$)/g)].map(m=>[m[1].trim(),m[2].trim()]).filter(([,v])=>v&&v!=='_No response_');
  const get=k=>parts.find(([t])=>t.includes(k))?.[1]||'';
  const lines=[get('행사 이름'),get('날짜')&&`일시: ${get('날짜')}`,get('장소')&&`장소: ${get('장소')}`,get('혜택')&&`혜택: ${get('혜택')}`,get('대상'),get('추가')].filter(Boolean);
  return {text:lines.join('\n'),source:get('원문 링크')};
}

// ───────── 학식 수집 ─────────
async function loadMenuInfo(){
  try{
    const m=await (await fetch(PUBLIC_BASE+'data/menu.json',{cache:'no-store'})).json();
    $('#menu-info').innerHTML=`<div><dt>마지막 갱신</dt><dd>${esc(m.fetchedAt.replace('T',' '))}</dd></div><div><dt>가진 날짜</dt><dd>${Object.entries(m.days).map(([d,v])=>`${dotDate(d)} ${v.length}곳`).join(' · ')}</dd></div><div><dt>원문</dt><dd><a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.source)}</a></dd></div>`;
  }catch{$('#menu-info').innerHTML='<div><dt>상태</dt><dd>menu.json을 읽지 못했습니다.</dd></div>';}
  try{
    const r=await gh(`/repos/${REPO}/actions/workflows/menu.yml/runs?per_page=6`);const j=await r.json();
    $('#menu-runs').innerHTML=(j.workflow_runs||[]).map(x=>`<tr><td class="mono small">${new Date(x.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</td><td class="small">${x.event==='schedule'?'예약':'수동'}</td><td class="small"><a href="${esc(x.html_url)}" target="_blank" rel="noopener">${esc(x.conclusion||x.status)}</a></td></tr>`).join('')||'<tr><td colspan="3" class="tl-empty">기록 없음</td></tr>';
  }catch{$('#menu-runs').innerHTML='<tr><td colspan="3" class="tl-empty">실행 기록을 불러오지 못했습니다.</td></tr>';}
}
async function runMenu(){
  $('#menu-error').textContent='';
  if(!token)return $('#menu-error').textContent='연결 탭에서 토큰을 넣어 주세요(Actions 권한 필요).';
  const r=await gh(`/repos/${REPO}/actions/workflows/menu.yml/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main'})});
  if(r.status===204){toast('학식 수집을 시작했습니다. 1분쯤 뒤 기록에 나옵니다.');setTimeout(loadMenuInfo,15000);}
  else $('#menu-error').textContent=`실행하지 못했습니다 (${r.status}). 토큰에 Actions 쓰기 권한이 있는지 확인해 주세요.`;
}

// ───────── 출처 확인 ─────────
function renderSources(){
  const checks=doc.status?.sourceChecks||[];
  const query=$('#src-search').value.trim().toLowerCase(),filter=$('#src-filter').value,week=Date.now()-7*864e5;
  const keep=s=>{const c=checks.find(x=>x.key===s.key);
    if(query&&!`${s.name} ${s.group} ${s.url}`.toLowerCase().includes(query))return false;
    if(filter==='stale')return !c||new Date(c.checkedAt).getTime()<week;
    if(filter==='never')return !c;
    if(filter==='blocked')return c&&(c.state==='blocked'||c.state==='browser_only');
    return true;};
  const row=s=>{const c=checks.find(x=>x.key===s.key);return `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(s.name)}</b></a><br><span class="muted small">${esc(KIND_LABEL[s.kind]||'')}</span></td><td class="small">${c?`${esc(CHECK_LABEL[c.state]||c.state)} · <span class="mono">${new Date(c.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</span>${c.detail?`<br><span class="muted">${esc(c.detail)}</span>`:''}`:'확인 기록 없음'}</td><td><button type="button" class="btn btn-secondary btn-sm" data-check-source="${esc(s.key)}">오늘 확인함</button></td></tr>`;};
  const shown=SOURCES.filter(keep);
  $('#src-count').textContent=`${shown.length} / ${SOURCES.length}곳`;
  $('#src-rows').innerHTML=SOURCE_GROUPS.map(g=>{const list=shown.filter(s=>s.group===g);return list.length?`<tr class="src-grp"><th colspan="3" scope="rowgroup">${esc(g)} <span class="muted">${list.length}곳</span></th></tr>${list.map(row).join('')}`:'';}).join('')||'<tr><td colspan="3" class="tl-empty">해당하는 출처가 없습니다.</td></tr>';
}
function markChecked(key){
  const s=SOURCES.find(x=>x.key===key);if(!s)return;
  doc.status=doc.status||{};const checks=doc.status.sourceChecks=(doc.status.sourceChecks||[]).filter(c=>c.key!==key);
  checks.push({key,state:s.kind==='instagram'?'browser_only':'ok',checkedAt:new Date().toISOString(),detail:s.kind==='instagram'?'운영자가 공개 게시물을 직접 확인':'운영자가 공지 목록을 직접 확인'});
  render();toast(`${s.name} 확인을 기록했습니다. ‘변경 저장’을 눌러 주세요.`);
}

// ───────── 시작 ─────────
function initialize(){
  $('#form-responses').href=FORM_EDIT;$('#form-view').href=TIP_FORM.url;
  $('#token-remember').checked=!!localStorage.getItem(TOKEN_KEY);
  if(token)$('#token').value='••••••••';
  document.addEventListener('click',e=>{
    const row=e.target.closest('[data-edit]');
    if(row){const ev=doc.events.find(x=>x.id===row.dataset.edit);if(ev)openEditor(ev);return;}
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.close)$(`#${b.dataset.close}`).close();
    if(b.dataset.week){weekOffset=Number(b.dataset.week)===0?0:weekOffset+Number(b.dataset.week);renderWeek();}
    if(b.dataset.kind){cardKind=b.dataset.kind;renderWeek();}
    if(b.dataset.bundle){bundleId=b.dataset.bundle;renderWeek();}
    if(b.dataset.checkSource)markChecked(b.dataset.checkSource);
    if(b.dataset.issue){const i=(window.__issues||[]).find(x=>String(x.number)===b.dataset.issue);if(i){const {text,source}=issueToText(i.body);try{openEditor(draftFromText(text||i.title,source),true);}catch(err){toast(err.message);}}}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.closest?.('[data-edit]'))e.target.click();});
  window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));
  window.addEventListener('beforeunload',e=>{if(isDirty()){e.preventDefault();e.returnValue='';}});
  $('#ev-search').addEventListener('input',renderEvents);$('#ev-filter').addEventListener('change',renderEvents);
  $('#src-search').addEventListener('input',renderSources);$('#src-filter').addEventListener('change',renderSources);
  $('#ev-new').onclick=()=>openEditor({title:'',source:'notice',verifiedAt:koreaDate(),registration:'unknown',category:'food',uncertain:[]},true);
  $('#edit-form').onsubmit=e=>{e.preventDefault();applyEditor();};
  $('#edit-delete').onclick=()=>{if(!editing?.id||!confirm('이 행사를 목록에서 지울까요? ‘변경 저장’ 전까지는 되돌릴 수 있습니다.'))return;doc.events=doc.events.filter(x=>x.id!==editing.id);$('#edit-dialog').close();render();toast('지웠습니다. ‘변경 저장’을 눌러야 반영됩니다.');};
  $('#tip-to-draft').onclick=()=>{$('#tip-paste-error').textContent='';const t=$('#tip-paste').value.trim();if(!t)return $('#tip-paste-error').textContent='제보 원문을 붙여넣어 주세요.';try{openEditor(draftFromText(t,$('#tip-paste-source').value.trim()),true);}catch(err){$('#tip-paste-error').textContent=err.message;}};
  $('#save-all').onclick=saveDoc;
  $('#discard-all').onclick=()=>{if(confirm('저장하지 않은 변경을 모두 버릴까요?')){doc=JSON.parse(baseText);render();}};
  $('#menu-run').onclick=runMenu;
  $('#token-form').onsubmit=async e=>{
    e.preventDefault();const v=$('#token').value.trim();
    if(v&&!v.startsWith('•')){token=v;sessionStorage.setItem(TOKEN_KEY,v);if($('#token-remember').checked)localStorage.setItem(TOKEN_KEY,v);else localStorage.removeItem(TOKEN_KEY);$('#token').value='••••••••';}
    else if(token){if($('#token-remember').checked)localStorage.setItem(TOKEN_KEY,token);else localStorage.removeItem(TOKEN_KEY);}
    await connect();$('#token-error').textContent=canWrite?'':'저장 권한을 확인하지 못했습니다. 토큰 권한(Contents 쓰기)을 확인해 주세요.';
    if(canWrite){await loadDoc();toast('연결했습니다.');}
  };
  $('#token-clear').onclick=()=>{token='';sessionStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_KEY);$('#token').value='';connect();toast('토큰을 지웠습니다.');};
  setView(location.hash.slice(1)||'tips');
  connect().then(loadDoc);
}
initialize();
