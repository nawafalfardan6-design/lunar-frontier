export const opening = `<span class="kicker">NORA / CREW CHANNEL</span><h2>Seven days of food. Four people.</h2><p>The supply ship is late. Let’s keep Selene breathing until we can go home.</p><button id="launch">Get to the air recycler →</button>`;

export function companionAdvice(state) {
  if(state.ended) return state.life===0||state.safety===0 ? 'Mission control called an early return. We learned where the outpost needed more help. I’m ready to try again with you.' : 'All seven days are in the log. Let’s see what your choices made possible.';
  if(state.power<30) return 'Our battery is getting low. Check the forecast before choosing extra work. Air and water systems need energy every day.';
  if(state.life<45) return 'Maya is watching life support closely. A repair could give the crew more breathing room. Compare the next choices carefully.';
  const tips = [
    'That amber beacon marks life support. Walk over and press E, or use Remote assist. Repairing today can prevent a breakdown later.',
    'Two good jobs, one work period. Preparing the shelter helps during an alert. Tending the plants now makes a later harvest possible.',
    'The heater draws a lot of power. You can collect research again later, so look at what the battery can spare today.',
    'Everyone is taking shelter. We can pause the experiment, or keep it running remotely at an energy cost.',
    state.flags.includes('crop') ? 'You cared for the plants earlier. Their lights could bring us a small fresh harvest today. The packaged meals still cover our return.' : 'The plants missed their earlier care. Lights today will not finish the harvest. Compare that with helping life support.',
    state.flags.includes('research') ? 'Leo has findings ready. Sending them today completes the research goal. A final downlink is also available tomorrow.' : 'We have no research findings ready. A status call cannot complete that goal, but servicing the habitat can still help.',
    state.flags.includes('sent') ? 'Our findings are already home. Check the remaining reserves and decide how to finish safely.' : 'There is one final downlink. It can send existing findings, but safety checks may be more valuable if the habitat is struggling.',
  ];
  return tips[state.day];
}

export function companionReaction(state) {
  const choice=state.log.at(-1)?.choiceIndex;
  if(state.life===0||state.safety===0) return 'We reached a critical limit. I’m with you. Let’s review the decisions before our next expedition.';
  if(state.power<30) return 'We completed the job, but our battery margin is thin. I’ll flag it before our next decision.';
  switch(state.day){
    case 1: return choice===0 ? 'Maya says the air system sounds steadier already. That repair will matter later.' : 'Leo has the first results. We still need to remember that worn filter.';
    case 2: return choice===0 ? 'Sam has the shelter ready. Preparation is quiet work until the day you need it.' : 'Maya marked the plants in her notebook. Now they have a chance to reach harvest.';
    case 3: return state.flags.includes('filter') ? 'The air filter held up today because you serviced it earlier.' : 'That deferred filter repair caught up with us. It is in the log so we can plan around it.';
    case 4: return 'The crew stayed together through the alert. Let’s take stock before we spend more energy.';
    case 5: return state.flags.includes('food') ? 'Fresh leaves! A small harvest, and proof that your earlier care paid off.' : 'We still have our packaged meals. The next decision is about getting our work home.';
    case 6: return state.flags.includes('sent') ? 'Earth received our findings. Leo has been waiting all week for that message.' : 'One day remains. Check whether there are findings left to send.';
    default: return 'That was your final call, Commander. Every decision is in the report. Let’s look at the week we made together.';
  }
}

export function createCompanion(getState, show, close) {
  const button=document.createElement('button');
  button.id='ask-nora';
  button.innerHTML='<span class="companion-avatar" aria-hidden="true">N</span><span>Ask Nora<small>Need a hand?</small></span>';
  button.onclick=()=>{
    const state=getState();
    show(`<div class="companion-heading"><span class="companion-avatar" aria-hidden="true">N</span><div><strong>NORA</strong><small>Here when you need me</small></div></div><h2>Let’s take this one step at a time.</h2><p>${companionAdvice(state)}</p><p class="supply-note">${Math.max(0,7-state.day)} mission days of packaged meals remain. A crop harvest is a small bonus. This is the fictional mission’s supply plan.</p><button id="nora-close">Got it. I’m ready.</button>`);
    document.getElementById('nora-close').onclick=close;
  };
  document.body.append(button);
}
