WORKBENCH_LATEST_VERSION="1.4.0";
WORKBENCH_STABLE_QUERY="1400925b";

var hospitalSelectedV140u="";

function hospitalDirectoryV140u(){
  var names=new Set(hospitalNamesV140());
  (Array.isArray(state.hospitals)?state.hospitals:[]).forEach(function(item){if(item.name)names.add(String(item.name).trim())});
  return Array.from(names).filter(Boolean).sort(function(left,right){return left.localeCompare(right,"zh-CN")});
}
function hospitalOpenV140u(name){hospitalSelectedV140u=name;go("hospital-detail")}
function customersView(){
  var hospitals=hospitalDirectoryV140u();
  return '<section class="card"><div class="row"><div><h2>客户 / 医院</h2><p class="muted">按医院查看合同项目与业务推进项目。</p></div><button class="btn secondary" onclick="businessOpenFormV140()">＋ 新建业务项目</button></div><div class="hospital-directory-v140u">'+(hospitals.map(function(name){
    var contracts=contractProjectsV138().filter(function(item){return item.hospital===name}).length;
    var business=businessProjectsV140().filter(function(item){return item.hospital===name}).length;
    return '<button class="hospital-row-v140u" onclick="hospitalOpenV140u(&quot;'+esc(name)+'&quot;)"><strong>'+esc(name)+'</strong><span>合同 '+contracts+' 项 · 业务推进 '+business+' 项　›</span></button>';
  }).join('')||'<p class="muted">暂无医院。可先新建业务项目。</p>')+'</div></section>';
}
function hospitalDetailV140u(){
  var name=hospitalSelectedV140u;
  if(!name)return '<section class="card"><p>请先选择医院。</p><button class="btn secondary" onclick="go(\'customers\')">返回医院列表</button></section>';
  var contracts=contractProjectsV138().filter(function(item){return item.hospital===name});
  var business=businessProjectsV140().filter(function(item){return item.hospital===name});
  return '<section class="card"><button class="btn secondary" onclick="go(\'customers\')">← 返回医院列表</button><h2>'+esc(name)+'</h2><p class="muted">合同 '+contracts.length+' 项 · 业务推进 '+business.length+' 项</p><button class="btn" onclick="businessOpenFormV140(&quot;&quot;,&quot;'+esc(name)+'&quot;)">＋ 新增本院业务推进项目</button></section>'+
    '<section class="card"><h2>合同项目</h2>'+(contracts.map(function(item){var action=contractActionV139(item);return '<div class="hospital-project-v140u"><div><strong>'+esc(item.name)+'</strong><p class="muted">'+esc(action&&action.currentStatus||item.status)+' · 合同金额 '+contractMoneyV138(item.contractAmount)+' · 已收 '+contractMoneyV138(item.receivedAmount)+' · 未收 '+contractMoneyV138(item.unpaidAmount)+'</p></div><button class="btn secondary" onclick="contractOpenDetailV139(&quot;'+esc(item.id)+'&quot;)">查看行动</button></div>'}).join('')||'<p class="muted">暂无合同项目。</p>')+'</section>'+
    '<section class="card"><h2>业务推进项目</h2>'+(business.map(function(item){var action=contractActionV139(item)||{};return '<div class="hospital-project-v140u"><div><strong>'+esc(item.name)+'</strong><p class="muted">'+esc(action.currentStatus||'未填写状态')+(action.followupDate?' · 下次跟进 '+esc(action.followupDate):'')+'</p>'+(action.nextAction?'<p>下一步：'+esc(action.nextAction)+'</p>':'')+'</div><button class="btn secondary" onclick="contractOpenDetailV139(&quot;'+esc(item.id)+'&quot;)">查看 / 编辑</button></div>'}).join('')||'<p class="muted">暂无业务推进项目。</p>')+'</section>';
}

const pageViewBaseV140u=pageView;
pageView=function(){return page==="hospital-detail"?hospitalDetailV140u():pageViewBaseV140u()};

var hospitalStylesV140u=document.createElement("style");
hospitalStylesV140u.textContent='.hospital-directory-v140u{display:grid;gap:8px}.hospital-row-v140u{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;border:1px solid #dce7f2;border-radius:12px;background:#fff;padding:14px;color:#173c5b;cursor:pointer;font:inherit}.hospital-row-v140u span{color:#607a90;font-size:13px}.hospital-row-v140u:hover{border-color:#2475c6;background:#f3f8ff}.hospital-project-v140u{display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid #e1eaf2;padding:14px 0}.hospital-project-v140u p{margin:5px 0}.hospital-project-v140u .btn{flex-shrink:0}@media(max-width:650px){.hospital-row-v140u,.hospital-project-v140u{align-items:flex-start;flex-direction:column}.hospital-row-v140u span{font-size:12px}}';
document.head.appendChild(hospitalStylesV140u);

const renderBaseV140u=render;
render=function(){renderBaseV140u();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.4.0 · 医院入口修正版"};
render();
