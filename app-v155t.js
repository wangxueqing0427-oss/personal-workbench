WORKBENCH_LATEST_VERSION='1.5.5';
WORKBENCH_STABLE_QUERY='1550926';
function standardHospitalV155(item){
  var hospitals=hospitalNamesV140(),matches=hospitals.filter(function(name){return hospitalV154(name)===hospitalV154(item.hospital)});
  return matches.length===1?matches[0]:'';
}
function matterV155(sourceId,matterId){var source=(state.inbox||[]).find(function(entry){return entry.id===sourceId});return source&&source.meetingV154&&source.meetingV154.items.find(function(entry){return entry.id===matterId})}
function chooseMatterV155(sourceId,matterId,mode){
  var key=sourceId+'-'+matterId,item=matterV155(sourceId,matterId);if(!item)return;
  if(mode==='new'){
    businessOpenFormV140('',standardHospitalV155(item));
    var name=document.getElementById('business-name-v140'),description=document.getElementById('business-description-v140');
    if(name)name.value=item.project||'';
    if(description)description.value='会议事项草稿（请核对）：'+item.progress+'\n原文医院：'+item.hospital+'\n依据：'+item.evidence;
    return;
  }
  document.getElementById('category-'+key).value=mode==='update'?'更新已有项目':'仅供记录，无需形成项目';
  var panel=document.getElementById('update-'+key);panel.hidden=mode!=='update';
  if(mode==='record'){document.getElementById('timeline-'+key).checked=false;confirmMatterV154(sourceId,matterId)}
}
meetingPanelV154=function(source){
  return '<article class="card"><h3>'+esc(source.name)+'</h3><p>资料类型：'+esc(source.meetingV154.documentType)+' · 逐项核对，选择操作后才保存</p><button class="btn secondary" onclick="downloadOriginalV151(&quot;'+esc(source.id)+'&quot;)">下载原图</button><details><summary>查看OCR正文</summary><div style="white-space:pre-wrap">'+esc(source.meetingV154.ocr)+'</div></details>'+source.meetingV154.items.map(function(item){
    var key=source.id+'-'+item.id,candidates=candidatesV154(item,workbenchProjectsV150()),hospital=standardHospitalV155(item),done=(state.meetingConfirmationsV154||[]).find(function(entry){return entry.id===key});
    var recommendation=item.historical?'仅记录':candidates.length?'更新已有项目':item.actionNeeded===false?'仅记录':'可能的新业务/商机';
    var call='&quot;'+esc(source.id)+'&quot;,&quot;'+esc(item.id)+'&quot;,';
    return '<section class="list-item business-matter-v155"><p class="muted">'+esc(hospital||item.hospital||'医院待核对')+(hospital?'':'（原文名称，关联时需核对正式名称）')+'</p><h4>'+esc(item.project||'事项待核对')+'</h4><p>'+esc(item.progress||'进展待核对')+'</p><p class="muted">建议：'+esc(item.nextStep||'暂无明确下一步')+(item.date?' · '+esc(item.date):'')+'</p><details><summary>人物与原文依据</summary><p>'+esc(item.people||'未提及')+'</p><p>'+esc(item.evidence)+'</p><p>原文医院：'+esc(item.hospital)+'</p></details>'+(done?'<p>已确认：'+esc(done.category)+'</p>':'<p>建议处理：'+recommendation+'（尚未保存）</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" onclick="chooseMatterV155('+call+'&quot;update&quot;)">更新已有项目</button><button class="btn secondary" onclick="chooseMatterV155('+call+'&quot;new&quot;)">新建业务/商机</button><button class="btn secondary" onclick="chooseMatterV155('+call+'&quot;record&quot;)">仅记录</button></div><input type="hidden" id="category-'+esc(key)+'" value="更新已有项目"><div id="update-'+esc(key)+'" hidden><p>仅关联资料，核心状态、日期和下一步保持不变。</p>'+candidates.map(function(candidate){return '<p>'+esc(candidate.hospital+' → '+candidate.name)+'<br><small>'+esc(candidate.reason)+'</small></p>'}).join('')+'<label>选择已有项目<select class="field" id="project-'+esc(key)+'"><option value="">请选择正式项目</option>'+candidates.map(function(candidate){return candidate.projects.map(function(project){return '<option value="'+esc(project.id)+'">'+esc(project.hospital+' → '+project.name+(candidate.projects.length>1?'｜合同 '+(project.contractNumber||'无编号')+'｜'+project.id:''))+'</option>'}).join('')}).join('')+'</select></label>'+(!candidates.length?'<p>暂无可靠候选，请先核对医院与项目，不按泛关键词强行关联。</p>':'')+'<label><input type="checkbox" id="timeline-'+esc(key)+'"> 同时补充时间线（可选）</label><button class="btn" onclick="confirmMatterV154(&quot;'+esc(source.id)+'&quot;,&quot;'+esc(item.id)+'&quot;)">确认关联资料</button></div>')+'</section>';
  }).join('')+'</article>';
};
const businessSaveBaseV155=businessSaveProjectV140;
businessSaveProjectV140=function(){
  if(!businessDraftIdV140){var hospital=businessFieldV140('business-hospital-v140'),name=businessFieldV140('business-name-v140');
    var formal=hospitalNamesV140().filter(function(entry){return hospitalV154(entry)===hospitalV154(hospital)});
    if(formal.length===1){hospital=formal[0];document.getElementById('business-hospital-v140').value=hospital}
    if(workbenchProjectsV150().some(function(project){return hospitalV154(project.hospital)===hospitalV154(hospital)&&normalizeV154(project.name)===normalizeV154(name)})){businessShowMessageV140('已有同院同名项目，请返回选择更新已有项目，避免重复创建。');return}
  }
  return businessSaveBaseV155();
};
const renderBaseV155=render;
render=function(){renderBaseV155();var subtitle=document.querySelector('.top p');if(subtitle)subtitle.textContent='V1.5.5 · 简洁业务事项卡片';};
render();

