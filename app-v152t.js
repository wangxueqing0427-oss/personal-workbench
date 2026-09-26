WORKBENCH_LATEST_VERSION='1.5.2';
WORKBENCH_STABLE_QUERY='1520926';
function fileReviewV152(item){
  var draft=item.organizationDraftV151;
  if(!draft)return '';
  var project=workbenchProjectsV150().find(function(entry){return entry.id===draft.projectId});
  return '<section><h4>文件整理信息</h4><p>文件类型：'+esc(item.name&&item.name.includes('.')?item.name.split('.').pop().toUpperCase():item.type||'待核对')+'</p><p>关联医院 / 项目：以本卡片下方的项目选择为准；候选 '+esc(project?project.hospital+' → '+project.name:'未匹配，请手工选择')+'</p><p>提取的重要信息：请核对下方整理内容。</p><label>建议下一步（仅草稿，不是任务）<textarea class="field" id="suggestion-'+esc(item.id)+'" rows="3" placeholder="无明确行动建议时留空">'+esc(draft.nextStep||'')+'</textarea></label><p class="muted">生成资料包不会创建任务或改变行动。确认下方医院/项目后，可单独将建议写入项目下一步；已有下一步会再次询问是否替换，不改变状态、日期或时间线。</p><button class="btn secondary" onclick="confirmSuggestionV152(&quot;'+esc(item.id)+'&quot;)">确认写入项目下一步</button></section>';
}
function confirmSuggestionV152(id){
  var selected=document.getElementById('package-project-'+id),input=document.getElementById('suggestion-'+id);
  var project=workbenchProjectsV150().find(function(entry){return selected&&entry.id===selected.value}),text=input&&input.value.trim();
  if(!project||!text){alert('请选择已有项目，并填写或核对建议下一步。');return}
  var action=contractActionV139(project)||{};
  if(!confirm('确认写入 '+project.hospital+' → '+project.name+' 的下一步？\n原下一步：'+(action.nextAction||'未填写')+'\n新下一步：'+text+'\n不修改状态、日期和时间线。'))return;
  var previous=state.contractActionsV139;
  state.contractActionsV139=Object.assign({},previous||{});
  state.contractActionsV139[contractActionKeyV139(project)]=Object.assign({},action,{nextAction:text});
  try{save();fileMessageV151='已按你的确认更新项目下一步；未创建新任务。'}catch(error){state.contractActionsV139=previous;fileMessageV151='保存失败，原行动未改动。'}
  render();
}
const inboxBaseV152=inboxPanel;
inboxPanel=function(){
  var html=inboxBaseV152();
  (state.inbox||[]).forEach(function(item){if(!item.organizationDraftV151)return;var marker='<label>资料类型<select class="field" id="package-type-'+esc(item.id)+'">';html=html.replace(marker,fileReviewV152(item)+marker)});
  return html;
};
const renderBaseV152=render;
render=function(){renderBaseV152();var subtitle=document.querySelector('.top p');if(subtitle)subtitle.textContent='V1.5.2 · 资料整理与行动确认';};
render();

