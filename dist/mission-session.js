const SAVE_KEY = 'lunar-frontier-mission-v1';
export function saveMission(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({version:1, choices:state.log.map(item=>item.choiceIndex)}));
    return true;
  } catch { return false; }
}
export function loadMission(initial, decide) {
  try {
    const saved=JSON.parse(localStorage.getItem(SAVE_KEY));
    if(saved?.version!==1 || !Array.isArray(saved.choices) || saved.choices.length>7 || !saved.choices.every(index=>index===0||index===1)) return null;
    let state=initial();
    for(const index of saved.choices) {
      if(state.ended) return null;
      state=decide(state,index);
    }
    return state;
  } catch { return null; }
}
export function forecast(state,index,decide) {
  const next=decide(state,index);
  return `After this day: power ${next.power}, life support ${next.life}, safety ${next.safety}.`;
}
export function resourceHistory(state) {
  return '<h2>Your mission history</h2><table><thead><tr><th>Day</th><th>Power</th><th>Life support</th><th>Safety</th></tr></thead><tbody>'+state.log.map(item=>`<tr><th>${item.day}</th><td>${item.after?.power??'—'}</td><td>${item.after?.life??'—'}</td><td>${item.after?.safety??'—'}</td></tr>`).join('')+'</tbody></table>';
}
