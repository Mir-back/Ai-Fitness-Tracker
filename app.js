const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const LOCAL_KEY = 'forme.fitness.demo.v1';
const SESSION_KEY = 'forme.fitness.session.v1';
const profileDefaults = { name: 'Athlete', goal: 'consistency', experience: 'beginner', equipment: 'none', sessionsPerWeek: 4 };
let state = { profile: { ...profileDefaults }, workouts: [] };
let token = localStorage.getItem(SESSION_KEY) || '';
let localMode = false;
let authMode = 'register';

function readLocal() {
  try { const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); return { profile: { ...profileDefaults, ...(value.profile || {}) }, workouts: Array.isArray(value.workouts) ? value.workouts : [] }; }
  catch { return { profile: { ...profileDefaults }, workouts: [] }; }
}
function saveLocal() { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); }
function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`/api${path}`, { ...options, headers }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  });
}
function setMessage(id, message, kind = '') { const node = $(`#${id}`); node.textContent = message; node.className = `form-message${kind ? ` ${kind}` : ''}`; }
function initials(name) { return (name || 'A').trim().slice(0, 1).toUpperCase(); }
function dateKey(date = new Date()) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function mondayOf(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d; }
function safeText(text) { return String(text || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]); }
function goalText(goal) { return ({ consistency:'Build consistency', strength:'Get stronger', endurance:'Improve endurance', mobility:'Move and feel better', weight:'Support weight management' })[goal] || 'Build consistency'; }
function makeRecommendation() {
  const p = state.profile;
  const workouts = state.workouts;
  const last = workouts[0];
  const sinceLast = last ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000) : 99;
  if (last && sinceLast < 1) return { title:'Nice work showing up today.', copy:'You have already logged a session. Take a moment to recover and let your body adapt.', workout:'Recovery walk + mobility', category:'RECOVERY · LIGHT MOVEMENT', duration:20, tip:'A relaxed walk and a few easy stretches can support recovery after training.' };
  const plans = {
    strength:{ beginner:['Full body foundations','STRENGTH · FULL BODY',30], intermediate:['Progressive strength session','STRENGTH · PROGRESSIVE',40], advanced:['Focused strength block','STRENGTH · POWER',50] },
    endurance:{ beginner:['Easy aerobic base','CARDIO · EASY PACE',25], intermediate:['Steady pace intervals','CARDIO · ENDURANCE',35], advanced:['Tempo and threshold','CARDIO · TEMPO',45] },
    mobility:{ beginner:['Move well, feel ready','MOBILITY · FULL BODY',20], intermediate:['Mobility + stability flow','MOBILITY · CONTROL',30], advanced:['Dynamic range session','MOBILITY · PERFORMANCE',35] },
    weight:{ beginner:['Brisk walk + strength basics','MIXED · FOUNDATIONS',30], intermediate:['Full body strength circuit','MIXED · CIRCUIT',35], advanced:['Strength + conditioning','MIXED · CONDITIONING',45] },
    consistency:{ beginner:['Build your foundation','STRENGTH · FULL BODY',30], intermediate:['A balanced full body day','STRENGTH · FULL BODY',35], advanced:['Strong start circuit','STRENGTH · CIRCUIT',40] },
  };
  const chosen = (plans[p.goal] || plans.consistency)[p.experience] || plans.consistency.beginner;
  if (sinceLast >= 4 && last) return { title:'Ease back into your rhythm.', copy:`It has been ${sinceLast} days since your last session. A comfortable ${chosen[2]} minute workout can help you restart without overdoing it.`, workout:'Easy return session', category:'RESTART · KEEP IT COMFORTABLE', duration:Math.min(chosen[2],25), tip:'Start lighter than you think you need to. You can build from there.' };
  const equipmentNote = p.equipment === 'none' ? 'using bodyweight only' : p.equipment === 'gym' ? 'with full gym options' : 'using your available equipment';
  return { title:`${chosen[0]} is a good fit.`, copy:`For your goal to ${goalText(p.goal).toLowerCase()}, try a ${chosen[2]} minute session ${equipmentNote}. Keep a steady pace and stop if anything hurts.`, workout:chosen[0], category:chosen[1], duration:chosen[2], tip:p.experience === 'beginner' ? 'Leave a little energy in the tank. The best plan is one you can repeat.' : 'Focus on smooth technique. Add intensity only when the movement feels controlled.' };
}
function weekWorkouts() { const monday = mondayOf(); return state.workouts.filter((workout) => new Date(workout.date) >= monday); }
function renderRows(workouts, target) {
  const root = $(target);
  if (!workouts.length) { root.innerHTML = `<div class="empty-state"><span>⌁</span><div><strong>${target === '#history-list' ? 'No workouts yet' : 'Your story starts here'}</strong><small>${target === '#history-list' ? 'Your logged sessions will show up here.' : 'Log your first workout to see your progress.'}</small></div>${target !== '#history-list' ? '<button class="text-button" data-action="log">Add workout <span>↗</span></button>' : ''}</div>`; return; }
  root.innerHTML = workouts.map((w) => `<div class="workout-row"><span class="workout-row-icon">${w.type === 'Running' ? '↗' : w.type === 'Yoga' ? '✳' : '⌁'}</span><div class="workout-row-main"><strong>${safeText(w.title)}</strong><small>${safeText(w.type)} · ${new Date(w.date).toLocaleDateString(undefined,{month:'short',day:'numeric'})}${w.notes ? ` · ${safeText(w.notes)}` : ''}</small></div><span class="workout-row-duration">${Number(w.duration)}<small>min</small></span><button class="delete-workout" data-delete="${safeText(w.id)}" aria-label="Delete ${safeText(w.title)}" title="Delete workout">×</button></div>`).join('');
}
function render() {
  const p = state.profile; const rec = state.recommendation || makeRecommendation(); const thisWeek = weekWorkouts();
  const minutes = thisWeek.reduce((sum,w) => sum + Number(w.duration || 0), 0); const sessions = thisWeek.length; const goal = Number(p.sessionsPerWeek || 4);
  $('#user-name').textContent = p.name || 'Athlete'; $('#user-avatar').textContent = initials(p.name); $('.profile-initial').textContent = initials(p.name); $('#greeting-name').textContent = (p.name || 'athlete').split(' ')[0];
  $('#workout-count').textContent = state.workouts.length; $('#side-progress').innerHTML = `${sessions} <i>/ ${goal} sessions</i>`; $('#side-progress-bar').style.width = `${Math.min(100, sessions/goal*100)}%`;
  $('#week-sessions').textContent = sessions; $('#active-minutes').textContent = minutes; $('#sessions-progress').textContent = `${Math.min(100, Math.round(sessions/goal*100))}% complete`;
  $('#streak-days').textContent = calculateStreak(); $('#streak-value').textContent = `${calculateStreak()} ${calculateStreak() === 1 ? 'day' : 'days'}`;
  $('#streak-message').textContent = calculateStreak() ? 'A strong habit is taking shape.' : 'Start your streak with a workout today.';
  $('#hero-recommendation').textContent = rec.copy; $('#next-workout-title').textContent = rec.workout; $('#next-category').textContent = rec.category; $('#next-workout-meta').innerHTML = `${rec.duration} min <span>·</span> ${p.experience === 'beginner' ? 'Beginner friendly' : `${p.experience[0].toUpperCase()}${p.experience.slice(1)} plan`}`;
  $('#coach-title').textContent = rec.title; $('#coach-copy').textContent = rec.copy; $('#coach-tip').textContent = rec.tip; $('#focus-goal').textContent = goalText(p.goal); $('#focus-description').textContent = `${p.experience[0].toUpperCase()}${p.experience.slice(1)} · ${p.sessionsPerWeek} sessions a week · ${p.equipment === 'none' ? 'Bodyweight' : p.equipment === 'gym' ? 'Full gym' : 'Dumbbells / bands'}`;
  $$('.streak-dots i').forEach((dot,i) => dot.classList.toggle('done',i < Math.min(7,sessions)));
  const counts = Array(7).fill(0); thisWeek.forEach((w) => { const day = (new Date(w.date).getDay()+6)%7; counts[day] += Number(w.duration || 0); });
  const max = Math.max(30,...counts); $$('.chart-bar').forEach((bar,i) => { const pct = counts[i] ? Math.max(10,counts[i]/max*85) : 0; bar.style.setProperty('--bar-height',`${pct}%`); bar.classList.toggle('has-workout',counts[i] > 0); bar.classList.toggle('today',i === (new Date().getDay()+6)%7); });
  const active = thisWeek.length ? Math.min(7,new Set(thisWeek.map(w=>dateKey(w.date))).size) : 0; $$('.metric-bars i').forEach((bar,i) => bar.classList.toggle('done',i < active));
  renderRows(state.workouts.slice(0,4),'#recent-list'); renderRows(state.workouts,'#history-list'); $('#history-total').textContent = `${state.workouts.length} ${state.workouts.length === 1 ? 'session' : 'sessions'}`;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; const count = Number(p.sessionsPerWeek||4); const trainingDays = count === 2 ? [1,4] : count === 3 ? [0,2,5] : count === 4 ? [0,2,4,6] : count === 5 ? [0,1,3,4,6] : [0,1,2,4,5,6];
  $('#plan-days').innerHTML = days.map((day,i) => `<article class="plan-day ${trainingDays.includes(i)?'training':''} ${i===(new Date().getDay()+6)%7?'today':''}"><span class="day-name">${day.toUpperCase()}</span><strong>${trainingDays.includes(i) ? (i%2===0?'Training':'Move') : (i===3?'Rest':'Recover')}</strong><small>${trainingDays.includes(i)?`${i%2===0?'Strength':'Easy movement'}`:'Take it easy'}</small></article>`).join('');
}
function calculateStreak() {
  const days = new Set(state.workouts.map(w=>dateKey(w.date))); let cursor = new Date(); if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate()-1); let streak=0; while (days.has(dateKey(cursor)) && streak < 365) { streak++; cursor.setDate(cursor.getDate()-1); } return streak;
}
function openModal(id) { const modal = $(`#${id}`); modal.hidden=false; document.body.classList.add('modal-open'); const input=$('input:not([type=range]),select',modal); input?.focus(); }
function closeModal(modal) { modal.hidden=true; if (!$$('.modal-backdrop:not([hidden])').length) document.body.classList.remove('modal-open'); }
function setAuthMode(mode) { authMode=mode; $$('.auth-tab').forEach((tab) => { const active=tab.dataset.authMode===mode; tab.classList.toggle('active',active); }); $('#auth-title').innerHTML=mode==='login'?'Welcome<br><span>back.</span>':'Meet your<br><span>stronger self.</span>'; $('.modal-intro', $('#auth-modal')).textContent=mode==='login'?'Log in to continue your training journey.':'Create an account to save workouts and get recommendations that fit you.'; $('#auth-submit-label').textContent=mode==='login'?'Log in':'Create my account'; $('#auth-form [name=name]').hidden=mode==='login'; $('#auth-form [name=name]').required=mode!=='login'; $('#auth-form [name=password]').autocomplete=mode==='login'?'current-password':'new-password'; $('#auth-form [name=password]').minLength=mode==='login'?1:8; setMessage('auth-message','Your workouts are saved to this server on this device.'); }
function showAuth() { openModal('auth-modal'); document.body.classList.add('auth-required'); setAuthMode(token?'login':'register'); }
async function startDemo() { try { const result = await api('/demo',{method:'POST',body:'{}'}); token=result.token; localStorage.setItem(SESSION_KEY,token); state=result.data; localMode=false; } catch { localMode=true; token=''; state=readLocal(); } $('#server-status').textContent=localMode?'Browser demo mode':'Server connected'; closeModal($('#auth-modal')); document.body.classList.remove('auth-required'); render(); }
async function load() {
  try { if(!token) throw new Error('Sign in'); const data=await api('/me'); state=data.data; localMode=false; $('#server-status').textContent='Server connected'; render(); }
  catch { token=''; localStorage.removeItem(SESSION_KEY); state=readLocal(); localMode=true; $('#server-status').textContent='Browser demo mode'; render(); showAuth(); }
}
function switchView(view) { $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`)); $$('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); $('#current-section').textContent=({overview:'Overview',workouts:'Workouts',coach:'AI Coach'})[view]||'Overview'; $('#sidebar').classList.remove('open'); window.scrollTo({top:0,behavior:'smooth'}); }
document.addEventListener('click',async(event)=>{
  const viewButton=event.target.closest('[data-view]'); if(viewButton){switchView(viewButton.dataset.view);return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='log'){openModal('workout-modal');return;} if(action==='coach'){switchView('coach');return;} if(action==='profile'){const f=$('#profile-form'); for(const [key,value] of Object.entries(state.profile)) if(f.elements[key]) f.elements[key].value=value; $('#sessions-value').textContent=`${state.profile.sessionsPerWeek||4} days`; openModal('profile-modal');return;}
  const del=event.target.closest('[data-delete]'); if(del){const id=del.dataset.delete;try{if(!localMode) await api(`/workouts/${encodeURIComponent(id)}`,{method:'DELETE'});state.workouts=state.workouts.filter(w=>String(w.id)!==id);saveLocal();render();}catch(error){alert(error.message);}return;}
  const close=event.target.closest('[data-close]');if(close){closeModal(close.closest('.modal-backdrop'));return;}
  const tab=event.target.closest('[data-auth-mode]');if(tab){setAuthMode(tab.dataset.authMode);return;}
});
$$('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeModal(backdrop);}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')$$('.modal-backdrop:not([hidden])').forEach(closeModal);});
$('#menu-button').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#profile-button').addEventListener('click',()=>document.querySelector('[data-action="profile"]').click());
$('#profile-form [name=sessionsPerWeek]').addEventListener('input',event=>$('#sessions-value').textContent=`${event.target.value} days`);
$('#demo-button').addEventListener('click',startDemo);
$('#logout-button').addEventListener('click',async()=>{try{if(!localMode)await api('/logout',{method:'POST',body:'{}'});}catch{} token='';localStorage.removeItem(SESSION_KEY);state=readLocal();render();showAuth();});
$('#auth-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;if(!f.reportValidity())return;const submit=$('.submit-button',f);submit.disabled=true;setMessage('auth-message','Connecting…');const payload={email:f.elements.email.value.trim(),password:f.elements.password.value,name:f.elements.name.value.trim()||'Athlete'};
  try{const result=await api(authMode==='register'?'/register':'/login',{method:'POST',body:JSON.stringify(payload)});token=result.token;localStorage.setItem(SESSION_KEY,token);state=result.data;localMode=false;$('#server-status').textContent='Server connected';closeModal($('#auth-modal'));document.body.classList.remove('auth-required');render();}
  catch(error){if(error.message.startsWith('Failed to fetch')||error.message.includes('NetworkError')||error.message==='Request failed (404)'){localMode=true;state=readLocal();if(authMode==='register'){state.profile.name=payload.name;saveLocal();}$('#server-status').textContent='Browser demo mode';closeModal($('#auth-modal'));document.body.classList.remove('auth-required');render();}else setMessage('auth-message',error.message,'error');}
  finally{submit.disabled=false;}
});
$('#workout-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;if(!f.reportValidity())return;const payload={title:f.elements.title.value.trim(),type:f.elements.type.value,duration:Number(f.elements.duration.value),effort:Number(f.elements.effort.value),notes:f.elements.notes.value.trim()};try{let workout;if(localMode){workout={...payload,id:crypto.randomUUID(),date:new Date().toISOString()};state.workouts.unshift(workout);saveLocal();}else{const result=await api('/workouts',{method:'POST',body:JSON.stringify(payload)});state=result.data;}closeModal($('#workout-modal'));f.reset();f.elements.duration.value=30;setMessage('workout-message','');render();switchView('overview');}catch(error){setMessage('workout-message',error.message,'error');}});
$('#profile-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;const profile={name:f.elements.name.value.trim(),experience:f.elements.experience.value,goal:f.elements.goal.value,equipment:f.elements.equipment.value,sessionsPerWeek:Number(f.elements.sessionsPerWeek.value)};try{if(!localMode){const result=await api('/profile',{method:'PUT',body:JSON.stringify(profile)});state=result.data;}else{state.profile={...state.profile,...profile};saveLocal();}closeModal($('#profile-modal'));render();}catch(error){setMessage('profile-message',error.message,'error');}});
$('#activity-period').addEventListener('change',()=>{render();});
$$('.auth-tab').forEach(button=>button.addEventListener('click',()=>setAuthMode(button.dataset.authMode)));
const d=new Date();const dateOptions={weekday:'long',month:'long',day:'numeric'};document.querySelector('.welcome-row .eyebrow').innerHTML=`<span class="pulse"></span> ${d.toLocaleDateString('en-US',dateOptions).toUpperCase()}`;
load();
