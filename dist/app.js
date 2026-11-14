let state=initial(),started=false,feedback=false;
const app=document.getElementById('app');
function render(){
 if(!started){app.innerHTML='<section class="panel welcome"><h2>You are the commander.</h2><p>Keep power, life support and crew safety healthy. Collect and transmit research, and help the greenhouse reach harvest. Read each trade-off before you choose.</p><button id="start">Begin your mission →</button><p class="muted">Ages 7–12 · About 5 minutes · Replay to try a new strategy</p></section>';document.getElementById('start').onclick=()=>{started=true;render();};return;}
 const bars=[['power','Power','Stored energy'],['life','Life support','Air & water systems'],['safety','Crew safety','Protection & readiness']].map(([key,label,desc])=>`<article class="meter"><span>${label}</span><strong>${state[key]}<small>/100</small></strong><progress value="${state[key]}" max="100" aria-label="${label}"></progress><p>${desc} · ${state[key]<25?'Critical':state[key]<50?'Watch closely':'Stable'}</p></article>`).join('');
 let content='';
 if(feedback){const last=state.log.at(-1);content=`<section class="panel" tabindex="-1" id="focus"><p class="eyebrow">DAY ${last.day} / DECISION COMPLETE</p><h2>${last.choice}</h2><ul>${last.notes.map(n=>`<li>${n}</li>`).join('')}</ul><aside><h3>Why this matters in real life</h3><p>${last.why}</p></aside><button id="next">${state.ended?'View mission report':'Continue to day '+(state.day+1)} →</button></section>`;}
 else if(state.ended){content=`<section class="panel" tabindex="-1" id="focus"><p class="eyebrow">MISSION REPORT</p><h2>${outcome(state)}</h2><p>${state.life===0||state.safety===0?'A critical system reached zero. Mission control ended the mission early. Try preparing systems and keeping more energy in reserve.':'Your crew completed seven days. Review how your decisions shaped the outpost.'}</p><p>Research transmitted ${state.flags.includes('sent')?'✓':'—'} &nbsp; Crop harvested ${state.flags.includes('food')?'✓':'—'}</p>${state.log.map(l=>`<details><summary>Day ${l.day} · ${l.choice}</summary><p>${l.notes.join(' ')}</p></details>`).join('')}<button id="restart">Try a new strategy ↻</button></section>`;}
 else {const d=days[state.day];content=`<section class="panel" tabindex="-1" id="focus"><p class="eyebrow">DAY ${state.day+1} OF 7 · FOUR CREW ABOARD</p><h2>${d.title}</h2><p class="story">${d.story}</p><div class="choices">${d.choices.map((c,i)=>`<button class="choice" data-choice="${i}"><strong>${c[0]} →</strong><span>${c[1]}</span></button>`).join('')}</div><p class="muted">Daily essentials use 12 power. Scheduled charging restores 14 after Days 1–6. Below 15 power, essential systems struggle.</p></section>`;}
 app.innerHTML=`<div class="meters">${bars}</div>${content}`;
 app.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{state=decide(state,Number(b.dataset.choice));feedback=true;render();});
 const next=document.getElementById('next');if(next)next.onclick=()=>{feedback=false;render();};
 const restart=document.getElementById('restart');if(restart)restart.onclick=()=>{state=initial();feedback=false;render();};
 document.getElementById('focus')?.focus({preventScroll:true});
}render();


