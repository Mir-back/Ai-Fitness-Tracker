import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'data');
const dbFile = path.join(dataDir, 'fitness-data.json');
const port = Number(process.env.PORT || 4173);
let db = { users: [], sessions: [] };
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon' };

async function saveDb() { await mkdir(dataDir,{recursive:true});const tmp=`${dbFile}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(db,null,2),{mode:0o600});await rename(tmp,dbFile); }
async function loadDb() { try { db=JSON.parse(await readFile(dbFile,'utf8'));if(!Array.isArray(db.users)||!Array.isArray(db.sessions))throw new Error('Invalid database'); } catch(error) { if(error.code!=='ENOENT')console.warn('Could not read saved data; starting with an empty database.');db={users:[],sessions:[]}; } }
function send(res,status,payload,headers={}) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(payload)); }
function jsonBody(req) { return new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>20000){reject(Object.assign(new Error('Request is too large.'),{status:413}));req.destroy();}});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(Object.assign(new Error('Request body must be valid JSON.'),{status:400}));}});req.on('error',reject);}); }
function userData(user) { return { profile:user.profile, workouts:[...user.workouts].sort((a,b)=>new Date(b.date)-new Date(a.date)), recommendation:recommend(user) }; }
function recommend(user) {
  const p=user.profile;const last=[...user.workouts].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];const days=last?Math.floor((Date.now()-new Date(last.date).getTime())/86400000):99;
  if(last&&days<1)return{title:'Nice work showing up today.',copy:'You have already logged a session. Take a moment to recover and let your body adapt.',workout:'Recovery walk + mobility',category:'RECOVERY · LIGHT MOVEMENT',duration:20,tip:'A relaxed walk and a few easy stretches can support recovery after training.'};
  const plans={strength:{beginner:['Full body foundations','STRENGTH · FULL BODY',30],intermediate:['Progressive strength session','STRENGTH · PROGRESSIVE',40],advanced:['Focused strength block','STRENGTH · POWER',50]},endurance:{beginner:['Easy aerobic base','CARDIO · EASY PACE',25],intermediate:['Steady pace intervals','CARDIO · ENDURANCE',35],advanced:['Tempo and threshold','CARDIO · TEMPO',45]},mobility:{beginner:['Move well, feel ready','MOBILITY · FULL BODY',20],intermediate:['Mobility + stability flow','MOBILITY · CONTROL',30],advanced:['Dynamic range session','MOBILITY · PERFORMANCE',35]},weight:{beginner:['Brisk walk + strength basics','MIXED · FOUNDATIONS',30],intermediate:['Full body strength circuit','MIXED · CIRCUIT',35],advanced:['Strength + conditioning','MIXED · CONDITIONING',45]},consistency:{beginner:['Build your foundation','STRENGTH · FULL BODY',30],intermediate:['A balanced full body day','STRENGTH · FULL BODY',35],advanced:['Strong start circuit','STRENGTH · CIRCUIT',40]}};
  const selected=(plans[p.goal]||plans.consistency)[p.experience]||plans.consistency.beginner;
  if(days>=4&&last)return{title:'Ease back into your rhythm.',copy:`It has been ${days} days since your last session. A comfortable ${Math.min(selected[2],25)} minute workout can help you restart without overdoing it.`,workout:'Easy return session',category:'RESTART · KEEP IT COMFORTABLE',duration:Math.min(selected[2],25),tip:'Start lighter than you think you need to. You can build from there.'};
  const equipment=p.equipment==='none'?'using bodyweight only':p.equipment==='gym'?'with full gym options':'using your available equipment';
  return{title:`${selected[0]} is a good fit.`,copy:`For your goal to ${goalLabel(p.goal).toLowerCase()}, try a ${selected[2]} minute session ${equipment}. Keep a steady pace and stop if anything hurts.`,workout:selected[0],category:selected[1],duration:selected[2],tip:p.experience==='beginner'?'Leave a little energy in the tank. The best plan is one you can repeat.':'Focus on smooth technique. Add intensity only when the movement feels controlled.'};
}
function goalLabel(goal){return({consistency:'Build consistency',strength:'Get stronger',endurance:'Improve endurance',mobility:'Move and feel better',weight:'Support weight management'})[goal]||'Build consistency';}
function safeProfile(input,existing={}) { const name=String(input.name??existing.name??'Athlete').trim().slice(0,40)||'Athlete';const experience=['beginner','intermediate','advanced'].includes(input.experience)?input.experience:(existing.experience||'beginner');const goal=['consistency','strength','endurance','mobility','weight'].includes(input.goal)?input.goal:(existing.goal||'consistency');const equipment=['none','dumbbells','gym'].includes(input.equipment)?input.equipment:(existing.equipment||'none');const sessions=Number(input.sessionsPerWeek??existing.sessionsPerWeek??4);return{name,experience,goal,equipment,sessionsPerWeek:Number.isInteger(sessions)?Math.min(6,Math.max(2,sessions)):4};}
async function passwordHash(password,salt= randomBytes(16).toString('hex')) {const key=await scrypt(password,salt,64);return{salt,hash:key.toString('hex')};}
async function makeSession(user) { const token=randomBytes(32).toString('hex');db.sessions=db.sessions.filter(s=>s.userId!==user.id||s.expires>Date.now());db.sessions.push({token,userId:user.id,expires:Date.now()+1000*60*60*24*14});await saveDb();return token; }
function authUser(req) { const value=req.headers.authorization||'';if(!value.startsWith('Bearer '))return null;const session=db.sessions.find(s=>s.token===value.slice(7)&&s.expires>Date.now());return session?db.users.find(u=>u.id===session.userId):null; }
async function serveStatic(req,res,pathname) { let requested=decodeURIComponent(pathname);if(requested==='/'||requested.endsWith('/'))requested+='index.html';const file=path.resolve(root,`.${requested}`);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}try{const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=300'});res.end(content);}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');} }

async function handleApi(req,res,url) {
  const route=url.pathname.replace(/^\/api/,'');
  try {
    if(req.method==='POST'&&route==='/register'){
      const body=await jsonBody(req);const email=String(body.email||'').trim().toLowerCase();const password=String(body.password||'');if(email.length<3||email.length>64||!/^[a-z0-9][a-z0-9._@+-]{2,63}$/i.test(email))return send(res,400,{error:'Use 3–64 letters, numbers, dots, underscores, plus signs, or hyphens for your account ID.'});if(password.length<8||password.length>200)return send(res,400,{error:'Use a password with at least 8 characters.'});if(db.users.some(u=>u.email===email))return send(res,409,{error:'This account already exists. Log in instead.'});const credential=await passwordHash(password);const user={id:randomUUID(),email,credential,profile:safeProfile({name:body.name}),workouts:[],createdAt:new Date().toISOString()};db.users.push(user);const session=await makeSession(user);return send(res,201,{token:session,data:userData(user)});
    }
    if(req.method==='POST'&&route==='/login'){
      const body=await jsonBody(req);const email=String(body.email||'').trim().toLowerCase();const user=db.users.find(u=>u.email===email);if(!user)return send(res,401,{error:'Account ID or password is incorrect.'});const candidate=await passwordHash(String(body.password||''),user.credential.salt);const a=Buffer.from(candidate.hash,'hex'),b=Buffer.from(user.credential.hash,'hex');if(a.length!==b.length||!timingSafeEqual(a,b))return send(res,401,{error:'Account ID or password is incorrect.'});const session=await makeSession(user);return send(res,200,{token:session,data:userData(user)});
    }
    if(req.method==='POST'&&route==='/demo'){
      const user={id:randomUUID(),email:`demo-${randomUUID()}@local`,profile:safeProfile({name:'Alex',goal:'strength',experience:'beginner',equipment:'none',sessionsPerWeek:4}),workouts:[]};db.users.push(user);const session=await makeSession(user);return send(res,201,{token:session,data:userData(user)});
    }
    const user=authUser(req);if(!user)return send(res,401,{error:'Your session has expired. Please log in again.'});
    if(req.method==='GET'&&route==='/me')return send(res,200,{data:userData(user)});
    if(req.method==='GET'&&route==='/recommendations')return send(res,200,{recommendation:recommend(user)});
    if(req.method==='PUT'&&route==='/profile'){const body=await jsonBody(req);user.profile=safeProfile(body,user.profile);await saveDb();return send(res,200,{data:userData(user)});}
    if(req.method==='POST'&&route==='/workouts'){
      const body=await jsonBody(req);const title=String(body.title||'').trim();const duration=Number(body.duration);const effort=Number(body.effort);const allowed=['Strength','Running','Cycling','Yoga','Walking','HIIT','Other'];if(title.length<2||title.length>70)return send(res,400,{error:'Workout name must be between 2 and 70 characters.'});if(!Number.isInteger(duration)||duration<1||duration>300)return send(res,400,{error:'Duration must be between 1 and 300 minutes.'});if(!Number.isInteger(effort)||effort<1||effort>5)return send(res,400,{error:'Choose an effort level from 1 to 5.'});const workout={id:randomUUID(),title,type:allowed.includes(body.type)?body.type:'Other',duration,effort,notes:String(body.notes||'').trim().slice(0,240),date:new Date().toISOString()};user.workouts.push(workout);await saveDb();return send(res,201,{data:userData(user)});
    }
    if(req.method==='DELETE'&&route.startsWith('/workouts/')){const id=decodeURIComponent(route.slice('/workouts/'.length));const oldLength=user.workouts.length;user.workouts=user.workouts.filter(w=>w.id!==id);if(oldLength===user.workouts.length)return send(res,404,{error:'Workout not found.'});await saveDb();return send(res,200,{data:userData(user)});}
    if(req.method==='POST'&&route==='/logout'){const session=(req.headers.authorization||'').slice(7);db.sessions=db.sessions.filter(s=>s.token!==session);await saveDb();return send(res,200,{ok:true});}
    return send(res,404,{error:'API endpoint not found.'});
  }catch(error){console.error('API error:',error);return send(res,error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
}

await loadDb();
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/')){handleApi(req,res,url);return;}serveStatic(req,res,url.pathname);});
server.listen(port,'0.0.0.0',()=>console.log(`Forme Fitness is ready at http://localhost:${port}`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
