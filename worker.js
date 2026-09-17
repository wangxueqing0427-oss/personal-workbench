export default { async fetch(request, env) {
  const url = new URL(request.url);
  const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type", "Access-Control-Allow-Methods":"GET,POST,OPTIONS" };
  if (request.method === "OPTIONS") return json("", 200, cors);
  if (url.pathname === "/api/ping") return json({ok:true, model:"gpt-5.5"}, 200, cors);
  if (url.pathname !== "/api/assistant" || request.method !== "POST") return json({error:"Not found"}, 404, cors);
  const body = await request.json();
  const system = "You are the AI business assistant in a personal workbench. Respond in Chinese and return JSON only. When mode is business_query, return {answer:string, citations:[{entityType,entityName}]} using ONLY the supplied structured context; include the matching hospital/contact, opportunities, unfinished tasks, future radar, and next steps as relevant. Do not invent records or claim missing data exists. Handle queries such as a hospital status, who needs contact this month, this week/month priorities, and opportunities to advance within 30 days. When mode is task_extract, return {tasks:[{title,what,why,dueDate,priority,hospital,department,contact,project,script,detail}]}; return 1-5 action-first tasks, split compound notes, infer dates relative to today, associate existing entities only, and never modify supplied records. priority is high, medium, or low.";
  const response = await fetch("https://api.302.ai/v1/chat/completions", {method:"POST", headers:{"Authorization":`Bearer ${env.API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({model:"gpt-5.5",temperature:.2,messages:[{role:"system",content:system},{role:"user",content:JSON.stringify({mode:body.mode||"task_extract",today:new Date().toISOString().slice(0,10),message:body.message||"",context:body.context||{}})}]})});
  const raw = await response.json(); let result={tasks:[]};
  try { result=JSON.parse(raw.choices?.[0]?.message?.content||"{}"); } catch {}
  return json(result, response.status, cors);
} };
function json(data,status,headers){return new Response(typeof data === "string" ? data : JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}})}
