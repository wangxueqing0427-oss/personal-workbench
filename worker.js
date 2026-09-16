export default { async fetch(request, env) {
  const url = new URL(request.url);
  const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type", "Access-Control-Allow-Methods":"GET,POST,OPTIONS" };
  if (request.method === "OPTIONS") return json("", 200, cors);
  if (url.pathname === "/api/ping") return json({ok:true, model:"gpt-5.5"}, 200, cors);
  if (url.pathname !== "/api/assistant" || request.method !== "POST") return json({error:"Not found"}, 404, cors);
  const body = await request.json();
  const system = "You are a personal workbench assistant. Return JSON only, no Markdown. Schema: {tasks:[{title,what,why,dueDate,priority,hospital,department,contact,project,script,detail}]}. Return 1-5 action-first tasks. Split compound records. Infer semantic dates. Use the provided hospital and opportunity records to associate existing entities, but never invent IDs and never overwrite user data. For questions about a hospital, contacts to call this month, or opportunities worth pursuing in 30 days, answer with prioritized tasks based on supplied structured context. Deduplicate equivalent tasks. priority is high, medium, or low.";
  const response = await fetch("https://api.302.ai/v1/chat/completions", {method:"POST", headers:{"Authorization":`Bearer ${env.API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({model:"gpt-5.5",temperature:.2,messages:[{role:"system",content:system},{role:"user",content:JSON.stringify({today:new Date().toISOString().slice(0,10),message:body.message||"",context:body.context||{}})}]})});
  const raw = await response.json(); let result={tasks:[]};
  try { result=JSON.parse(raw.choices?.[0]?.message?.content||"{}"); } catch {}
  return json(result, response.status, cors);
} };
function json(data,status,headers){return new Response(typeof data === "string" ? data : JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}})}
