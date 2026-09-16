export default { async fetch(request, env) {
  const url = new URL(request.url);
  const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type", "Access-Control-Allow-Methods":"GET,POST,OPTIONS" };
  if (request.method === "OPTIONS") return json("", 200, cors);
  if (url.pathname === "/api/ping") return json({ok:true, model:"gpt-5.5"}, 200, cors);
  if (url.pathname !== "/api/assistant" || request.method !== "POST") return json({error:"Not found"}, 404, cors);
  const body = await request.json();
  const system = "You are a personal workbench task decomposition assistant. Return JSON only, no Markdown. Schema: {tasks:[{title,what,why,dueDate,priority,hospital,department,contact,project,script,detail}]}. Return 1-5 tasks. Titles must start with an action verb and must not repeat the user's sentence. Split compound records into independent actions. Infer semantic timing: today for urgent confirmation, this week for process checks, month-end for month-end commitments, and 7 days before a stated procurement date for a follow-up. Use YYYY-MM-DD dates relative to today. Deduplicate equivalent tasks. Extract hospital, department, contact, and project when present. priority is high, medium, or low.";
  const response = await fetch("https://api.302.ai/v1/chat/completions", {method:"POST", headers:{"Authorization":`Bearer ${env.API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({model:"gpt-5.5",temperature:.2,messages:[{role:"system",content:system},{role:"user",content:JSON.stringify({today:new Date().toISOString().slice(0,10),message:body.message||"",context:body.context||{}})}]})});
  const raw = await response.json(); let result={tasks:[]};
  try { result=JSON.parse(raw.choices?.[0]?.message?.content||"{}"); } catch {}
  return json(result, response.status, cors);
} };
function json(data,status,headers){return new Response(typeof data === "string" ? data : JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}})}
