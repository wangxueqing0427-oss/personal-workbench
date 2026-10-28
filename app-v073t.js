const aiLessons=[
  {title:"认识人工智能：它能做什么，不能做什么",body:"AI 是根据大量数据学习规律的工具，不等于全知全能。它适合帮助你整理、比较、提炼和生成方案，但重要事实仍需要你确认。",practice:"把你最近想让 AI 帮忙的一件事写下来，并补充最终要达到的结果。"},
  {title:"学会写清楚提示词：目标、背景和限制",body:"好的提问通常包含三部分：我要什么、现在有什么信息、有哪些限制。信息越清楚，AI 越容易给出可执行答案。",practice:"把‘帮我处理一下’改写成包含目标、对象和截止时间的一句话。"},
  {title:"让 AI 先给清单，再给解释",body:"当问题复杂时，先要求 AI 输出 3 到 5 条行动清单，再逐条解释原因，可以减少长篇空泛回答。",practice:"让 AI 把一件工作拆成任务名、下一步、截止日期和优先级。"},
  {title:"让 AI 处理照片和文件",body:"上传前先说明用途。让 AI 做摘要、提取字段、识别待办，再由你确认后写入工作台，重要资料不要直接当成事实使用。",practice:"上传一份不敏感的文本或照片，让 AI 提取摘要和 3 个关键词。"},
  {title:"用 AI 做复盘，而不是只做总结",body:"复盘要回答三件事：完成了什么、卡在哪里、下一步做什么。最后一项最重要，因为它能直接进入明日计划。",practice:"用‘完成、问题、下一步’三个标题写今天的复盘。"},
  {title:"学会核验 AI 的回答",body:"对日期、金额、人物、医学和法律信息要特别谨慎。让 AI 标出依据和不确定之处，再用可靠来源或原始文件核对。",practice:"下一次提问时加上：请区分确定信息、推测信息和需要我确认的地方。"},
  {title:"把 AI 变成个人工作流",body:"最有价值的用法不是一次问答，而是形成闭环：记录、整理、生成任务、执行、复盘、安排下一步。",practice:"选择一件重复工作，写出它的记录、处理、执行和复盘四个步骤。"}
];
function lessonState(){if(!state.learning)state.learning={completedDates:[],reviews:[],lessonIndex:0,history:[]};if(!Array.isArray(state.learning.completedDates))state.learning.completedDates=[];if(!Array.isArray(state.learning.history))state.learning.history=[];return state.learning}
function currentLesson(){const learning=lessonState();return aiLessons[Math.min(Number(learning.lessonIndex)||0,aiLessons.length-1)]}
function dailyLearningCard(){const learning=lessonState();const lesson=currentLesson();const done=learning.completedDates.includes(today());const progress=Math.min(Number(learning.lessonIndex)||0,aiLessons.length);return `<section class="card"><div class="row"><div><h2>今日 AI 小课堂</h2><div class="small">从零开始，每天掌握一个能马上用在工作台里的方法。</div></div><span class="tag ${done?"green":""}">${done?"今日已完成":`第 ${progress+1} / ${aiLessons.length} 课`}</span></div><h3>${esc(lesson.title)}</h3><p class="muted">${esc(lesson.body)}</p><div class="action-line"><b>今日练习</b><span>${esc(lesson.practice)}</span></div><div class="actions"><button class="btn" onclick="completeLessonV073()">${done?"今天已学会":"标记今天学会"}</button><button class="btn secondary" onclick="showLessonProgress()">学习进度</button></div>${feedback.lesson?`<div class="feedback">✓ ${esc(feedback.lesson)}</div>`:""}</section>`}
function completeLessonV073(){const learning=lessonState();if(!learning.completedDates.includes(today())){learning.completedDates.push(today());learning.history.unshift({date:today(),index:Number(learning.lessonIndex)||0,title:currentLesson().title});learning.lessonIndex=Math.min((Number(learning.lessonIndex)||0)+1,aiLessons.length-1);save();feedback.lesson="已完成今天的学习，明天进入下一课"}else{feedback.lesson="今天已经完成，可以继续做今日练习"}render()}
function showLessonProgress(){const learning=lessonState();feedback.lesson=`已完成 ${learning.history.length} 课，共 ${aiLessons.length} 课；当前学习第 ${Math.min((Number(learning.lessonIndex)||0)+1,aiLessons.length)} 课`;render()}
const homeV072=homeView;
homeView=function(){return homeV072()}
render();
